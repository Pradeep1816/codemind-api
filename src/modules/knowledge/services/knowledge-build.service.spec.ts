import { ConflictException } from '@nestjs/common';
import { IndexingService } from '../../indexing/indexing.service';
import { IndexJobStatus } from '../../indexing/enums/index-job-status.enum';
import { RepositoriesService } from '../../repositories/repositories.service';
import { KnowledgeBuildEntity } from '../entities/knowledge-build.entity';
import { KnowledgeBuildPhase } from '../enums/knowledge-build-phase.enum';
import { KnowledgeBuildStatus } from '../enums/knowledge-build-status.enum';
import { KnowledgeBuildTrigger } from '../enums/knowledge-build-trigger.enum';
import { KnowledgeBuildLifecycleRepository } from '../lifecycle/knowledge-build-lifecycle.repository';
import { KnowledgeBuildLifecycleService } from '../lifecycle/knowledge-build-lifecycle.service';
import { CreateKnowledgeBuildInput } from '../persistence/knowledge-persistence.types';
import { KnowledgeBuildService } from './knowledge-build.service';
import { KnowledgePersistenceService } from './knowledge-persistence.service';

describe('KnowledgeBuildService', () => {
  const organizationId = '5abf1e5e-e03c-4890-83a5-c4e84ad48d18';
  const requestedByUserId = '25d8bd53-047b-42d8-9efa-4ecedfe422d3';
  const now = new Date('2026-09-27T10:00:00.000Z');

  function build(
    overrides: Partial<KnowledgeBuildEntity> = {},
  ): KnowledgeBuildEntity {
    return {
      id: 10,
      organizationId,
      repositoryId: 2,
      branchId: 3,
      sourceIndexJobId: 4,
      requestedByUserId,
      trigger: KnowledgeBuildTrigger.Manual,
      status: KnowledgeBuildStatus.Queued,
      phase: KnowledgeBuildPhase.Queued,
      targetCommitSha: '8e008e725d9e411c5bff3a713b91afeaf4613f13',
      analyzerBundleVersion: 'phase4-v1',
      configurationDigest: 'a'.repeat(64),
      totalFiles: 42,
      processedFiles: 0,
      failedFiles: 0,
      emittedFacts: 0,
      persistedNodes: 0,
      persistedEdges: 0,
      attemptCount: 0,
      maxAttempts: 3,
      claimedBy: null,
      leaseToken: null,
      failureCode: null,
      failureMessage: null,
      currentFile: null,
      startedAt: null,
      completedAt: null,
      lastHeartbeatAt: null,
      leaseExpiresAt: null,
      nextAttemptAt: null,
      cancellationRequestedAt: null,
      createdAt: now,
      updatedAt: now,
      ...overrides,
    } as KnowledgeBuildEntity;
  }

  function createService(sourceStatus = IndexJobStatus.Succeeded) {
    const repositoriesService = {
      findOne: jest.fn().mockResolvedValue({ id: 2 }),
    };
    const indexingService = {
      findJob: jest.fn().mockResolvedValue({
        id: 4,
        branchId: 3,
        status: sourceStatus,
      }),
    };
    const createBuild = jest.fn((input: CreateKnowledgeBuildInput) => {
      void input;
      return Promise.resolve({
        buildId: 10,
        snapshotId: 11,
        targetCommitSha: '8e008e725d9e411c5bff3a713b91afeaf4613f13',
      });
    });
    const persistenceService = {
      createBuild,
    };
    const lifecycleService = {
      requestCancellation: jest.fn().mockResolvedValue(
        build({
          status: KnowledgeBuildStatus.Cancelled,
          phase: KnowledgeBuildPhase.Finished,
        }),
      ),
    };
    const lifecycleRepository = {
      findById: jest.fn().mockResolvedValue(build()),
      findMany: jest.fn().mockResolvedValue([[build()], 1]),
      requeueTerminal: jest.fn().mockResolvedValue(build()),
    };
    const service = new KnowledgeBuildService(
      {
        analyzerBundleVersion: 'phase4-v1',
        jobMaxAttempts: 3,
      } as never,
      {
        maxFactsPerFile: 20_000,
        maxWorkflows: 10_000,
      } as never,
      repositoriesService as unknown as RepositoriesService,
      indexingService as unknown as IndexingService,
      persistenceService as unknown as KnowledgePersistenceService,
      lifecycleService as unknown as KnowledgeBuildLifecycleService,
      lifecycleRepository as unknown as KnowledgeBuildLifecycleRepository,
    );

    return {
      service,
      persistenceService,
      lifecycleService,
      lifecycleRepository,
    };
  }

  it('queues a reproducible build from a successful index job', async () => {
    const { service, persistenceService } = createService();

    await expect(
      service.create(organizationId, requestedByUserId, 2, {
        sourceIndexJobId: 4,
      }),
    ).resolves.toMatchObject({
      id: 10,
      status: KnowledgeBuildStatus.Queued,
      progress: { percentage: 0, totalFiles: 42 },
    });
    const input = persistenceService.createBuild.mock.calls[0][0];
    expect(input).toMatchObject({
      organizationId,
      repositoryId: 2,
      branchId: 3,
      sourceIndexJobId: 4,
      requestedByUserId,
      trigger: KnowledgeBuildTrigger.Manual,
      analyzerBundleVersion: 'phase4-v1',
      maxAttempts: 3,
    });
    expect(input.configurationDigest).toMatch(/^[0-9a-f]{64}$/);
  });

  it('rejects a source index job that has not succeeded', async () => {
    const { service, persistenceService } = createService(
      IndexJobStatus.Running,
    );

    await expect(
      service.create(organizationId, requestedByUserId, 2, {
        sourceIndexJobId: 4,
      }),
    ).rejects.toThrow(ConflictException);
    expect(persistenceService.createBuild).not.toHaveBeenCalled();
  });

  it('allows only failed or cancelled builds to be retried', async () => {
    const { service, lifecycleRepository } = createService();

    await expect(service.retry(organizationId, 2, 10)).rejects.toThrow(
      ConflictException,
    );

    lifecycleRepository.findById.mockResolvedValue(
      build({
        status: KnowledgeBuildStatus.Failed,
        phase: KnowledgeBuildPhase.Finished,
      }),
    );
    await expect(service.retry(organizationId, 2, 10)).resolves.toMatchObject({
      status: KnowledgeBuildStatus.Queued,
    });
  });
});
