import { ParsedExportKind } from '../../parser/enums/parsed-export-kind.enum';
import { ParseSourceResult } from '../../parser/types/parser.types';
import { CodeDependencyKind } from '../enums/code-dependency-kind.enum';
import { SourceLanguage } from '../enums/source-language.enum';
import { SourceParsingService } from '../parsing/source-parsing.service';
import { SymbolExtractionService } from '../symbols/symbol-extraction.service';
import { CodeDependenciesRepository } from './code-dependencies.repository';
import {
  DependencyExtractionError,
  DependencyExtractionErrorCode,
} from './dependency-extraction.errors';
import { DependencyExtractionService } from './dependency-extraction.service';
import { ExtractAndPersistDependenciesInput } from './dependency-extraction.types';
import { RelativeModuleResolverService } from './relative-module-resolver.service';

describe('DependencyExtractionService', () => {
  const input: ExtractAndPersistDependenciesInput = {
    organizationId: '5abf1e5e-e03c-4890-83a5-c4e84ad48d18',
    repositoryId: 2,
    branchId: 3,
    indexJobId: 4,
    leaseToken: 'lease-token',
    targetCommitSha: '8e008e725d9e411c5bff3a713b91afeaf4613f13',
    indexedFileId: 5,
    fileHashId: 6,
    path: 'src/doctor.service.ts',
    language: SourceLanguage.TypeScript,
    extension: 'ts',
    gitBlobOid: 'a'.repeat(40),
    expectedSizeBytes: 100,
  };
  const range = {
    start: { line: 1, column: 1, offset: 0 },
    end: { line: 1, column: 40, offset: 39 },
  };

  function parsedResult(): ParseSourceResult {
    return {
      indexedFileId: input.indexedFileId,
      fileHashId: input.fileHashId,
      path: input.path,
      language: input.language,
      extension: input.extension,
      symbols: [],
      imports: [
        {
          moduleSpecifier: './doctor.repository',
          defaultImport: null,
          namespaceImport: null,
          namedImports: [
            {
              importedName: 'DoctorRepository',
              localName: 'DoctorRepository',
              typeOnly: false,
              range,
            },
          ],
          typeOnly: false,
          range,
        },
        {
          moduleSpecifier: 'typeorm',
          defaultImport: null,
          namespaceImport: null,
          namedImports: [],
          typeOnly: false,
          range: {
            start: { line: 2, column: 1, offset: 40 },
            end: { line: 2, column: 20, offset: 59 },
          },
        },
      ],
      exports: [
        {
          kind: ParsedExportKind.Named,
          exportedName: 'DoctorRepository',
          localName: 'DoctorRepository',
          moduleSpecifier: './doctor.repository',
          typeOnly: false,
          range: {
            start: { line: 3, column: 1, offset: 60 },
            end: { line: 3, column: 30, offset: 89 },
          },
        },
      ],
      relationships: [],
      diagnostics: [],
      hasSyntaxErrors: false,
    };
  }

  function createService(options?: {
    parsed?: ParseSourceResult;
    persistence?: object | null;
    maxDependenciesPerFile?: number;
  }) {
    const sourceParsingService = {
      parseFile: jest.fn().mockResolvedValue(options?.parsed ?? parsedResult()),
    };
    const codeDependenciesRepository = {
      findResolutionFiles: jest.fn().mockResolvedValue([
        {
          indexedFileId: 7,
          fileHashId: 8,
          path: 'src/doctor.repository.ts',
        },
      ]),
      findSymbolsByFileHashes: jest.fn().mockResolvedValue([
        {
          id: 9,
          indexedFileId: 7,
          fileHashId: 8,
          name: 'DoctorRepository',
          qualifiedName: 'DoctorRepository',
          kind: 'class',
          exported: true,
          defaultExport: false,
          startOffset: 0,
        },
      ]),
      persistFileVersion: jest.fn().mockResolvedValue(
        options?.persistence === undefined
          ? {
              createdDependencies: 3,
              updatedDependencies: 0,
              removedDependencies: 0,
            }
          : options.persistence,
      ),
    };
    const service = new DependencyExtractionService(
      {
        maxDependenciesPerFile: options?.maxDependenciesPerFile ?? 10,
      } as never,
      sourceParsingService as unknown as SourceParsingService,
      {} as SymbolExtractionService,
      codeDependenciesRepository as unknown as CodeDependenciesRepository,
      new RelativeModuleResolverService(),
    );

    return { service, codeDependenciesRepository };
  }

  it('resolves local file and symbol targets while preserving packages', async () => {
    const { service, codeDependenciesRepository } = createService();

    await expect(
      service.extractDependenciesAndPersist(input),
    ).resolves.toMatchObject({
      parsedDependencies: 3,
      fileResolvedDependencies: 2,
      symbolResolvedDependencies: 2,
      unresolvedDependencies: 1,
    });
    const [persistenceInput] = codeDependenciesRepository.persistFileVersion
      .mock.calls[0] as unknown as [
      { dependencies: Array<Record<string, unknown>> },
    ];
    expect(persistenceInput.dependencies).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: CodeDependencyKind.Import,
          moduleSpecifier: './doctor.repository',
          targetIndexedFileId: 7,
          targetFileHashId: 8,
          targetSymbolId: 9,
        }),
        expect.objectContaining({
          kind: CodeDependencyKind.Import,
          moduleSpecifier: 'typeorm',
          targetIndexedFileId: null,
          targetSymbolId: null,
        }),
        expect.objectContaining({
          kind: CodeDependencyKind.Export,
          targetIndexedFileId: 7,
          targetSymbolId: 9,
        }),
      ]),
    );
    for (const dependency of persistenceInput.dependencies) {
      expect(dependency.identityHash).toMatch(/^[0-9a-f]{64}$/u);
    }
  });

  it('rejects parser identity drift and dependency overflow', async () => {
    const mismatched = parsedResult();
    mismatched.fileHashId = 99;
    await expect(
      createService({
        parsed: mismatched,
      }).service.extractDependenciesAndPersist(input),
    ).rejects.toMatchObject<Partial<DependencyExtractionError>>({
      code: DependencyExtractionErrorCode.ParserIdentityMismatch,
    });

    await expect(
      createService({
        maxDependenciesPerFile: 1,
      }).service.extractDependenciesAndPersist(input),
    ).rejects.toMatchObject<Partial<DependencyExtractionError>>({
      code: DependencyExtractionErrorCode.TooManyDependencies,
    });
  });

  it('rejects persistence after worker ownership is lost', async () => {
    await expect(
      createService({
        persistence: null,
      }).service.extractDependenciesAndPersist(input),
    ).rejects.toMatchObject<Partial<DependencyExtractionError>>({
      code: DependencyExtractionErrorCode.PersistenceOwnershipLost,
    });
  });
});
