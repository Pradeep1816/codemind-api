import { createHash, randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { FileHashEntity } from '../src/modules/indexing/entities/file-hash.entity';
import { IndexJobEntity } from '../src/modules/indexing/entities/index-job.entity';
import { IndexedFileEntity } from '../src/modules/indexing/entities/indexed-file.entity';
import { FileHashAlgorithm } from '../src/modules/indexing/enums/file-hash-algorithm.enum';
import { IndexedFileStatus } from '../src/modules/indexing/enums/indexed-file-status.enum';
import { IndexJobPhase } from '../src/modules/indexing/enums/index-job-phase.enum';
import { IndexJobStatus } from '../src/modules/indexing/enums/index-job-status.enum';
import { IndexJobTrigger } from '../src/modules/indexing/enums/index-job-trigger.enum';
import { IndexingMode } from '../src/modules/indexing/enums/indexing-mode.enum';
import { SourceLanguage } from '../src/modules/indexing/enums/source-language.enum';
import { KnowledgeBuildEntity } from '../src/modules/knowledge/entities/knowledge-build.entity';
import { KnowledgeNodeEntity } from '../src/modules/knowledge/entities/knowledge-node.entity';
import { KnowledgeSnapshotEntity } from '../src/modules/knowledge/entities/knowledge-snapshot.entity';
import { KnowledgeBuildPhase } from '../src/modules/knowledge/enums/knowledge-build-phase.enum';
import { KnowledgeBuildStatus } from '../src/modules/knowledge/enums/knowledge-build-status.enum';
import { KnowledgeBuildTrigger } from '../src/modules/knowledge/enums/knowledge-build-trigger.enum';
import { KnowledgeDerivationType } from '../src/modules/knowledge/enums/knowledge-derivation-type.enum';
import { KnowledgeEdgeKind } from '../src/modules/knowledge/enums/knowledge-edge-kind.enum';
import { KnowledgeEvidenceRole } from '../src/modules/knowledge/enums/knowledge-evidence-role.enum';
import { KnowledgeNodeKind } from '../src/modules/knowledge/enums/knowledge-node-kind.enum';
import { KnowledgeSnapshotStatus } from '../src/modules/knowledge/enums/knowledge-snapshot-status.enum';
import {
  KnowledgeEdgeInput,
  KnowledgeEvidenceInput,
  KnowledgeNodeInput,
} from '../src/modules/knowledge/persistence/knowledge-persistence.types';
import { KnowledgeBuildLifecycleService } from '../src/modules/knowledge/lifecycle/knowledge-build-lifecycle.service';
import { KnowledgeProcessor } from '../src/modules/knowledge/queue/knowledge.processor';
import { KnowledgeGraphBuilderService } from '../src/modules/knowledge/services/knowledge-graph-builder.service';
import { KnowledgePersistenceService } from '../src/modules/knowledge/services/knowledge-persistence.service';
import { KnowledgeQueryService } from '../src/modules/knowledge/services/knowledge-query.service';
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
import { resetE2eDatabase } from './support/database';
import { createE2eApplication } from './support/e2e-application';

interface KnowledgeFixture {
  organizationId: string;
  repositoryId: number;
  branchId: number;
  indexJobId: number;
  indexedFileId: number;
  fileHashId: number;
}

describe('Knowledge persistence (e2e)', () => {
  const targetCommitSha = '1'.repeat(40);
  const configurationDigest = 'a'.repeat(64);
  const contentFingerprint = 'b'.repeat(64);
  let app: INestApplication;
  let dataSource: DataSource;
  let service: KnowledgePersistenceService;
  let lifecycleService: KnowledgeBuildLifecycleService;
  let queryService: KnowledgeQueryService;
  let fixture: KnowledgeFixture;

  beforeAll(async () => {
    ({ app, dataSource } = await createE2eApplication());
    service = app.get(KnowledgePersistenceService);
    lifecycleService = app.get(KnowledgeBuildLifecycleService);
    queryService = app.get(KnowledgeQueryService);
  });

  beforeEach(async () => {
    await resetE2eDatabase(dataSource);
    fixture = await createFixture();
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

  it('publishes an evidence-complete graph atomically and keeps it immutable', async () => {
    const owned = await createRunningBuild('architecture-v1');
    const { nodes, edges } = createGraph();

    await service.persistGraphBatch({ ...owned, nodes, edges });
    await advanceToPublishing(owned.buildId);
    const result = await service.publishSnapshot(owned);

    expect(result).toMatchObject({
      buildId: owned.buildId,
      isCurrent: true,
      targetCommitSha,
    });

    const build = await dataSource
      .getRepository(KnowledgeBuildEntity)
      .findOneByOrFail({ id: owned.buildId });
    const snapshot = await dataSource
      .getRepository(KnowledgeSnapshotEntity)
      .findOneByOrFail({ id: result.snapshotId });
    const counts = await readGraphCounts(result.snapshotId);

    expect(build).toMatchObject({
      status: KnowledgeBuildStatus.Succeeded,
      phase: KnowledgeBuildPhase.Finished,
      persistedNodes: 2,
      persistedEdges: 1,
    });
    expect(snapshot).toMatchObject({
      status: KnowledgeSnapshotStatus.Published,
      isCurrent: true,
      targetCommitSha,
    });
    expect(counts).toEqual({
      nodes: 2,
      edges: 1,
      evidence: 1,
      nodeEvidence: 2,
      edgeEvidence: 1,
    });

    await expect(
      dataSource.query(
        `UPDATE knowledge_nodes SET name = 'Changed' WHERE snapshot_id = $1`,
        [result.snapshotId],
      ),
    ).rejects.toThrow('published knowledge snapshot content is immutable');
  });

  it('rejects publication when any fact has no evidence link', async () => {
    const owned = await createRunningBuild('incomplete-v1');
    const { nodes } = createGraph();

    await service.persistGraphBatch({ ...owned, nodes: [nodes[0]], edges: [] });
    await dataSource.query(
      `DELETE FROM knowledge_node_evidence
       WHERE knowledge_node_id IN (
         SELECT id FROM knowledge_nodes WHERE snapshot_id = (
           SELECT id FROM knowledge_snapshots WHERE knowledge_build_id = $1
         )
       )`,
      [owned.buildId],
    );
    await advanceToPublishing(owned.buildId);

    await expect(service.publishSnapshot(owned)).rejects.toThrow(
      'Knowledge snapshot contains facts without source evidence',
    );
    await expect(readSnapshot(owned.buildId)).resolves.toMatchObject({
      status: KnowledgeSnapshotStatus.Draft,
      isCurrent: false,
    });
  });

  it('publishes historical knowledge without replacing current when the branch moved', async () => {
    const owned = await createRunningBuild('historical-v1');
    const { nodes, edges } = createGraph();

    await service.persistGraphBatch({ ...owned, nodes, edges });
    await dataSource
      .getRepository(RepositoryBranchEntity)
      .update({ id: fixture.branchId }, { commitSha: '2'.repeat(40) });
    await advanceToPublishing(owned.buildId);

    await expect(service.publishSnapshot(owned)).resolves.toMatchObject({
      isCurrent: false,
      targetCommitSha,
    });
    await expect(readSnapshot(owned.buildId)).resolves.toMatchObject({
      status: KnowledgeSnapshotStatus.Published,
      isCurrent: false,
    });
  });

  it('rejects evidence that does not reference the snapshot file version', async () => {
    const staleHash = await dataSource.getRepository(FileHashEntity).save({
      organizationId: fixture.organizationId,
      indexedFileId: fixture.indexedFileId,
      observedByJobId: fixture.indexJobId,
      analyzedByJobId: fixture.indexJobId,
      algorithm: FileHashAlgorithm.Sha256,
      value: 'c'.repeat(64),
      gitBlobOid: '3'.repeat(40),
      sizeBytes: 100,
      analysisCompletedAt: new Date(),
    });
    const owned = await createRunningBuild('stale-evidence-v1');
    const { nodes } = createGraph({ fileHashId: staleHash.id });

    await expect(
      service.persistGraphBatch({ ...owned, nodes: [nodes[0]], edges: [] }),
    ).rejects.toThrow('knowledge evidence source scope is invalid');
    expect(await dataSource.getRepository(KnowledgeNodeEntity).count()).toBe(0);
  });

  it('persists an identical graph batch idempotently when a worker retries it', async () => {
    const owned = await createRunningBuild('retry-safe-v1');
    const { nodes, edges } = createGraph();

    await service.persistGraphBatch({ ...owned, nodes, edges });
    const retried = await service.persistGraphBatch({ ...owned, nodes, edges });

    expect(retried).toMatchObject({
      persistedNodes: 2,
      persistedEdges: 1,
    });
    await expect(readGraphCounts(retried.snapshotId)).resolves.toEqual({
      nodes: 2,
      edges: 1,
      evidence: 1,
      nodeEvidence: 2,
      edgeEvidence: 1,
    });
  });

  it('rolls back a conflicting identity without changing the stored fact', async () => {
    const owned = await createRunningBuild('identity-conflict-v1');
    const { nodes } = createGraph();

    await service.persistGraphBatch({
      ...owned,
      nodes: [nodes[0]],
      edges: [],
    });
    await expect(
      service.persistGraphBatch({
        ...owned,
        nodes: [
          {
            ...nodes[0],
            name: 'ConflictingDoctorService',
            contentFingerprint: '9'.repeat(64),
          },
        ],
        edges: [],
      }),
    ).rejects.toThrow('Knowledge node identity has conflicting content');

    const stored = await dataSource
      .getRepository(KnowledgeNodeEntity)
      .findOneByOrFail({ identityKey: nodes[0].identityKey });
    expect(stored.name).toBe('DoctorService');
    expect(await dataSource.getRepository(KnowledgeNodeEntity).count()).toBe(1);
  });

  it('rejects evidence owned by another organization and repository', async () => {
    const foreign = await createFixture();
    const owned = await createRunningBuild('tenant-evidence-v1');
    const { nodes } = createGraph({
      indexedFileId: foreign.indexedFileId,
      fileHashId: foreign.fileHashId,
    });

    await expect(
      service.persistGraphBatch({
        ...owned,
        nodes: [nodes[0]],
        edges: [],
      }),
    ).rejects.toThrow('knowledge evidence source scope is invalid');
    expect(await dataSource.getRepository(KnowledgeNodeEntity).count()).toBe(0);
  });

  it('keeps drafts invisible and prevents cross-tenant published reads', async () => {
    const owned = await createRunningBuild('tenant-query-v1');
    const { nodes, edges } = createGraph();
    const draft = await readSnapshot(owned.buildId);

    await expect(
      queryService.findSnapshot(
        fixture.organizationId,
        fixture.repositoryId,
        draft.id,
      ),
    ).rejects.toThrow('Knowledge snapshot was not found');

    await service.persistGraphBatch({ ...owned, nodes, edges });
    await advanceToPublishing(owned.buildId);
    const published = await service.publishSnapshot(owned);

    await expect(
      queryService.findSnapshot(
        fixture.organizationId,
        fixture.repositoryId,
        published.snapshotId,
      ),
    ).resolves.toMatchObject({ id: published.snapshotId, isCurrent: true });
    await expect(
      queryService.findSnapshot(
        randomUUID(),
        fixture.repositoryId,
        published.snapshotId,
      ),
    ).rejects.toThrow('Knowledge snapshot was not found');
  });

  it('runs the claimed processor lifecycle through atomic publication', async () => {
    const created = await service.createBuild({
      organizationId: fixture.organizationId,
      repositoryId: fixture.repositoryId,
      branchId: fixture.branchId,
      sourceIndexJobId: fixture.indexJobId,
      requestedByUserId: null,
      trigger: KnowledgeBuildTrigger.Manual,
      analyzerBundleVersion: 'processor-e2e-v1',
      configurationDigest,
      maxAttempts: 3,
    });
    const claimed = await lifecycleService.claimNext('knowledge-e2e-worker');

    expect(claimed).not.toBeNull();
    if (!claimed) {
      throw new Error('Expected the knowledge build to be claimed');
    }

    const graph = createGraph();
    const graphBuilder = {
      build: jest.fn().mockResolvedValue({
        ...graph,
        diagnostics: [],
      }),
    };
    const processor = new KnowledgeProcessor(
      {
        persistenceBatchSize: 1,
        jobHeartbeatIntervalMs: 60_000,
      } as never,
      lifecycleService,
      graphBuilder as unknown as KnowledgeGraphBuilderService,
      service,
    );

    await processor.process(claimed, () => false);

    await expect(
      dataSource
        .getRepository(KnowledgeBuildEntity)
        .findOneByOrFail({ id: created.buildId }),
    ).resolves.toMatchObject({
      status: KnowledgeBuildStatus.Succeeded,
      phase: KnowledgeBuildPhase.Finished,
      persistedNodes: 2,
      persistedEdges: 1,
    });
    await expect(readSnapshot(created.buildId)).resolves.toMatchObject({
      status: KnowledgeSnapshotStatus.Published,
      isCurrent: true,
    });
  });

  it('persists a bounded 199-fact graph batch within the performance baseline', async () => {
    const owned = await createRunningBuild('bounded-baseline-v1');
    const graph = createBoundedGraph(100);
    const startedAt = performance.now();

    const result = await service.persistGraphBatch({ ...owned, ...graph });
    const elapsedMs = performance.now() - startedAt;

    expect(result).toMatchObject({
      persistedNodes: 100,
      persistedEdges: 99,
    });
    expect(elapsedMs).toBeLessThan(15_000);
  });

  async function createFixture(): Promise<KnowledgeFixture> {
    const organization = await dataSource
      .getRepository(OrganizationEntity)
      .save({
        name: 'Knowledge E2E Organization',
        slug: `knowledge-e2e-${randomUUID()}`,
        plan: OrganizationPlan.Free,
        status: OrganizationStatus.Active,
      });
    const repository = await dataSource.getRepository(RepositoryEntity).save({
      organizationId: organization.id,
      createdByUserId: null,
      name: 'Knowledge E2E Repository',
      provider: RepositoryProvider.Generic,
      remoteUrl: `https://example.test/${randomUUID()}.git`,
      defaultBranch: 'main',
      status: RepositoryStatus.Active,
      lastSyncStatus: RepositorySyncStatus.Succeeded,
      lastSyncAttemptedAt: new Date(),
      lastSyncedAt: new Date(),
      repositorySizeBytes: 100,
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
      processedSymbols: 0,
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
      path: 'src/doctor.service.ts',
      extension: '.ts',
      language: SourceLanguage.TypeScript,
      sizeBytes: 100,
      status: IndexedFileStatus.Active,
      lastSeenCommitSha: targetCommitSha,
    });
    const fileHash = await dataSource.getRepository(FileHashEntity).save({
      organizationId: organization.id,
      indexedFileId: indexedFile.id,
      observedByJobId: indexJob.id,
      analyzedByJobId: indexJob.id,
      algorithm: FileHashAlgorithm.Sha256,
      value: 'd'.repeat(64),
      gitBlobOid: '4'.repeat(40),
      sizeBytes: 100,
      analysisCompletedAt: new Date(),
    });
    await dataSource
      .getRepository(IndexedFileEntity)
      .update({ id: indexedFile.id }, { currentFileHashId: fileHash.id });

    return {
      organizationId: organization.id,
      repositoryId: repository.id,
      branchId: branch.id,
      indexJobId: indexJob.id,
      indexedFileId: indexedFile.id,
      fileHashId: fileHash.id,
    };
  }

  async function createRunningBuild(analyzerBundleVersion: string) {
    const created = await service.createBuild({
      organizationId: fixture.organizationId,
      repositoryId: fixture.repositoryId,
      branchId: fixture.branchId,
      sourceIndexJobId: fixture.indexJobId,
      requestedByUserId: null,
      trigger: KnowledgeBuildTrigger.Manual,
      analyzerBundleVersion,
      configurationDigest,
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
        claimedBy: 'knowledge-e2e-worker',
        leaseToken,
        startedAt: now,
        lastHeartbeatAt: now,
        leaseExpiresAt: new Date(now.getTime() + 60_000),
      },
    );

    return {
      organizationId: fixture.organizationId,
      repositoryId: fixture.repositoryId,
      buildId: created.buildId,
      leaseToken,
    };
  }

  function createGraph(
    evidenceOverrides: Partial<KnowledgeEvidenceInput> = {},
  ): { nodes: KnowledgeNodeInput[]; edges: KnowledgeEdgeInput[] } {
    const evidence: KnowledgeEvidenceInput = {
      indexedFileId: fixture.indexedFileId,
      fileHashId: fixture.fileHashId,
      codeSymbolId: null,
      role: KnowledgeEvidenceRole.Declaration,
      range: {
        startLine: 1,
        startColumn: 1,
        startOffset: 0,
        endLine: 3,
        endColumn: 2,
        endOffset: 80,
      },
      ...evidenceOverrides,
    };
    const serviceNode: KnowledgeNodeInput = {
      kind: KnowledgeNodeKind.ArchitecturalComponent,
      identityKey: 'component:doctor-service',
      name: 'DoctorService',
      summary: 'Coordinates doctor operations.',
      derivationType: KnowledgeDerivationType.Deterministic,
      confidence: 1,
      analyzerName: 'architecture-analyzer',
      analyzerVersion: '1.0.0',
      contentFingerprint,
      propertySchemaVersion: 1,
      properties: { componentType: 'service' },
      evidence: [evidence],
    };
    const repositoryNode: KnowledgeNodeInput = {
      ...serviceNode,
      identityKey: 'component:doctor-repository',
      name: 'DoctorRepository',
      summary: 'Persists doctor data.',
      contentFingerprint: 'e'.repeat(64),
      properties: { componentType: 'repository' },
    };
    const edge: KnowledgeEdgeInput = {
      identityKey: 'calls:doctor-service:doctor-repository',
      kind: KnowledgeEdgeKind.Calls,
      source: {
        kind: serviceNode.kind,
        identityKey: serviceNode.identityKey,
      },
      target: {
        kind: repositoryNode.kind,
        identityKey: repositoryNode.identityKey,
      },
      derivationType: KnowledgeDerivationType.Deterministic,
      confidence: 1,
      analyzerName: 'architecture-analyzer',
      analyzerVersion: '1.0.0',
      contentFingerprint: 'f'.repeat(64),
      propertySchemaVersion: 1,
      properties: {},
      evidence: [evidence],
    };

    return { nodes: [serviceNode, repositoryNode], edges: [edge] };
  }

  function createBoundedGraph(size: number): {
    nodes: KnowledgeNodeInput[];
    edges: KnowledgeEdgeInput[];
  } {
    const evidence = createGraph().nodes[0].evidence;
    const nodes = Array.from({ length: size }, (_, index) => ({
      kind: KnowledgeNodeKind.ArchitecturalComponent,
      identityKey: `component:bounded-${index}`,
      name: `BoundedComponent${index}`,
      summary: null,
      derivationType: KnowledgeDerivationType.Deterministic,
      confidence: 1,
      analyzerName: 'bounded-baseline',
      analyzerVersion: '1.0.0',
      contentFingerprint: createHash('sha256')
        .update(`node:${index}`)
        .digest('hex'),
      propertySchemaVersion: 1,
      properties: { componentType: 'service', index },
      evidence,
    }));
    const edges = Array.from({ length: Math.max(0, size - 1) }, (_, index) => ({
      identityKey: `calls:bounded-${index}:bounded-${index + 1}`,
      kind: KnowledgeEdgeKind.Calls,
      source: {
        kind: KnowledgeNodeKind.ArchitecturalComponent,
        identityKey: `component:bounded-${index}`,
      },
      target: {
        kind: KnowledgeNodeKind.ArchitecturalComponent,
        identityKey: `component:bounded-${index + 1}`,
      },
      derivationType: KnowledgeDerivationType.Deterministic,
      confidence: 1,
      analyzerName: 'bounded-baseline',
      analyzerVersion: '1.0.0',
      contentFingerprint: createHash('sha256')
        .update(`edge:${index}`)
        .digest('hex'),
      propertySchemaVersion: 1,
      properties: {},
      evidence,
    }));

    return { nodes, edges };
  }

  async function advanceToPublishing(buildId: number): Promise<void> {
    await dataSource.getRepository(KnowledgeBuildEntity).update(
      { id: buildId },
      {
        phase: KnowledgeBuildPhase.Publishing,
        processedFiles: 1,
        currentFile: null,
      },
    );
  }

  async function readSnapshot(
    buildId: number,
  ): Promise<KnowledgeSnapshotEntity> {
    return dataSource
      .getRepository(KnowledgeSnapshotEntity)
      .findOneByOrFail({ knowledgeBuildId: buildId });
  }

  async function readGraphCounts(snapshotId: number) {
    const rows = await dataSource.query<
      Array<{
        nodes: string;
        edges: string;
        evidence: string;
        nodeEvidence: string;
        edgeEvidence: string;
      }>
    >(
      `SELECT
         (SELECT COUNT(*) FROM knowledge_nodes WHERE snapshot_id = $1) AS nodes,
         (SELECT COUNT(*) FROM knowledge_edges WHERE snapshot_id = $1) AS edges,
         (SELECT COUNT(*) FROM knowledge_evidence WHERE snapshot_id = $1) AS evidence,
         (SELECT COUNT(*) FROM knowledge_node_evidence) AS "nodeEvidence",
         (SELECT COUNT(*) FROM knowledge_edge_evidence) AS "edgeEvidence"`,
      [snapshotId],
    );
    const row = rows[0];

    return {
      nodes: Number(row?.nodes),
      edges: Number(row?.edges),
      evidence: Number(row?.evidence),
      nodeEvidence: Number(row?.nodeEvidence),
      edgeEvidence: Number(row?.edgeEvidence),
    };
  }
});
