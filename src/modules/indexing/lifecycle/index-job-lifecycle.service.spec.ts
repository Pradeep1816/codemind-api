import { ConflictException } from '@nestjs/common';
import { IndexJobEntity } from '../entities/index-job.entity';
import { IndexJobPhase } from '../enums/index-job-phase.enum';
import { IndexJobStatus } from '../enums/index-job-status.enum';
import { IndexJobTrigger } from '../enums/index-job-trigger.enum';
import { IndexingMode } from '../enums/indexing-mode.enum';
import { IndexJobLifecycleRepository } from './index-job-lifecycle.repository';
import { IndexJobLifecycleService } from './index-job-lifecycle.service';
import { IndexJobProgress } from './index-job-lifecycle.types';

describe('IndexJobLifecycleService', () => {
  const createdAt = new Date('2026-08-07T10:00:00.000Z');

  function job(overrides: Partial<IndexJobEntity> = {}): IndexJobEntity {
    return {
      id: 10,
      organizationId: '5abf1e5e-e03c-4890-83a5-c4e84ad48d18',
      repositoryId: 20,
      branchId: 30,
      requestedByUserId: null,
      retryOfJobId: null,
      trigger: IndexJobTrigger.Manual,
      mode: IndexingMode.Incremental,
      status: IndexJobStatus.Running,
      phase: IndexJobPhase.Preparing,
      targetCommitSha: '8e008e725d9e411c5bff3a713b91afeaf4613f13',
      totalFiles: 10,
      processedFiles: 2,
      skippedFiles: 1,
      failedFiles: 0,
      processedSymbols: 5,
      processedDependencies: 3,
      attemptCount: 1,
      maxAttempts: 3,
      claimedBy: 'worker-1',
      leaseToken: '5a2a59c6-ef25-4a35-a6bf-718f003b8421',
      failureCode: null,
      failureMessage: null,
      startedAt: createdAt,
      completedAt: null,
      lastHeartbeatAt: createdAt,
      leaseExpiresAt: new Date('2026-08-07T10:01:00.000Z'),
      nextAttemptAt: null,
      cancellationRequestedAt: null,
      currentFile: null,
      createdAt,
      updatedAt: createdAt,
      ...overrides,
    } as IndexJobEntity;
  }

  function createService(options?: {
    heartbeat?: { job: IndexJobEntity; cancellationRequested: boolean } | null;
  }) {
    const currentJob = options?.heartbeat?.job ?? job();
    const repository = {
      claimNext: jest.fn().mockResolvedValue(null),
      heartbeat: jest
        .fn()
        .mockResolvedValue(
          options && 'heartbeat' in options
            ? options.heartbeat
            : { job: currentJob, cancellationRequested: false },
        ),
      advancePhase: jest
        .fn()
        .mockImplementation((_input: unknown, phase: IndexJobPhase) =>
          Promise.resolve(job({ phase })),
        ),
      updateProgress: jest
        .fn()
        .mockImplementation(
          (
            _input: unknown,
            progress: IndexJobProgress,
            currentFile: string | null,
          ) => Promise.resolve(job({ ...progress, currentFile })),
        ),
      complete: jest.fn().mockResolvedValue(
        job({
          status: IndexJobStatus.Succeeded,
          phase: IndexJobPhase.Finished,
        }),
      ),
      fail: jest
        .fn()
        .mockResolvedValue(
          job({ status: IndexJobStatus.Failed, phase: IndexJobPhase.Finished }),
        ),
      acknowledgeCancellation: jest.fn().mockResolvedValue(
        job({
          status: IndexJobStatus.Cancelled,
          phase: IndexJobPhase.Finished,
        }),
      ),
      recoverExpiredLeases: jest.fn().mockResolvedValue([]),
      requestCancellation: jest.fn().mockResolvedValue(job()),
    };

    return {
      service: new IndexJobLifecycleService(
        {
          jobLeaseMs: 60_000,
          jobRetryDelayMs: 30_000,
          jobRecoveryBatchSize: 100,
        } as never,
        repository as unknown as IndexJobLifecycleRepository,
      ),
      repository,
    };
  }

  const ownership = {
    jobId: 10,
    leaseToken: '5a2a59c6-ef25-4a35-a6bf-718f003b8421',
  };

  it('validates worker identity before attempting a claim', async () => {
    const { service, repository } = createService();

    expect(() => service.claimNext('worker 1')).toThrow(ConflictException);
    expect(repository.claimNext).not.toHaveBeenCalled();
    await service.claimNext('worker-1:123');
    expect(repository.claimNext).toHaveBeenCalledWith('worker-1:123', 60_000);
  });

  it('rejects ownership loss and invalid phase jumps', async () => {
    await expect(
      createService({ heartbeat: null }).service.heartbeat(ownership),
    ).rejects.toThrow(ConflictException);

    const { service, repository } = createService();
    await expect(
      service.advancePhase({ ...ownership, phase: IndexJobPhase.Hashing }),
    ).rejects.toThrow(ConflictException);
    expect(repository.advancePhase).not.toHaveBeenCalled();
  });

  it('allows only the next ordered processing phase', async () => {
    const { service, repository } = createService();

    await expect(
      service.advancePhase({ ...ownership, phase: IndexJobPhase.Discovering }),
    ).resolves.toMatchObject({ phase: IndexJobPhase.Discovering });
    expect(repository.advancePhase).toHaveBeenCalledWith(
      { ...ownership, phase: IndexJobPhase.Discovering },
      IndexJobPhase.Discovering,
      60_000,
    );
  });

  it('persists monotonic absolute progress and current-file context', async () => {
    const { service, repository } = createService();
    const progress = {
      totalFiles: 10,
      processedFiles: 3,
      skippedFiles: 1,
      failedFiles: 0,
      processedSymbols: 7,
      processedDependencies: 4,
    };

    await expect(
      service.updateProgress({
        ...ownership,
        progress,
        currentFile: 'src/doctor.service.ts',
      }),
    ).resolves.toMatchObject({
      processedFiles: 3,
      currentFile: 'src/doctor.service.ts',
    });
    expect(repository.updateProgress).toHaveBeenCalledWith(
      {
        ...ownership,
        progress,
        currentFile: 'src/doctor.service.ts',
      },
      progress,
      'src/doctor.service.ts',
      60_000,
    );
  });

  it('rejects invalid, excessive, or backwards progress', async () => {
    const service = createService().service;

    await expect(
      service.updateProgress({
        ...ownership,
        progress: {
          totalFiles: 2,
          processedFiles: 2,
          skippedFiles: 1,
          failedFiles: 0,
          processedSymbols: 0,
          processedDependencies: 0,
        },
        currentFile: null,
      }),
    ).rejects.toThrow(ConflictException);
    await expect(
      service.updateProgress({
        ...ownership,
        progress: {
          totalFiles: 10,
          processedFiles: 1,
          skippedFiles: 1,
          failedFiles: 0,
          processedSymbols: 5,
          processedDependencies: 3,
        },
        currentFile: null,
      }),
    ).rejects.toThrow(ConflictException);
    await expect(
      service.updateProgress({
        ...ownership,
        progress: {
          totalFiles: 10,
          processedFiles: 3,
          skippedFiles: 1,
          failedFiles: 0,
          processedSymbols: 7,
          processedDependencies: 4,
        },
        currentFile: 'a'.repeat(1_025),
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('completes only a fully accounted, failure-free finalizing job', async () => {
    const ready = job({
      phase: IndexJobPhase.Finalizing,
      totalFiles: 4,
      processedFiles: 3,
      skippedFiles: 1,
      failedFiles: 0,
    });
    const { service, repository } = createService({
      heartbeat: { job: ready, cancellationRequested: false },
    });

    await expect(service.complete(ownership)).resolves.toMatchObject({
      status: IndexJobStatus.Succeeded,
    });
    expect(repository.complete).toHaveBeenCalledWith(ownership);

    await expect(createService().service.complete(ownership)).rejects.toThrow(
      ConflictException,
    );
  });

  it('passes bounded failure and recovery policies to persistence', async () => {
    const { service, repository } = createService();

    const failure = {
      ...ownership,
      code: 'git_timeout',
      message: 'Git timed out while reading a blob',
      retryable: true,
    };
    await service.fail(failure);
    expect(repository.fail).toHaveBeenCalledWith(
      failure,
      'git_timeout',
      'Git timed out while reading a blob',
      true,
      30_000,
    );

    await service.recoverExpiredLeases();
    expect(repository.recoverExpiredLeases).toHaveBeenCalledWith(100, 30_000);

    await expect(
      service.fail({
        ...ownership,
        code: '',
        message: 'message',
        retryable: false,
      }),
    ).rejects.toThrow(ConflictException);
  });
});
