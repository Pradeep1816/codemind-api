import { KnowledgeBuildEntity } from '../entities/knowledge-build.entity';
import { KnowledgeBuildPhase } from '../enums/knowledge-build-phase.enum';
import { KnowledgeBuildStatus } from '../enums/knowledge-build-status.enum';
import { KnowledgeBuildTrigger } from '../enums/knowledge-build-trigger.enum';
import { KnowledgeBuildLifecycleService } from '../lifecycle/knowledge-build-lifecycle.service';
import { KnowledgeGraphBuilderService } from '../services/knowledge-graph-builder.service';
import { KnowledgePersistenceService } from '../services/knowledge-persistence.service';
import { KnowledgeProcessor } from './knowledge.processor';

describe('KnowledgeProcessor', () => {
  const leaseToken = '5a2a59c6-ef25-4a35-a6bf-718f003b8421';

  function build(): KnowledgeBuildEntity {
    const now = new Date('2026-09-27T10:00:00.000Z');

    return {
      id: 10,
      organizationId: '5abf1e5e-e03c-4890-83a5-c4e84ad48d18',
      repositoryId: 2,
      branchId: 3,
      sourceIndexJobId: 4,
      requestedByUserId: null,
      trigger: KnowledgeBuildTrigger.Manual,
      status: KnowledgeBuildStatus.Running,
      phase: KnowledgeBuildPhase.Preparing,
      targetCommitSha: '8e008e725d9e411c5bff3a713b91afeaf4613f13',
      analyzerBundleVersion: 'phase4-v1',
      configurationDigest: 'a'.repeat(64),
      totalFiles: 42,
      processedFiles: 0,
      failedFiles: 0,
      emittedFacts: 0,
      persistedNodes: 0,
      persistedEdges: 0,
      attemptCount: 1,
      maxAttempts: 3,
      claimedBy: 'worker-1',
      leaseToken,
      failureCode: null,
      failureMessage: null,
      currentFile: null,
      startedAt: now,
      completedAt: null,
      lastHeartbeatAt: now,
      leaseExpiresAt: new Date('2026-09-27T10:01:00.000Z'),
      nextAttemptAt: null,
      cancellationRequestedAt: null,
      createdAt: now,
      updatedAt: now,
    } as KnowledgeBuildEntity;
  }

  function createProcessor(cancellationRequested = false) {
    const lifecycle = {
      heartbeat: jest.fn().mockResolvedValue({
        build: build(),
        cancellationRequested,
      }),
      advancePhase: jest.fn().mockResolvedValue(build()),
      updateProgress: jest.fn().mockResolvedValue(build()),
      recordError: jest.fn().mockResolvedValue(null),
      fail: jest.fn().mockResolvedValue(build()),
      acknowledgeCancellation: jest.fn().mockResolvedValue(build()),
    };
    const graphBuilder = {
      build: jest.fn().mockResolvedValue({
        nodes: [],
        edges: [],
        diagnostics: [],
      }),
    };
    const persistence = {
      persistGraphBatch: jest.fn(),
      publishSnapshot: jest.fn().mockResolvedValue({ snapshotId: 5 }),
    };
    const processor = new KnowledgeProcessor(
      {
        persistenceBatchSize: 100,
        jobHeartbeatIntervalMs: 15_000,
      } as never,
      lifecycle as unknown as KnowledgeBuildLifecycleService,
      graphBuilder as unknown as KnowledgeGraphBuilderService,
      persistence as unknown as KnowledgePersistenceService,
    );

    return { processor, lifecycle, graphBuilder, persistence };
  }

  it('analyzes, validates, and publishes a claimed build', async () => {
    const { processor, lifecycle, graphBuilder, persistence } =
      createProcessor();

    await processor.process({ build: build(), leaseToken }, () => false);

    expect(graphBuilder.build).toHaveBeenCalledWith({
      organizationId: '5abf1e5e-e03c-4890-83a5-c4e84ad48d18',
      repositoryId: 2,
      indexJobId: 4,
    });
    expect(lifecycle.advancePhase).toHaveBeenNthCalledWith(1, {
      buildId: 10,
      leaseToken,
      phase: KnowledgeBuildPhase.Analyzing,
    });
    expect(lifecycle.advancePhase).toHaveBeenNthCalledWith(2, {
      buildId: 10,
      leaseToken,
      phase: KnowledgeBuildPhase.Validating,
    });
    expect(lifecycle.advancePhase).toHaveBeenNthCalledWith(3, {
      buildId: 10,
      leaseToken,
      phase: KnowledgeBuildPhase.Publishing,
    });
    expect(lifecycle.updateProgress).toHaveBeenCalledWith({
      buildId: 10,
      leaseToken,
      progress: {
        processedFiles: 42,
        failedFiles: 0,
        emittedFacts: 0,
        persistedNodes: 0,
        persistedEdges: 0,
      },
      currentFile: null,
    });
    expect(persistence.publishSnapshot).toHaveBeenCalledWith({
      organizationId: '5abf1e5e-e03c-4890-83a5-c4e84ad48d18',
      repositoryId: 2,
      buildId: 10,
      leaseToken,
    });
    expect(lifecycle.fail).not.toHaveBeenCalled();
  });

  it('acknowledges cancellation before analysis starts', async () => {
    const { processor, lifecycle, graphBuilder, persistence } =
      createProcessor(true);

    await processor.process({ build: build(), leaseToken }, () => false);

    expect(lifecycle.acknowledgeCancellation).toHaveBeenCalledWith({
      buildId: 10,
      leaseToken,
    });
    expect(graphBuilder.build).not.toHaveBeenCalled();
    expect(persistence.publishSnapshot).not.toHaveBeenCalled();
  });

  it('requeues a graceful worker shutdown as a retryable failure', async () => {
    const { processor, lifecycle } = createProcessor();

    await processor.process({ build: build(), leaseToken }, () => true);

    expect(lifecycle.fail).toHaveBeenCalledWith({
      buildId: 10,
      leaseToken,
      code: 'worker_shutdown',
      message: 'Knowledge worker stopped before the build completed',
      retryable: true,
    });
  });
});
