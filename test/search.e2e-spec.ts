import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import type { App } from 'supertest/types';
import { CodeDependencyEntity } from '../src/modules/indexing/entities/code-dependency.entity';
import { CodeSymbolEntity } from '../src/modules/indexing/entities/code-symbol.entity';
import { FileHashEntity } from '../src/modules/indexing/entities/file-hash.entity';
import { IndexJobEntity } from '../src/modules/indexing/entities/index-job.entity';
import { IndexedFileEntity } from '../src/modules/indexing/entities/indexed-file.entity';
import { CodeSymbolKind } from '../src/modules/indexing/enums/code-symbol-kind.enum';
import { CodeSymbolVisibility } from '../src/modules/indexing/enums/code-symbol-visibility.enum';
import { CodeDependencyKind } from '../src/modules/indexing/enums/code-dependency-kind.enum';
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
import { KnowledgeEdgeKind } from '../src/modules/knowledge/enums/knowledge-edge-kind.enum';
import { KnowledgeNodeKind } from '../src/modules/knowledge/enums/knowledge-node-kind.enum';
import { KnowledgePersistenceService } from '../src/modules/knowledge/services/knowledge-persistence.service';
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
import { SearchDocumentSourceType } from '../src/modules/search/enums/search-document-source-type.enum';
import { SearchIndexStatus } from '../src/modules/search/enums/search-index-status.enum';
import { SearchProjectionService } from '../src/modules/search/projection/search-projection.service';
import type { SearchProjectionResult } from '../src/modules/search/projection/search-projection.types';
import { SearchQueryService } from '../src/modules/search/query/search-query.service';
import type { SearchQueryResult } from '../src/modules/search/query/search-query.types';
import { inviteAcceptAndLogin, registerAndLoginOwner } from './support/auth';
import { resetE2eDatabase } from './support/database';
import { createE2eApplication, E2eGitService } from './support/e2e-application';

describe('Search projection (e2e)', () => {
  const smallFixtureBuildBudgetMs = 10_000;
  const smallFixtureQueryBudgetMs = 2_000;
  const largeFixtureFileCount = 5_000;
  const largeFixtureBuildBudgetMs = 60_000;
  const largeFixtureQueryBudgetMs = 2_000;
  const targetCommitSha = '1'.repeat(40);
  const gitBlobOid = '2'.repeat(40);
  const nextTargetCommitSha = '9'.repeat(40);
  const nextGitBlobOid = 'a'.repeat(40);
  const source = Buffer.from(`
    export class DoctorScheduleService {
      calculateRoundingWindow(minutes: number): number {
        return Math.ceil(minutes / 15) * 15;
      }
    }
  `);
  const nextSource = Buffer.from(`
    export class DoctorScheduleService {
      calculateAvailabilityWindow(minutes: number): number {
        return Math.floor(minutes / 30) * 30;
      }
    }
  `);
  const sourceByBlobOid = new Map<string, Buffer>();
  let failingBlobOid: string | null = null;
  let app: INestApplication;
  let dataSource: DataSource;
  let httpServer: App;
  let searchService: SearchProjectionService;
  let searchQueryService: SearchQueryService;
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
      readBlob: jest.fn(
        (
          _organizationId: string,
          _repositoryId: number,
          _commitSha: string,
          requestedBlobOid: string,
        ) => {
          if (requestedBlobOid === failingBlobOid) {
            return Promise.reject(
              new Error('Forced search projection failure'),
            );
          }

          const content = sourceByBlobOid.get(requestedBlobOid);

          if (!content) {
            return Promise.reject(new Error('E2E Git blob was not found'));
          }

          return Promise.resolve({ objectId: requestedBlobOid, content });
        },
      ),
    };

    ({ app, dataSource, httpServer } = await createE2eApplication(gitService));
    searchService = app.get(SearchProjectionService);
    searchQueryService = app.get(SearchQueryService);
    knowledgeService = app.get(KnowledgePersistenceService);
  });

  beforeEach(async () => {
    failingBlobOid = null;
    sourceByBlobOid.clear();
    sourceByBlobOid.set(gitBlobOid, source);
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
    const runIdentity = `search-${Date.now().toString(36)}`;
    const owner = await registerAndLoginOwner(httpServer, runIdentity);
    const fixture = await createPublishedKnowledgeFixture(
      owner.organizationId,
      owner.userId,
    );

    await request(httpServer)
      .post(`/api/v1/repositories/${fixture.repositoryId}/search/indexes`)
      .send({ branchId: fixture.branchId })
      .expect(401);

    await request(httpServer)
      .post(`/api/v1/repositories/${fixture.repositoryId}/search/indexes`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ branchId: 0 })
      .expect(400);

    const buildStartedAt = performance.now();
    const buildResponse = await request(httpServer)
      .post(`/api/v1/repositories/${fixture.repositoryId}/search/indexes`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ branchId: fixture.branchId })
      .expect(201);
    expect(performance.now() - buildStartedAt).toBeLessThan(
      smallFixtureBuildBudgetMs,
    );
    const built = buildResponse.body as {
      searchIndexId: number;
      repositoryId: number;
      branchId: number;
      knowledgeSnapshotId: number;
      sourceIndexJobId: number;
      targetCommitSha: string;
      isCurrent: boolean;
      reused: boolean;
      documentCount: number;
      documents: {
        files: number;
        symbols: number;
        knowledgeNodes: number;
        total: number;
      };
    };

    expect(built).toMatchObject({
      repositoryId: fixture.repositoryId,
      branchId: fixture.branchId,
      knowledgeSnapshotId: fixture.knowledgeSnapshotId,
      sourceIndexJobId: fixture.indexJobId,
      targetCommitSha,
      isCurrent: true,
      reused: false,
      documentCount: 4,
      documents: {
        files: 1,
        symbols: 1,
        knowledgeNodes: 2,
        total: 4,
      },
    });

    const searchIndex = await dataSource
      .getRepository(SearchIndexEntity)
      .findOneByOrFail({ id: built.searchIndexId });
    expect(searchIndex).toMatchObject({
      status: SearchIndexStatus.Published,
      isCurrent: true,
      documentCount: 4,
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
      documentCount: 4,
    });

    const exact = await searchQueryService.search({
      organizationId: fixture.organizationId,
      repositoryId: fixture.repositoryId,
      branchId: fixture.branchId,
      query: 'calculateRoundingWindow',
    });
    expect(exact.data[0]).toMatchObject({
      sourceType: 'symbol',
      title: 'DoctorScheduleService.calculateRoundingWindow',
      match: { exactIdentifier: true, lexical: true },
    });
    expect(typeof exact.data[0]?.source.codeSymbolId).toBe('number');
    expect(exact.query.normalized).toBe('calculate rounding window');
    expect(typeof exact.data[0]?.ranking.lexicalScore).toBe('number');
    expect(typeof exact.data[0]?.ranking.graphScore).toBe('number');
    expect(exact.data[0]?.ranking.totalScore).toBe(exact.data[0]?.score);
    const exactIdentifierSignal = exact.data[0]?.ranking.signals.find(
      (signal) => signal.name === 'exactIdentifier',
    );
    expect(exactIdentifierSignal).toMatchObject({
      source: 'exact',
      name: 'exactIdentifier',
      contribution: 120,
    });

    const qualityCorpus = [
      {
        query: 'calculateRoundingWindow',
        expectedTitle: 'DoctorScheduleService.calculateRoundingWindow',
        expectedSourceType: SearchDocumentSourceType.Symbol,
      },
      {
        query: 'src/doctor-schedule.service.ts',
        expectedTitle: 'src/doctor-schedule.service.ts',
        expectedSourceType: SearchDocumentSourceType.File,
      },
      {
        query: 'DoctorScheduleRoundingRule',
        expectedTitle: 'DoctorScheduleRoundingRule',
        expectedSourceType: SearchDocumentSourceType.KnowledgeNode,
      },
      {
        query: 'ScheduleWindow',
        expectedTitle: 'ScheduleWindow',
        expectedSourceType: SearchDocumentSourceType.KnowledgeNode,
      },
    ] as const;

    for (const qualityCase of qualityCorpus) {
      const qualityResult = await searchQueryService.search({
        organizationId: fixture.organizationId,
        repositoryId: fixture.repositoryId,
        branchId: fixture.branchId,
        query: qualityCase.query,
      });

      expect(qualityResult.data[0]).toMatchObject({
        title: qualityCase.expectedTitle,
        sourceType: qualityCase.expectedSourceType,
      });
    }
    expect(new Set(exact.data.map((item) => item.id)).size).toBe(
      exact.data.length,
    );
    expect(exact.ranking.candidateCount).toBeGreaterThanOrEqual(
      exact.ranking.deduplicatedCount,
    );
    const codeNeighbor = exact.graphExpansion.data.find(
      (candidate) =>
        candidate.document.title === 'src/doctor-schedule.service.ts',
    );
    expect(codeNeighbor).toMatchObject({
      document: {
        sourceType: SearchDocumentSourceType.File,
        title: 'src/doctor-schedule.service.ts',
      },
      relationship: {
        source: 'code_dependency',
        kind: 'import',
        direction: 'outgoing',
        depth: 1,
      },
    });

    const filtered = await searchQueryService.search({
      organizationId: fixture.organizationId,
      repositoryId: fixture.repositoryId,
      branchId: fixture.branchId,
      query: 'rounding',
      sourceType: SearchDocumentSourceType.KnowledgeNode,
      page: 1,
      limit: 1,
    });
    expect(filtered.data).toHaveLength(1);
    expect(filtered.data[0]).toMatchObject({
      sourceType: 'knowledge_node',
      title: 'DoctorScheduleRoundingRule',
    });
    expect(filtered.pagination).toEqual({
      page: 1,
      limit: 1,
      total: 1,
      totalPages: 1,
    });
    const knowledgeNeighbor = filtered.graphExpansion.data.find(
      (candidate) => candidate.document.title === 'ScheduleWindow',
    );
    expect(knowledgeNeighbor).toMatchObject({
      document: {
        sourceType: SearchDocumentSourceType.KnowledgeNode,
        title: 'ScheduleWindow',
      },
      relationship: {
        source: 'knowledge_edge',
        kind: 'represents',
        direction: 'outgoing',
        depth: 1,
      },
    });

    await request(httpServer)
      .get(`/api/v1/repositories/${fixture.repositoryId}/search`)
      .query({ branchId: fixture.branchId, query: 'rounding' })
      .expect(401);

    await request(httpServer)
      .get(`/api/v1/repositories/${fixture.repositoryId}/search`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .query({
        branchId: fixture.branchId,
        query: 'rounding',
        organizationId: owner.organizationId,
      })
      .expect(400);

    const queryStartedAt = performance.now();
    const apiResponse = await request(httpServer)
      .get(`/api/v1/repositories/${fixture.repositoryId}/search`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .query({
        branchId: fixture.branchId,
        query: 'calculateRoundingWindow',
        sourceType: SearchDocumentSourceType.Symbol,
        language: SourceLanguage.TypeScript,
        kind: CodeSymbolKind.Method,
        page: 1,
        limit: 10,
      })
      .expect(200);
    expect(performance.now() - queryStartedAt).toBeLessThan(
      smallFixtureQueryBudgetMs,
    );
    const apiResult = apiResponse.body as SearchQueryResult;

    expect(apiResult.searchIndex).not.toHaveProperty('organizationId');
    expect(apiResult.data[0]).toMatchObject({
      sourceType: SearchDocumentSourceType.Symbol,
      title: 'DoctorScheduleService.calculateRoundingWindow',
      match: { exactIdentifier: true },
      ranking: { totalScore: apiResult.data[0]?.score },
    });
    expect(apiResult.searchIndex).toMatchObject({
      repositoryId: fixture.repositoryId,
      branchId: fixture.branchId,
    });

    const foreignOwner = await registerAndLoginOwner(
      httpServer,
      `${runIdentity}-foreign`,
    );
    await request(httpServer)
      .get(`/api/v1/repositories/${fixture.repositoryId}/search`)
      .set('Authorization', `Bearer ${foreignOwner.accessToken}`)
      .query({ branchId: fixture.branchId, query: 'rounding' })
      .expect(404);
    await request(httpServer)
      .post(`/api/v1/repositories/${fixture.repositoryId}/search/indexes`)
      .set('Authorization', `Bearer ${foreignOwner.accessToken}`)
      .send({ branchId: fixture.branchId })
      .expect(404);
  });

  it('enforces the search permission matrix and lifecycle boundaries', async () => {
    const runIdentity = `search-security-${Date.now().toString(36)}`;
    const owner = await registerAndLoginOwner(httpServer, runIdentity);
    const fixture = await createPublishedKnowledgeFixture(
      owner.organizationId,
      owner.userId,
    );

    const firstBuild = await request(httpServer)
      .post(`/api/v1/repositories/${fixture.repositoryId}/search/indexes`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ branchId: fixture.branchId })
      .expect(201);
    expect(firstBuild.body).toMatchObject({ reused: false, isCurrent: true });

    const admin = await inviteAcceptAndLogin(
      httpServer,
      owner.accessToken,
      `${runIdentity}-admin`,
      'ADMIN',
    );
    const developer = await inviteAcceptAndLogin(
      httpServer,
      owner.accessToken,
      `${runIdentity}-developer`,
      'DEVELOPER',
    );
    const viewer = await inviteAcceptAndLogin(
      httpServer,
      owner.accessToken,
      `${runIdentity}-viewer`,
      'VIEWER',
    );

    for (const identity of [owner, admin, developer, viewer]) {
      await request(httpServer)
        .get(`/api/v1/repositories/${fixture.repositoryId}/search`)
        .set('Authorization', `Bearer ${identity.accessToken}`)
        .query({ branchId: fixture.branchId, query: 'rounding' })
        .expect(200);
    }

    for (const identity of [owner, admin, developer]) {
      const reused = await request(httpServer)
        .post(`/api/v1/repositories/${fixture.repositoryId}/search/indexes`)
        .set('Authorization', `Bearer ${identity.accessToken}`)
        .send({ branchId: fixture.branchId })
        .expect(201);
      expect(reused.body).toMatchObject({ reused: true, isCurrent: true });
    }

    await request(httpServer)
      .post(`/api/v1/repositories/${fixture.repositoryId}/search/indexes`)
      .set('Authorization', `Bearer ${viewer.accessToken}`)
      .send({ branchId: fixture.branchId })
      .expect(403);

    await request(httpServer)
      .get(`/api/v1/repositories/${fixture.repositoryId}/search`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .query({ branchId: fixture.branchId, query: 'a'.repeat(201) })
      .expect(400);
    await request(httpServer)
      .get(`/api/v1/repositories/${fixture.repositoryId}/search`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .query({
        branchId: fixture.branchId,
        query: 'rounding',
        sourceType: 'unsupported',
      })
      .expect(400);

    const branchWithoutKnowledge = await dataSource
      .getRepository(RepositoryBranchEntity)
      .save({
        repositoryId: fixture.repositoryId,
        name: 'without-knowledge',
        commitSha: targetCommitSha,
        status: BranchStatus.Active,
        lastIndexedAt: null,
      });
    await request(httpServer)
      .post(`/api/v1/repositories/${fixture.repositoryId}/search/indexes`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ branchId: branchWithoutKnowledge.id })
      .expect(404);

    const foreignOwner = await registerAndLoginOwner(
      httpServer,
      `${runIdentity}-foreign`,
    );
    await request(httpServer)
      .get(`/api/v1/repositories/${fixture.repositoryId}/search`)
      .set('Authorization', `Bearer ${foreignOwner.accessToken}`)
      .query({ branchId: fixture.branchId, query: 'rounding' })
      .expect(404);
    await request(httpServer)
      .post(`/api/v1/repositories/${fixture.repositoryId}/search/indexes`)
      .set('Authorization', `Bearer ${foreignOwner.accessToken}`)
      .send({ branchId: fixture.branchId })
      .expect(404);
  });

  it('keeps the previous index available until a newer revision publishes', async () => {
    const runIdentity = `search-revision-${Date.now().toString(36)}`;
    const owner = await registerAndLoginOwner(httpServer, runIdentity);
    const fixture = await createPublishedKnowledgeFixture(
      owner.organizationId,
      owner.userId,
    );
    const firstBuild = await request(httpServer)
      .post(`/api/v1/repositories/${fixture.repositoryId}/search/indexes`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ branchId: fixture.branchId })
      .expect(201);
    const firstBuildResult = firstBuild.body as SearchProjectionResult;
    const firstSearchIndexId = firstBuildResult.searchIndexId;

    sourceByBlobOid.set(nextGitBlobOid, nextSource);
    const revision = await createPublishedRevisionFixture(
      fixture,
      owner.userId,
    );
    failingBlobOid = nextGitBlobOid;

    await request(httpServer)
      .post(`/api/v1/repositories/${fixture.repositoryId}/search/indexes`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ branchId: fixture.branchId })
      .expect(500);

    const availableAfterFailure = await request(httpServer)
      .get(`/api/v1/repositories/${fixture.repositoryId}/search`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .query({ branchId: fixture.branchId, query: 'rounding' })
      .expect(200);
    const availableAfterFailureResult =
      availableAfterFailure.body as SearchQueryResult;
    expect(availableAfterFailureResult).toMatchObject({
      searchIndex: {
        id: firstSearchIndexId,
        targetCommitSha,
      },
    });
    expect(availableAfterFailureResult.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: 'DoctorScheduleRoundingRule',
        }),
      ]),
    );

    const indexesAfterFailure = await dataSource
      .getRepository(SearchIndexEntity)
      .find({
        where: { repositoryId: fixture.repositoryId },
        order: { id: 'ASC' },
      });
    expect(indexesAfterFailure).toHaveLength(2);
    expect(indexesAfterFailure[0]).toMatchObject({
      id: firstSearchIndexId,
      status: SearchIndexStatus.Published,
      isCurrent: true,
      targetCommitSha,
    });
    expect(indexesAfterFailure[1]).toMatchObject({
      knowledgeSnapshotId: revision.knowledgeSnapshotId,
      status: SearchIndexStatus.Draft,
      isCurrent: false,
      targetCommitSha: nextTargetCommitSha,
    });

    failingBlobOid = null;
    const retry = await request(httpServer)
      .post(`/api/v1/repositories/${fixture.repositoryId}/search/indexes`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ branchId: fixture.branchId })
      .expect(201);
    const retryResult = retry.body as SearchProjectionResult;
    const nextSearchIndexId = retryResult.searchIndexId;
    expect(retryResult).toMatchObject({
      isCurrent: true,
      reused: false,
      targetCommitSha: nextTargetCommitSha,
      knowledgeSnapshotId: revision.knowledgeSnapshotId,
    });
    expect(nextSearchIndexId).not.toBe(firstSearchIndexId);

    const indexesAfterRetry = await dataSource
      .getRepository(SearchIndexEntity)
      .find({
        where: { repositoryId: fixture.repositoryId },
        order: { id: 'ASC' },
      });
    expect(indexesAfterRetry[0]).toMatchObject({
      id: firstSearchIndexId,
      status: SearchIndexStatus.Published,
      isCurrent: false,
    });
    expect(indexesAfterRetry[0]?.supersededAt).toBeInstanceOf(Date);
    expect(indexesAfterRetry[1]).toMatchObject({
      id: nextSearchIndexId,
      status: SearchIndexStatus.Published,
      isCurrent: true,
      targetCommitSha: nextTargetCommitSha,
    });

    const currentRevision = await request(httpServer)
      .get(`/api/v1/repositories/${fixture.repositoryId}/search`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .query({ branchId: fixture.branchId, query: 'availability' })
      .expect(200);
    const currentRevisionResult = currentRevision.body as SearchQueryResult;
    expect(currentRevisionResult).toMatchObject({
      searchIndex: {
        id: nextSearchIndexId,
        targetCommitSha: nextTargetCommitSha,
      },
    });
    expect(currentRevisionResult.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: 'DoctorAvailabilityRule',
        }),
      ]),
    );

    await expect(
      dataSource
        .getRepository(SearchDocumentEntity)
        .update(
          { searchIndexId: firstSearchIndexId },
          { content: 'historical content changed' },
        ),
    ).rejects.toThrow('published search index content is immutable');
  });

  it('meets the larger-repository projection and query-plan baseline', async () => {
    const runIdentity = `search-performance-${Date.now().toString(36)}`;
    const owner = await registerAndLoginOwner(httpServer, runIdentity);
    const fixture = await createPublishedKnowledgeFixture(
      owner.organizationId,
      owner.userId,
    );
    await extendCodeSnapshotFiles(fixture, largeFixtureFileCount);

    const buildStartedAt = performance.now();
    const projection = await searchService.build({
      organizationId: fixture.organizationId,
      repositoryId: fixture.repositoryId,
      knowledgeSnapshotId: fixture.knowledgeSnapshotId,
    });
    const buildDurationMs = performance.now() - buildStartedAt;
    const documentsPerSecond =
      projection.documentCount / (buildDurationMs / 1_000);

    expect(projection).toMatchObject({
      isCurrent: true,
      reused: false,
      documents: {
        files: largeFixtureFileCount,
        symbols: 1,
        knowledgeNodes: 2,
        total: largeFixtureFileCount + 3,
      },
    });
    expect(buildDurationMs).toBeLessThan(largeFixtureBuildBudgetMs);
    expect(documentsPerSecond).toBeGreaterThan(50);

    const targetPath =
      'src/performance/module-04999/performance-target-04999.service.ts';
    const queryStartedAt = performance.now();
    const query = await searchQueryService.search({
      organizationId: fixture.organizationId,
      repositoryId: fixture.repositoryId,
      branchId: fixture.branchId,
      query: targetPath,
      page: 1,
      limit: 10,
    });
    const queryDurationMs = performance.now() - queryStartedAt;

    expect(queryDurationMs).toBeLessThan(largeFixtureQueryBudgetMs);
    expect(query.data[0]).toMatchObject({
      title: targetPath,
      match: { exactPath: true },
    });

    await dataSource.query('ANALYZE "search_documents"');
    const fullTextPlanRows = await dataSource.query<SearchPlanRow[]>(
      `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
         SELECT document."id"
         FROM "search_documents" document
         WHERE document."search_index_id" = $1
           AND document."search_vector" @@
             plainto_tsquery('simple'::regconfig, $2)
         LIMIT 10`,
      [projection.searchIndexId, 'performance target 04999'],
    );
    const exactPathPlanRows = await dataSource.query<SearchPlanRow[]>(
      `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
         SELECT document."id"
         FROM "search_documents" document
         WHERE document."search_index_id" = $1
           AND lower(document."path") = lower($2)
         LIMIT 10`,
      [projection.searchIndexId, targetPath],
    );
    const fullTextPlan = fullTextPlanRows[0]?.['QUERY PLAN'][0];
    const exactPathPlan = exactPathPlanRows[0]?.['QUERY PLAN'][0];
    const fullTextIndexNames = fullTextPlan
      ? collectPlanIndexNames(fullTextPlan.Plan)
      : [];
    const exactPathIndexNames = exactPathPlan
      ? collectPlanIndexNames(exactPathPlan.Plan)
      : [];
    const configuredIndexes = await dataSource.query<
      Array<{ indexName: string }>
    >(
      `SELECT indexname AS "indexName"
       FROM pg_indexes
       WHERE schemaname = 'public'
         AND tablename = 'search_documents'
         AND indexname IN (
           'idx_search_documents_search_vector',
           'idx_search_documents_path_lower'
         )
       ORDER BY indexname`,
    );

    expect(configuredIndexes.map(({ indexName }) => indexName)).toEqual([
      'idx_search_documents_path_lower',
      'idx_search_documents_search_vector',
    ]);
    expect(fullTextPlan?.['Execution Time']).toBeLessThan(
      largeFixtureQueryBudgetMs,
    );
    expect(exactPathPlan?.['Execution Time']).toBeLessThan(
      largeFixtureQueryBudgetMs,
    );

    console.log(
      'search performance baseline',
      JSON.stringify({
        files: largeFixtureFileCount,
        documents: projection.documentCount,
        buildDurationMs: Number(buildDurationMs.toFixed(2)),
        documentsPerSecond: Number(documentsPerSecond.toFixed(2)),
        queryDurationMs: Number(queryDurationMs.toFixed(2)),
        fullTextPlan: {
          nodeType: fullTextPlan?.Plan['Node Type'] ?? null,
          executionMs: fullTextPlan?.['Execution Time'] ?? null,
          planningMs: fullTextPlan?.['Planning Time'] ?? null,
          indexes: fullTextIndexNames,
        },
        exactPathPlan: {
          nodeType: exactPathPlan?.Plan['Node Type'] ?? null,
          executionMs: exactPathPlan?.['Execution Time'] ?? null,
          planningMs: exactPathPlan?.['Planning Time'] ?? null,
          indexes: exactPathIndexNames,
        },
        configuredIndexes: configuredIndexes.map(({ indexName }) => indexName),
      }),
    );
  }, 90_000);

  async function createPublishedKnowledgeFixture(
    organizationId: string,
    ownerUserId: string,
  ): Promise<{
    organizationId: string;
    repositoryId: number;
    branchId: number;
    indexJobId: number;
    knowledgeSnapshotId: number;
  }> {
    const repository = await dataSource.getRepository(RepositoryEntity).save({
      organizationId,
      createdByUserId: ownerUserId,
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
      organizationId,
      repositoryId: repository.id,
      branchId: branch.id,
      requestedByUserId: ownerUserId,
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
      processedDependencies: 1,
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
      organizationId,
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
      organizationId,
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
      organizationId,
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
    await dataSource.getRepository(CodeDependencyEntity).save({
      organizationId,
      repositoryId: repository.id,
      branchId: branch.id,
      sourceIndexedFileId: indexedFile.id,
      sourceFileHashId: fileHash.id,
      sourceSymbolId: symbol.id,
      observedByJobId: indexJob.id,
      identityHash: '6'.repeat(64),
      kind: CodeDependencyKind.Import,
      moduleSpecifier: './doctor-schedule.service',
      targetName: 'DoctorScheduleService',
      localName: 'DoctorScheduleService',
      typeOnly: false,
      targetIndexedFileId: indexedFile.id,
      targetFileHashId: fileHash.id,
      targetSymbolId: null,
      startLine: 1,
      startColumn: 1,
      startOffset: 0,
      endLine: 1,
      endColumn: 10,
      endOffset: 9,
    });
    const created = await knowledgeService.createBuild({
      organizationId,
      repositoryId: repository.id,
      branchId: branch.id,
      sourceIndexJobId: indexJob.id,
      requestedByUserId: ownerUserId,
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
      organizationId,
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
        {
          identityKey: 'concept:schedule-window',
          kind: KnowledgeNodeKind.DomainConcept,
          name: 'ScheduleWindow',
          summary: 'A bounded interval used when arranging appointments.',
          derivationType: KnowledgeDerivationType.Deterministic,
          confidence: 1,
          analyzerName: 'search-e2e-analyzer',
          analyzerVersion: '1.0.0',
          contentFingerprint: '7'.repeat(64),
          propertySchemaVersion: 1,
          properties: { intervalMinutes: 15 },
          evidence: [
            {
              indexedFileId: indexedFile.id,
              fileHashId: fileHash.id,
              codeSymbolId: symbol.id,
              role: KnowledgeEvidenceRole.Condition,
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
      edges: [
        {
          identityKey: 'represents:doctor-schedule-rounding:schedule-window',
          kind: KnowledgeEdgeKind.Represents,
          source: {
            kind: KnowledgeNodeKind.BusinessRule,
            identityKey: 'rule:doctor-schedule-rounding',
          },
          target: {
            kind: KnowledgeNodeKind.DomainConcept,
            identityKey: 'concept:schedule-window',
          },
          derivationType: KnowledgeDerivationType.Deterministic,
          confidence: 1,
          analyzerName: 'search-e2e-analyzer',
          analyzerVersion: '1.0.0',
          contentFingerprint: '8'.repeat(64),
          propertySchemaVersion: 1,
          properties: {},
          evidence: [
            {
              indexedFileId: indexedFile.id,
              fileHashId: fileHash.id,
              codeSymbolId: symbol.id,
              role: KnowledgeEvidenceRole.Condition,
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
      organizationId,
      repositoryId: repository.id,
      buildId: created.buildId,
      leaseToken,
    });

    return {
      organizationId,
      repositoryId: repository.id,
      branchId: branch.id,
      indexJobId: indexJob.id,
      knowledgeSnapshotId: published.snapshotId,
    };
  }

  async function createPublishedRevisionFixture(
    fixture: {
      organizationId: string;
      repositoryId: number;
      branchId: number;
    },
    ownerUserId: string,
  ): Promise<{ indexJobId: number; knowledgeSnapshotId: number }> {
    const now = new Date();
    await dataSource
      .getRepository(RepositoryBranchEntity)
      .update(
        { id: fixture.branchId, repositoryId: fixture.repositoryId },
        { commitSha: nextTargetCommitSha, lastIndexedAt: now },
      );
    const indexJob = await dataSource.getRepository(IndexJobEntity).save({
      organizationId: fixture.organizationId,
      repositoryId: fixture.repositoryId,
      branchId: fixture.branchId,
      requestedByUserId: ownerUserId,
      retryOfJobId: null,
      trigger: IndexJobTrigger.Manual,
      mode: IndexingMode.Incremental,
      status: IndexJobStatus.Succeeded,
      phase: IndexJobPhase.Finished,
      targetCommitSha: nextTargetCommitSha,
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
      startedAt: now,
      completedAt: now,
      lastHeartbeatAt: null,
      leaseExpiresAt: null,
      nextAttemptAt: null,
      cancellationRequestedAt: null,
      currentFile: null,
    });
    const indexedFile = await dataSource
      .getRepository(IndexedFileEntity)
      .findOneByOrFail({
        organizationId: fixture.organizationId,
        repositoryId: fixture.repositoryId,
        branchId: fixture.branchId,
        path: 'src/doctor-schedule.service.ts',
      });
    const fileHash = await dataSource.getRepository(FileHashEntity).save({
      organizationId: fixture.organizationId,
      indexedFileId: indexedFile.id,
      observedByJobId: indexJob.id,
      analyzedByJobId: indexJob.id,
      algorithm: FileHashAlgorithm.Sha256,
      value: 'b'.repeat(64),
      gitBlobOid: nextGitBlobOid,
      sizeBytes: nextSource.length,
      analysisCompletedAt: now,
    });
    await dataSource.getRepository(IndexedFileEntity).update(
      { id: indexedFile.id },
      {
        lastSeenJobId: indexJob.id,
        currentFileHashId: fileHash.id,
        sizeBytes: nextSource.length,
        lastSeenCommitSha: nextTargetCommitSha,
      },
    );
    const symbol = await dataSource.getRepository(CodeSymbolEntity).save({
      organizationId: fixture.organizationId,
      repositoryId: fixture.repositoryId,
      branchId: fixture.branchId,
      indexedFileId: indexedFile.id,
      fileHashId: fileHash.id,
      observedByJobId: indexJob.id,
      name: 'calculateAvailabilityWindow',
      qualifiedName: 'DoctorScheduleService.calculateAvailabilityWindow',
      kind: CodeSymbolKind.Method,
      visibility: CodeSymbolVisibility.Public,
      exported: false,
      defaultExport: false,
      signature: 'calculateAvailabilityWindow(minutes: number): number',
      documentation: 'Calculates doctor availability in thirty-minute windows.',
      startLine: 3,
      startColumn: 7,
      startOffset: 46,
      endLine: 5,
      endColumn: 8,
      endOffset: Math.min(nextSource.length, 150),
    });
    const created = await knowledgeService.createBuild({
      organizationId: fixture.organizationId,
      repositoryId: fixture.repositoryId,
      branchId: fixture.branchId,
      sourceIndexJobId: indexJob.id,
      requestedByUserId: ownerUserId,
      trigger: KnowledgeBuildTrigger.Manual,
      analyzerBundleVersion: 'search-e2e-v2',
      configurationDigest: 'c'.repeat(64),
      maxAttempts: 3,
    });
    const leaseToken = randomUUID();
    await dataSource.getRepository(KnowledgeBuildEntity).update(
      { id: created.buildId },
      {
        status: KnowledgeBuildStatus.Running,
        phase: KnowledgeBuildPhase.Analyzing,
        attemptCount: 1,
        claimedBy: 'search-e2e-revision-worker',
        leaseToken,
        startedAt: now,
        lastHeartbeatAt: now,
        leaseExpiresAt: new Date(now.getTime() + 60_000),
      },
    );
    await knowledgeService.persistGraphBatch({
      organizationId: fixture.organizationId,
      repositoryId: fixture.repositoryId,
      buildId: created.buildId,
      leaseToken,
      nodes: [
        {
          identityKey: 'rule:doctor-availability',
          kind: KnowledgeNodeKind.BusinessRule,
          name: 'DoctorAvailabilityRule',
          summary: 'Doctor availability uses thirty-minute scheduling windows.',
          derivationType: KnowledgeDerivationType.Deterministic,
          confidence: 1,
          analyzerName: 'search-e2e-analyzer',
          analyzerVersion: '2.0.0',
          contentFingerprint: 'd'.repeat(64),
          propertySchemaVersion: 1,
          properties: { intervalMinutes: 30 },
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
                endOffset: Math.min(nextSource.length, 150),
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
      organizationId: fixture.organizationId,
      repositoryId: fixture.repositoryId,
      buildId: created.buildId,
      leaseToken,
    });

    return {
      indexJobId: indexJob.id,
      knowledgeSnapshotId: published.snapshotId,
    };
  }

  async function extendCodeSnapshotFiles(
    fixture: {
      organizationId: string;
      repositoryId: number;
      branchId: number;
      indexJobId: number;
    },
    targetFileCount: number,
  ): Promise<void> {
    const additionalFileCount = targetFileCount - 1;
    const fileRepository = dataSource.getRepository(IndexedFileEntity);
    const hashRepository = dataSource.getRepository(FileHashEntity);
    const files = fileRepository.create(
      Array.from({ length: additionalFileCount }, (_, index) => {
        const sequence = index + 1;
        const paddedSequence = sequence.toString().padStart(5, '0');

        return {
          organizationId: fixture.organizationId,
          repositoryId: fixture.repositoryId,
          branchId: fixture.branchId,
          lastSeenJobId: fixture.indexJobId,
          currentFileHashId: null,
          path:
            `src/performance/module-${paddedSequence}/` +
            `performance-target-${paddedSequence}.service.ts`,
          extension: '.ts',
          language: SourceLanguage.TypeScript,
          sizeBytes: source.length,
          status: IndexedFileStatus.Active,
          lastSeenCommitSha: targetCommitSha,
        };
      }),
    );
    const savedFiles = await fileRepository.save(files, { chunk: 250 });
    const observedAt = new Date();
    const hashes = hashRepository.create(
      savedFiles.map((file) => ({
        organizationId: fixture.organizationId,
        indexedFileId: file.id,
        observedByJobId: fixture.indexJobId,
        analyzedByJobId: fixture.indexJobId,
        algorithm: FileHashAlgorithm.Sha256,
        value: '3'.repeat(64),
        gitBlobOid,
        sizeBytes: source.length,
        analysisCompletedAt: observedAt,
      })),
    );
    await hashRepository.save(hashes, { chunk: 250 });
    await dataSource.query(
      `UPDATE "indexed_files" file
       SET "current_file_hash_id" = hash."id"
       FROM "file_hashes" hash
       WHERE hash."indexed_file_id" = file."id"
         AND file."organization_id" = $1
         AND file."repository_id" = $2
         AND file."branch_id" = $3
         AND file."last_seen_job_id" = $4
         AND file."current_file_hash_id" IS NULL`,
      [
        fixture.organizationId,
        fixture.repositoryId,
        fixture.branchId,
        fixture.indexJobId,
      ],
    );
    await dataSource.getRepository(IndexJobEntity).update(
      { id: fixture.indexJobId },
      {
        totalFiles: targetFileCount,
        processedFiles: targetFileCount,
      },
    );
  }
});

interface SearchPlanNode {
  'Node Type': string;
  'Index Name'?: string;
  Plans?: SearchPlanNode[];
}

interface SearchPlan {
  Plan: SearchPlanNode;
  'Planning Time': number;
  'Execution Time': number;
}

interface SearchPlanRow {
  'QUERY PLAN': SearchPlan[];
}

function collectPlanIndexNames(plan: SearchPlanNode): string[] {
  const names = plan['Index Name'] ? [plan['Index Name']] : [];

  for (const child of plan.Plans ?? []) {
    names.push(...collectPlanIndexNames(child));
  }

  return names;
}
