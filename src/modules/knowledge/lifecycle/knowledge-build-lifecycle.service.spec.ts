import { ConflictException } from '@nestjs/common';
import { KnowledgeBuildEntity } from '../entities/knowledge-build.entity';
import { KnowledgeBuildPhase } from '../enums/knowledge-build-phase.enum';
import { KnowledgeBuildStatus } from '../enums/knowledge-build-status.enum';
import { KnowledgeBuildTrigger } from '../enums/knowledge-build-trigger.enum';
import { KnowledgeBuildLifecycleRepository } from './knowledge-build-lifecycle.repository';
import { KnowledgeBuildLifecycleService } from './knowledge-build-lifecycle.service';
import { KnowledgeBuildProgress } from './knowledge-build-lifecycle.types';

describe('KnowledgeBuildLifecycleService', () => {
  const createdAt = new Date('2026-09-27T10:00:00.000Z');

  function build(
    overrides: Partial<KnowledgeBuildEntity> = {},
  ): KnowledgeBuildEntity {
    return {
      id: 10,
      organizationId: '5abf1e5e-e03c-4890-83a5-c4e84ad48d18',
      repositoryId: 20,
      branchId: 30,
      sourceIndexJobId: 40,
      requestedByUserId: null,
      trigger: KnowledgeBuildTrigger.Manual,
      status: KnowledgeBuildStatus.Running,
      phase: KnowledgeBuildPhase.Preparing,
      targetCommitSha: '8e008e725d9e411c5bff3a713b91afeaf4613f13',
      analyzerBundleVersion: 'phase4-v1',
      configurationDigest: 'a'.repeat(64),
      totalFiles: 10,
      processedFiles: 2,
      failedFiles: 0,
      emittedFacts: 4,
      persistedNodes: 2,
      persistedEdges: 2,
      attemptCount: 1,
      maxAttempts: 3,
      claimedBy: 'worker-1',
      leaseToken: '5a2a59c6-ef25-4a35-a6bf-718f003b8421',
      failureCode: null,
      failureMessage: null,
      currentFile: null,
      startedAt: createdAt,
      completedAt: null,
      lastHeartbeatAt: createdAt,
      leaseExpiresAt: new Date('2026-09-27T10:01:00.000Z'),
      nextAttemptAt: null,
      cancellationRequestedAt: null,
      createdAt,
      updatedAt: createdAt,
      ...overrides,
    } as KnowledgeBuildEntity;
  }

  function createService(current = build()) {
    const repository = {
      claimNext: jest.fn().mockResolvedValue(null),
      heartbeat: jest
        .fn()
        .mockResolvedValue({ build: current, cancellationRequested: false }),
      advancePhase: jest
        .fn()
        .mockImplementation((_input, phase: KnowledgeBuildPhase) =>
          Promise.resolve(build({ phase })),
        ),
      updateProgress: jest
        .fn()
        .mockImplementation(
          (
            _input: unknown,
            progress: KnowledgeBuildProgress,
            currentFile: string | null,
          ) => Promise.resolve(build({ ...progress, currentFile })),
        ),
      fail: jest.fn().mockResolvedValue(build()),
      recordError: jest.fn().mockResolvedValue({ id: 1 }),
      acknowledgeCancellation: jest.fn().mockResolvedValue(build()),
      recoverExpiredLeases: jest.fn().mockResolvedValue([]),
      requestCancellation: jest.fn().mockResolvedValue(build()),
    };

    return {
      service: new KnowledgeBuildLifecycleService(
        {
          jobLeaseMs: 60_000,
          jobRetryDelayMs: 30_000,
          jobRecoveryBatchSize: 100,
        } as never,
        repository as unknown as KnowledgeBuildLifecycleRepository,
      ),
      repository,
    };
  }

  const ownership = {
    buildId: 10,
    leaseToken: '5a2a59c6-ef25-4a35-a6bf-718f003b8421',
  };

  it('validates worker identity and applies the configured lease', async () => {
    const { service, repository } = createService();

    expect(() => service.claimNext('worker 1')).toThrow(ConflictException);
    await service.claimNext('worker-1:123');
    expect(repository.claimNext).toHaveBeenCalledWith('worker-1:123', 60_000);
  });

  it('permits only the next knowledge-build phase', async () => {
    const { service, repository } = createService();

    await expect(
      service.advancePhase({
        ...ownership,
        phase: KnowledgeBuildPhase.Analyzing,
      }),
    ).resolves.toMatchObject({ phase: KnowledgeBuildPhase.Analyzing });
    expect(repository.advancePhase).toHaveBeenCalledWith(
      { ...ownership, phase: KnowledgeBuildPhase.Analyzing },
      KnowledgeBuildPhase.Analyzing,
      60_000,
    );

    await expect(
      service.advancePhase({
        ...ownership,
        phase: KnowledgeBuildPhase.Publishing,
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('rejects backwards or excessive progress', async () => {
    const service = createService().service;

    await expect(
      service.updateProgress({
        ...ownership,
        progress: {
          processedFiles: 1,
          failedFiles: 0,
          emittedFacts: 4,
          persistedNodes: 2,
          persistedEdges: 2,
        },
        currentFile: null,
      }),
    ).rejects.toThrow(ConflictException);
    await expect(
      service.updateProgress({
        ...ownership,
        progress: {
          processedFiles: 11,
          failedFiles: 0,
          emittedFacts: 4,
          persistedNodes: 2,
          persistedEdges: 2,
        },
        currentFile: null,
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('validates persisted diagnostic metadata', async () => {
    const { service, repository } = createService();
    const input = {
      ...ownership,
      phase: KnowledgeBuildPhase.Analyzing,
      analyzerName: 'typescript-workflow',
      analyzerVersion: '1.0.0',
      code: 'unresolved_call',
      message: 'Call target could not be resolved',
      retryable: false,
      attemptNumber: 1,
    };

    await service.recordError(input);
    expect(repository.recordError).toHaveBeenCalledWith(input);
    expect(() => service.recordError({ ...input, code: 'Bad Code' })).toThrow(
      ConflictException,
    );
  });

  it('applies configured retry and lease-recovery policies', async () => {
    const { service, repository } = createService();
    const failure = {
      ...ownership,
      code: 'database_operation_failed',
      message: 'A database operation failed during knowledge generation',
      retryable: true,
    };

    await service.fail(failure);
    expect(repository.fail).toHaveBeenCalledWith(
      failure,
      failure.code,
      failure.message,
      true,
      30_000,
    );
    await service.recoverExpiredLeases();
    expect(repository.recoverExpiredLeases).toHaveBeenCalledWith(100, 30_000);
  });
});
