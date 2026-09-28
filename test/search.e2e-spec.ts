import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { CodeSymbolEntity } from '../src/modules/indexing/entities/code-symbol.entity';
import { FileHashEntity } from '../src/modules/indexing/entities/file-hash.entity';
import { IndexJobEntity } from '../src/modules/indexing/entities/index-job.entity';
import { IndexedFileEntity } from '../src/modules/indexing/entities/indexed-file.entity';
import { CodeSymbolKind } from '../src/modules/indexing/enums/code-symbol-kind.enum';
import { CodeSymbolVisibility } from '../src/modules/indexing/enums/code-symbol-visibility.enum';
import { FileHashAlgorithm } from '../src/modules/indexing/enums/file-hash-algorithm.enum';
import { IndexedFileStatus } from '../src/modules/indexing/enums/indexed-file-status.enum';
import { IndexJobPhase } from '../src/modules/indexing/enums/index-job-phase.enum';
import { IndexJobStatus } from '../src/modules/indexing/enums/index-job-status.enum';
import { IndexJobTrigger } from '../src/modules/indexing/enums/index-job-trigger.enum';
import { IndexingMode } from '../src/modules/indexing/enums/indexing-mode.enum';
import { SourceLanguage } from '../src/modules/indexing/enums/source-language.enum';
import { KnowledgeBuildEntity } from '../src/modules/knowledge/entities/knowledge-build.entity';
import { KnowledgeBuildPhase } from '../src/modules/knowledge/enums/knowledge-build-phase.enum';
import { KnowledgeBuildStatus } from '../src/modules/knowledge/enums/knowledge-build-status.enum';
import { KnowledgeBuildTrigger } from '../src/modules/knowledge/enums/knowledge-build-trigger.enum';
import { KnowledgeDerivationType } from '../src/modules/knowledge/enums/knowledge-derivation-type.enum';
import { KnowledgeEvidenceRole } from '../src/modules/knowledge/enums/knowledge-evidence-role.enum';
import { KnowledgeNodeKind } from '../src/modules/knowledge/enums/knowledge-node-kind.enum';
import { KnowledgePersistenceService } from '../src/modules/knowledge/services/knowledge-persistence.service';
import {
  OrganizationEntity,
  OrganizationPlan,
  OrganizationStatus,
} from '../src/modules/organizations/entities/organization.entity';
import {
  BranchStatus,
  RepositoryBranchEntity,
} from '../src/modules/repositories/entities/repository-branch.entity';
import {
  RepositoryEntity,
  RepositoryProvider,
  RepositoryStatus,
  RepositorySyncStatus,
} from '../src/modules/repositories/entities/repository.entity';
import { GitRepositoryState } from '../src/modules/repositories/git/git.types';
import { SearchDocumentEntity } from '../src/modules/search/entities/search-document.entity';
import { SearchIndexEntity } from '../src/modules/search/entities/search-index.entity';
import { SearchIndexStatus } from '../src/modules/search/enums/search-index-status.enum';
import { SearchProjectionService } from '../src/modules/search/projection/search-projection.service';
import { resetE2eDatabase } from './support/database';
import { createE2eApplication, E2eGitService } from './support/e2e-application';

describe('Search projection (e2e)', () => {
  const targetCommitSha = '1'.repeat(40);
  const gitBlobOid = '2'.repeat(40);
  const source = Buffer.from(`
    export class DoctorScheduleService {
      calculateRoundingWindow(minutes: number): number {
        return Math.ceil(minutes / 15) * 15;
      }
    }
  `);
  let app: INestApplication;
  let dataSource: DataSource;
  let searchService: SearchProjectionService;
  let knowledgeService: KnowledgePersistenceService;

  beforeAll(async () => {
    const gitService: E2eGitService = {
      synchronizeRepository: jest.fn((): Promise<GitRepositoryState> =>
        Promise.resolve({
          workspacePath: '/tmp/codemind-search-e2e',
          defaultBranch: 'main',
          headCommitSha: targetCommitSha,
          sizeBytes: source.length,
          branches: [],
        }),
      ),
      readBlob: jest.fn(() =>
        Promise.resolve({ objectId: gitBlobOid, content: source }),
      ),
    };

    ({ app, dataSource } = await createE2eApplication(gitService));
    searchService = app.get(SearchProjectionService);
    knowledgeService = app.get(KnowledgePersistenceService);
  });

  beforeEach(async () => {
    await resetE2eDatabase(dataSource);
  });

  afterAll(async () => {
    try {
      if (dataSource?.isInitialized) {
        await resetE2eDatabase(dataSource);
      }
    } finally {
      if (app) {
        await app.close();
      }
    }
  });

  it('builds, publishes, reuses, and protects a source-grounded projection', async () => {
    const fixture = await createPublishedKnowledgeFixture();

    const built = await searchService.build({
      organizationId: fixture.organizationId,
      repositoryId: fixture.repositoryId,
      knowledgeSnapshotId: fixture.knowledgeSnapshotId,
    });

    expect(built).toMatchObject({
      repositoryId: fixture.repositoryId,
      branchId: fixture.branchId,
      knowledgeSnapshotId: fixture.knowledgeSnapshotId,
      sourceIndexJobId: fixture.indexJobId,
      targetCommitSha,
      isCurrent: true,
      reused: false,
      documentCount: 3,
      documents: {
        files: 1,
        symbols: 1,
        knowledgeNodes: 1,
        total: 3,
      },
    });

    const searchIndex = await dataSource
      .getRepository(SearchIndexEntity)
      .findOneByOrFail({ id: built.searchIndexId });
    expect(searchIndex).toMatchObject({
      status: SearchIndexStatus.Published,
      isCurrent: true,
      documentCount: 3,
    });

    const lexicalMatches = await dataSource.query<
      Array<{ title: string; sourceType: string }>
    >(
      `SELECT title, source_type AS "sourceType"
       FROM search_documents
       WHERE search_index_id = $1
         AND search_vector @@ plainto_tsquery('simple', 'rounding')
       ORDER BY source_type, title`,
      [built.searchIndexId],
    );
    expect(lexicalMatches).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ sourceType: 'file' }),
        expect.objectContaining({ sourceType: 'knowledge_node' }),
        expect.objectContaining({ sourceType: 'symbol' }),
      ]),
    );

    await expect(
      dataSource
        .getRepository(SearchDocumentEntity)
        .update(
          { searchIndexId: built.searchIndexId },
          { content: 'changed after publication' },
        ),
    ).rejects.toThrow('published search index content is immutable');

    const reused = await searchService.build({
      organizationId: fixture.organizationId,
      repositoryId: fixture.repositoryId,
      knowledgeSnapshotId: fixture.knowledgeSnapshotId,
    });
    expect(reused).toMatchObject({
      searchIndexId: built.searchIndexId,
      reused: true,
      documentCount: 3,
    });
  });

  async function createPublishedKnowledgeFixture(): Promise<{
    organizationId: string;
    repositoryId: number;
    branchId: number;
    indexJobId: number;
    knowledgeSnapshotId: number;
  }> {
    const organization = await dataSource
      .getRepository(OrganizationEntity)
      .save({
        name: 'Search E2E Organization',
        slug: `search-e2e-${randomUUID()}`,
        plan: OrganizationPlan.Free,
        status: OrganizationStatus.Active,
      });
    const repository = await dataSource.getRepository(RepositoryEntity).save({
      organizationId: organization.id,
      createdByUserId: null,
      name: 'Search E2E Repository',
      provider: RepositoryProvider.Generic,
      remoteUrl: `https://example.test/${randomUUID()}.git`,
      defaultBranch: 'main',
      status: RepositoryStatus.Active,
      lastSyncStatus: RepositorySyncStatus.Succeeded,
      lastSyncAttemptedAt: new Date(),
      lastSyncedAt: new Date(),
      repositorySizeBytes: source.length,
    });
    const branch = await dataSource.getRepository(RepositoryBranchEntity).save({
      repositoryId: repository.id,
      name: 'main',
      commitSha: targetCommitSha,
      status: BranchStatus.Active,
      lastIndexedAt: new Date(),
    });
    const indexJob = await dataSource.getRepository(IndexJobEntity).save({
      organizationId: organization.id,
      repositoryId: repository.id,
      branchId: branch.id,
      requestedByUserId: null,
      retryOfJobId: null,
      trigger: IndexJobTrigger.Manual,
      mode: IndexingMode.Incremental,
      status: IndexJobStatus.Succeeded,
      phase: IndexJobPhase.Finished,
      targetCommitSha,
      totalFiles: 1,
      processedFiles: 1,
      skippedFiles: 0,
      failedFiles: 0,
      processedSymbols: 1,
      processedDependencies: 0,
      attemptCount: 1,
      maxAttempts: 3,
      claimedBy: null,
      leaseToken: null,
      failureCode: null,
      failureMessage: null,
      startedAt: new Date(),
      completedAt: new Date(),
      lastHeartbeatAt: null,
      leaseExpiresAt: null,
      nextAttemptAt: null,
      cancellationRequestedAt: null,
      currentFile: null,
    });
    const indexedFile = await dataSource.getRepository(IndexedFileEntity).save({
      organizationId: organization.id,
      repositoryId: repository.id,
      branchId: branch.id,
      lastSeenJobId: indexJob.id,
      currentFileHashId: null,
      path: 'src/doctor-schedule.service.ts',
      extension: '.ts',
      language: SourceLanguage.TypeScript,
      sizeBytes: source.length,
      status: IndexedFileStatus.Active,
      lastSeenCommitSha: targetCommitSha,
    });
    const fileHash = await dataSource.getRepository(FileHashEntity).save({
      organizationId: organization.id,
      indexedFileId: indexedFile.id,
      observedByJobId: indexJob.id,
      analyzedByJobId: indexJob.id,
      algorithm: FileHashAlgorithm.Sha256,
      value: '3'.repeat(64),
      gitBlobOid,
      sizeBytes: source.length,
      analysisCompletedAt: new Date(),
    });
    await dataSource
      .getRepository(IndexedFileEntity)
      .update({ id: indexedFile.id }, { currentFileHashId: fileHash.id });
    const symbol = await dataSource.getRepository(CodeSymbolEntity).save({
      organizationId: organization.id,
      repositoryId: repository.id,
      branchId: branch.id,
      indexedFileId: indexedFile.id,
      fileHashId: fileHash.id,
      observedByJobId: indexJob.id,
      name: 'calculateRoundingWindow',
      qualifiedName: 'DoctorScheduleService.calculateRoundingWindow',
      kind: CodeSymbolKind.Method,
      visibility: CodeSymbolVisibility.Public,
      exported: false,
      defaultExport: false,
      signature: 'calculateRoundingWindow(minutes: number): number',
      documentation: 'Rounds schedule times to fifteen-minute windows.',
      startLine: 3,
      startColumn: 7,
      startOffset: 46,
      endLine: 5,
      endColumn: 8,
      endOffset: Math.min(source.length, 140),
    });
    const created = await knowledgeService.createBuild({
      organizationId: organization.id,
      repositoryId: repository.id,
      branchId: branch.id,
      sourceIndexJobId: indexJob.id,
      requestedByUserId: null,
      trigger: KnowledgeBuildTrigger.Manual,
      analyzerBundleVersion: 'search-e2e-v1',
      configurationDigest: '4'.repeat(64),
      maxAttempts: 3,
    });
    const leaseToken = randomUUID();
    const now = new Date();
    await dataSource.getRepository(KnowledgeBuildEntity).update(
      { id: created.buildId },
      {
        status: KnowledgeBuildStatus.Running,
        phase: KnowledgeBuildPhase.Analyzing,
        attemptCount: 1,
        claimedBy: 'search-e2e-worker',
        leaseToken,
        startedAt: now,
        lastHeartbeatAt: now,
        leaseExpiresAt: new Date(now.getTime() + 60_000),
      },
    );
    await knowledgeService.persistGraphBatch({
      organizationId: organization.id,
      repositoryId: repository.id,
      buildId: created.buildId,
      leaseToken,
      nodes: [
        {
          identityKey: 'rule:doctor-schedule-rounding',
          kind: KnowledgeNodeKind.BusinessRule,
          name: 'DoctorScheduleRoundingRule',
          summary: 'Doctor schedules use fifteen-minute rounding windows.',
          derivationType: KnowledgeDerivationType.Deterministic,
          confidence: 1,
          analyzerName: 'search-e2e-analyzer',
          analyzerVersion: '1.0.0',
          contentFingerprint: '5'.repeat(64),
          propertySchemaVersion: 1,
          properties: { intervalMinutes: 15 },
          evidence: [
            {
              indexedFileId: indexedFile.id,
              fileHashId: fileHash.id,
              codeSymbolId: symbol.id,
              role: KnowledgeEvidenceRole.Declaration,
              range: {
                startLine: 3,
                startColumn: 7,
                startOffset: 46,
                endLine: 5,
                endColumn: 8,
                endOffset: Math.min(source.length, 140),
              },
            },
          ],
        },
      ],
      edges: [],
    });
    await dataSource.getRepository(KnowledgeBuildEntity).update(
      { id: created.buildId },
      {
        phase: KnowledgeBuildPhase.Publishing,
        processedFiles: 1,
        currentFile: null,
      },
    );
    const published = await knowledgeService.publishSnapshot({
      organizationId: organization.id,
      repositoryId: repository.id,
      buildId: created.buildId,
      leaseToken,
    });

    return {
      organizationId: organization.id,
      repositoryId: repository.id,
      branchId: branch.id,
      indexJobId: indexJob.id,
      knowledgeSnapshotId: published.snapshotId,
    };
  }
});
