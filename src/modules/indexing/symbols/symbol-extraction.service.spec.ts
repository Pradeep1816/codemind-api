import { ParsedSymbolKind } from '../../parser/enums/parsed-symbol-kind.enum';
import { ParsedSymbolVisibility } from '../../parser/enums/parsed-symbol-visibility.enum';
import { ParseSourceResult } from '../../parser/types/parser.types';
import { CodeSymbolKind } from '../enums/code-symbol-kind.enum';
import { CodeSymbolVisibility } from '../enums/code-symbol-visibility.enum';
import { SourceLanguage } from '../enums/source-language.enum';
import { SourceParsingService } from '../parsing/source-parsing.service';
import { CodeSymbolsRepository } from './code-symbols.repository';
import {
  SymbolExtractionError,
  SymbolExtractionErrorCode,
} from './symbol-extraction.errors';
import { SymbolExtractionService } from './symbol-extraction.service';
import { ExtractAndPersistSymbolsInput } from './symbol-extraction.types';

describe('SymbolExtractionService', () => {
  const input: ExtractAndPersistSymbolsInput = {
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

  function parsedResult(): ParseSourceResult {
    return {
      indexedFileId: input.indexedFileId,
      fileHashId: input.fileHashId,
      path: input.path,
      language: input.language,
      extension: input.extension,
      symbols: [
        {
          name: 'DoctorService',
          qualifiedName: 'DoctorService',
          kind: ParsedSymbolKind.Class,
          visibility: null,
          exported: true,
          defaultExport: false,
          signature: 'export class DoctorService',
          documentation: 'Coordinates doctors.',
          range: {
            start: { line: 1, column: 1, offset: 0 },
            end: { line: 10, column: 2, offset: 100 },
          },
        },
        {
          name: 'schedule',
          qualifiedName: 'DoctorService.schedule',
          kind: ParsedSymbolKind.Method,
          visibility: ParsedSymbolVisibility.Private,
          exported: false,
          defaultExport: false,
          signature: 'private schedule(): void',
          documentation: null,
          range: {
            start: { line: 2, column: 3, offset: 20 },
            end: { line: 4, column: 4, offset: 60 },
          },
        },
      ],
      imports: [],
      exports: [],
      relationships: [],
      diagnostics: [],
      hasSyntaxErrors: false,
    };
  }

  function createService(options?: {
    parsed?: ParseSourceResult;
    persistence?: object | null;
    maxSymbolsPerFile?: number;
  }) {
    const parsed = options?.parsed ?? parsedResult();
    const sourceParsingService = {
      parseFile: jest.fn().mockResolvedValue(parsed),
    };
    const codeSymbolsRepository = {
      persistFileVersion: jest
        .fn()
        .mockResolvedValue(
          options?.persistence === undefined
            ? { createdSymbols: 2, updatedSymbols: 0, removedSymbols: 0 }
            : options.persistence,
        ),
    };

    return {
      service: new SymbolExtractionService(
        { maxSymbolsPerFile: options?.maxSymbolsPerFile ?? 10 } as never,
        sourceParsingService as unknown as SourceParsingService,
        codeSymbolsRepository as unknown as CodeSymbolsRepository,
      ),
      codeSymbolsRepository,
    };
  }

  it('maps parser symbols to bounded persistence records', async () => {
    const { service, codeSymbolsRepository } = createService();

    await expect(service.extractAndPersist(input)).resolves.toMatchObject({
      parsedSymbols: 2,
      createdSymbols: 2,
      hasSyntaxErrors: false,
    });
    expect(codeSymbolsRepository.persistFileVersion).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: input.organizationId,
        repositoryId: input.repositoryId,
        indexedFileId: input.indexedFileId,
        fileHashId: input.fileHashId,
        symbols: [
          expect.objectContaining({
            kind: CodeSymbolKind.Class,
            qualifiedName: 'DoctorService',
          }),
          expect.objectContaining({
            kind: CodeSymbolKind.Method,
            visibility: CodeSymbolVisibility.Private,
            qualifiedName: 'DoctorService.schedule',
          }),
        ],
      }),
    );
  });

  it('rejects parser identity drift and duplicate symbol identities', async () => {
    const mismatched = parsedResult();
    mismatched.path = 'src/other.ts';
    await expect(
      createService().service.persistParsed(input, mismatched),
    ).rejects.toMatchObject<Partial<SymbolExtractionError>>({
      code: SymbolExtractionErrorCode.ParserIdentityMismatch,
    });

    const duplicate = parsedResult();
    duplicate.symbols.push({ ...duplicate.symbols[0] });
    await expect(
      createService().service.persistParsed(input, duplicate),
    ).rejects.toMatchObject<Partial<SymbolExtractionError>>({
      code: SymbolExtractionErrorCode.DuplicateSymbolIdentity,
    });
  });

  it('enforces the symbol limit and lease-owned persistence', async () => {
    await expect(
      createService({ maxSymbolsPerFile: 1 }).service.persistParsed(
        input,
        parsedResult(),
      ),
    ).rejects.toMatchObject<Partial<SymbolExtractionError>>({
      code: SymbolExtractionErrorCode.TooManySymbols,
    });
    await expect(
      createService({ persistence: null }).service.persistParsed(
        input,
        parsedResult(),
      ),
    ).rejects.toMatchObject<Partial<SymbolExtractionError>>({
      code: SymbolExtractionErrorCode.PersistenceOwnershipLost,
    });
  });
});
