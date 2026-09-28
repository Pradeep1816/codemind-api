import { CodeSymbolKind } from '../../indexing/enums/code-symbol-kind.enum';
import { SourceLanguage } from '../../indexing/enums/source-language.enum';
import type { CodeIntelligenceFile } from '../../indexing/ports/code-intelligence-reader.port';
import { KnowledgeDerivationType } from '../../knowledge/enums/knowledge-derivation-type.enum';
import { KnowledgeNodeKind } from '../../knowledge/enums/knowledge-node-kind.enum';
import { KnowledgeSnapshotStatus } from '../../knowledge/enums/knowledge-snapshot-status.enum';
import { KnowledgeQueryService } from '../../knowledge/services/knowledge-query.service';
import { SearchIndexStatus } from '../enums/search-index-status.enum';
import { SearchDocumentBuilderService } from './search-document-builder.service';
import { SearchProjectionRepository } from './search-projection.repository';
import { SearchProjectionService } from './search-projection.service';
import { SearchDocumentInput } from './search-projection.types';

describe('SearchProjectionService', () => {
  const organizationId = '8da12c58-f008-43f3-8d43-87a6aafd36f4';
  const targetCommitSha = 'a'.repeat(40);
  const publishedAt = new Date('2026-09-28T08:00:00.000Z');
  const configuration = {
    indexerVersion: 'phase5-v1',
    persistenceBatchSize: 2,
    maxDocuments: 100,
    maxDocumentContentBytes: 4_096,
    maxTotalContentBytes: 100_000,
    maxQueryLength: 200,
    maxResultsPerPage: 100,
  };

  it('builds file, symbol, and knowledge documents before atomic publication', async () => {
    const file = codeFile();
    const repository = projectionRepository();
    const service = createService({ repository, files: [file] });

    const result = await service.build({
      organizationId,
      repositoryId: 2,
      knowledgeSnapshotId: 8,
    });

    expect(repository.resetDraft).toHaveBeenCalledWith(11);
    expect(repository.persistDocuments).toHaveBeenCalledTimes(2);
    expect(repository.publish).toHaveBeenCalledWith(11);
    expect(result).toMatchObject({
      searchIndexId: 11,
      repositoryId: 2,
      branchId: 3,
      knowledgeSnapshotId: 8,
      sourceIndexJobId: 7,
      targetCommitSha,
      indexerVersion: 'phase5-v1',
      reused: false,
      documents: {
        files: 1,
        symbols: 1,
        knowledgeNodes: 1,
        total: 3,
      },
    });
    expect(
      repository.persistedDocuments.map((document) => document.sourceType),
    ).toEqual(['file', 'symbol', 'knowledge_node']);
  });

  it('reuses an already published projection without reading source again', async () => {
    const repository = projectionRepository({
      status: SearchIndexStatus.Published,
      isCurrent: true,
      documentCount: 3,
      publishedAt,
    });
    const codeReader = codeIntelligenceReader([]);
    const sourceReader = immutableSourceReader();
    const service = createService({ repository, codeReader, sourceReader });

    const result = await service.build({
      organizationId,
      repositoryId: 2,
      knowledgeSnapshotId: 8,
    });

    expect(result.reused).toBe(true);
    expect(repository.countDocuments).toHaveBeenCalledWith(11);
    expect(codeReader.streamFiles).not.toHaveBeenCalled();
    expect(sourceReader.read).not.toHaveBeenCalled();
    expect(repository.resetDraft).not.toHaveBeenCalled();
    expect(repository.publish).not.toHaveBeenCalled();
  });

  it('rejects code and knowledge snapshots from different commits', async () => {
    const codeReader = codeIntelligenceReader([]);
    codeReader.getSnapshot.mockResolvedValue({
      organizationId,
      repositoryId: 2,
      branchId: 3,
      indexJobId: 7,
      targetCommitSha: 'b'.repeat(40),
      totalFiles: 0,
      completedAt: new Date(),
    });
    const repository = projectionRepository();
    const service = createService({ repository, codeReader });

    await expect(
      service.build({
        organizationId,
        repositoryId: 2,
        knowledgeSnapshotId: 8,
      }),
    ).rejects.toThrow(
      'Search projection sources do not reference the same code snapshot',
    );
    expect(repository.withBuildLock).not.toHaveBeenCalled();
  });

  function createService(options: {
    repository: ReturnType<typeof projectionRepository>;
    files?: CodeIntelligenceFile[];
    codeReader?: ReturnType<typeof codeIntelligenceReader>;
    sourceReader?: ReturnType<typeof immutableSourceReader>;
  }): SearchProjectionService {
    const knowledgeService = knowledgeQueryService();

    return new SearchProjectionService(
      configuration,
      options.codeReader ?? codeIntelligenceReader(options.files ?? []),
      options.sourceReader ?? immutableSourceReader(),
      knowledgeService as unknown as KnowledgeQueryService,
      new SearchDocumentBuilderService(),
      options.repository as unknown as SearchProjectionRepository,
    );
  }

  function projectionRepository(
    indexOverrides: Partial<{
      status: SearchIndexStatus;
      isCurrent: boolean;
      documentCount: number;
      publishedAt: Date | null;
    }> = {},
  ) {
    const persistedDocuments: SearchDocumentInput[] = [];

    return {
      persistedDocuments,
      withBuildLock: jest.fn(
        async (_branchId: number, work: () => Promise<unknown>) => work(),
      ),
      createOrFindIndex: jest.fn().mockResolvedValue({
        id: 11,
        status: SearchIndexStatus.Draft,
        isCurrent: false,
        documentCount: 0,
        publishedAt: null,
        ...indexOverrides,
      }),
      resetDraft: jest.fn().mockResolvedValue(undefined),
      persistDocuments: jest.fn(
        (_searchIndexId: number, documents: SearchDocumentInput[]) => {
          persistedDocuments.push(...documents);
          return Promise.resolve();
        },
      ),
      publish: jest.fn().mockResolvedValue({
        searchIndexId: 11,
        isCurrent: true,
        documentCount: 3,
        publishedAt,
      }),
      countDocuments: jest.fn().mockResolvedValue({
        files: 1,
        symbols: 1,
        knowledgeNodes: 1,
        total: 3,
      }),
    };
  }

  function codeIntelligenceReader(files: CodeIntelligenceFile[]) {
    return {
      getSnapshot: jest.fn().mockResolvedValue({
        organizationId,
        repositoryId: 2,
        branchId: 3,
        indexJobId: 7,
        targetCommitSha,
        totalFiles: files.length,
        completedAt: new Date(),
      }),
      streamFiles: jest.fn(() =>
        (async function* () {
          await Promise.resolve();

          for (const file of files) {
            yield file;
          }
        })(),
      ),
    };
  }

  function immutableSourceReader() {
    return {
      read: jest.fn().mockResolvedValue({
        indexedFileId: 10,
        fileHashId: 20,
        path: 'src/doctor-schedule.service.ts',
        gitBlobOid: 'c'.repeat(40),
        sizeBytes: 40,
        content: 'export class DoctorScheduleService {}',
      }),
    };
  }

  function knowledgeQueryService() {
    return {
      findSnapshot: jest.fn().mockResolvedValue({
        id: 8,
        repositoryId: 2,
        branchId: 3,
        knowledgeBuildId: 9,
        sourceIndexJobId: 7,
        targetCommitSha,
        analyzerBundleVersion: 'phase4-v3',
        configurationDigest: 'd'.repeat(64),
        status: KnowledgeSnapshotStatus.Published,
        isCurrent: true,
        publishedAt: publishedAt.toISOString(),
        supersededAt: null,
        createdAt: publishedAt.toISOString(),
        graph: { nodes: 1, edges: 0 },
      }),
      listNodes: jest.fn().mockResolvedValue({
        data: [
          {
            id: 50,
            identityKey: 'rule:doctor-schedule',
            kind: KnowledgeNodeKind.BusinessRule,
            name: 'DoctorScheduleRule',
            summary: 'Doctors are scheduled in fixed windows.',
            derivationType: KnowledgeDerivationType.Deterministic,
            confidence: 1,
            analyzerName: 'typescript-business',
            analyzerVersion: '1.0.0',
            contentFingerprint: 'e'.repeat(64),
            propertySchemaVersion: 1,
            properties: { intervalMinutes: 15 },
            createdAt: publishedAt.toISOString(),
          },
        ],
        pagination: { page: 1, limit: 100, total: 1, totalPages: 1 },
      }),
    };
  }

  function codeFile(): CodeIntelligenceFile {
    return {
      id: 10,
      path: 'src/doctor-schedule.service.ts',
      extension: '.ts',
      language: SourceLanguage.TypeScript,
      sizeBytes: 40,
      hash: {
        id: 20,
        sha256: 'b'.repeat(64),
        gitBlobOid: 'c'.repeat(40),
        sizeBytes: 40,
      },
      symbols: [
        {
          id: 30,
          indexedFileId: 10,
          fileHashId: 20,
          name: 'DoctorScheduleService',
          qualifiedName: 'DoctorScheduleService',
          kind: CodeSymbolKind.Class,
          visibility: null,
          exported: true,
          defaultExport: false,
          signature: 'class DoctorScheduleService',
          documentation: null,
          startLine: 1,
          startColumn: 1,
          startOffset: 0,
          endLine: 1,
          endColumn: 38,
          endOffset: 38,
        },
      ],
      dependencies: [],
    };
  }
});
