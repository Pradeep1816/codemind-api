import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager, MoreThan } from 'typeorm';
import {
  BranchStatus,
  RepositoryBranchEntity,
} from '../../repositories/entities/repository-branch.entity';
import { IndexJobEntity } from '../entities/index-job.entity';
import { IndexJobPhase } from '../enums/index-job-phase.enum';
import { IndexJobStatus } from '../enums/index-job-status.enum';
import {
  ClaimedIndexJob,
  IndexJobHeartbeatResult,
  IndexJobProgress,
  OwnedIndexJobInput,
} from './index-job-lifecycle.types';

@Injectable()
export class IndexJobLifecycleRepository {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  /** Claims the oldest eligible job without blocking another worker claim. */
  claimNext(
    workerId: string,
    leaseMs: number,
  ): Promise<ClaimedIndexJob | null> {
    return this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(IndexJobEntity);
      const now = new Date();
      const job = await repository
        .createQueryBuilder('job')
        .setLock('pessimistic_write')
        .setOnLocked('skip_locked')
        .where('job.status = :status', { status: IndexJobStatus.Queued })
        .andWhere('job.cancellationRequestedAt IS NULL')
        .andWhere('job.attemptCount < job.maxAttempts')
        .andWhere('(job.nextAttemptAt IS NULL OR job.nextAttemptAt <= :now)', {
          now,
        })
        .orderBy('job.createdAt', 'ASC')
        .addOrderBy('job.id', 'ASC')
        .getOne();

      if (!job) {
        return null;
      }

      const leaseToken = randomUUID();
      job.status = IndexJobStatus.Running;
      job.phase = IndexJobPhase.Preparing;
      job.claimedBy = workerId;
      job.leaseToken = leaseToken;
      job.lastHeartbeatAt = now;
      job.leaseExpiresAt = new Date(now.getTime() + leaseMs);
      job.nextAttemptAt = null;
      job.attemptCount += 1;
      job.startedAt ??= now;
      job.completedAt = null;
      job.failureCode = null;
      job.failureMessage = null;

      return {
        job: await repository.save(job),
        leaseToken,
      };
    });
  }

  heartbeat(
    input: OwnedIndexJobInput,
    leaseMs: number,
  ): Promise<IndexJobHeartbeatResult | null> {
    return this.dataSource.transaction(async (manager) => {
      const job = await this.findOwnedRunningJob(manager, input);

      if (!job) {
        return null;
      }

      const now = new Date();
      job.lastHeartbeatAt = now;
      job.leaseExpiresAt = new Date(now.getTime() + leaseMs);

      return {
        job: await manager.getRepository(IndexJobEntity).save(job),
        cancellationRequested: job.cancellationRequestedAt !== null,
      };
    });
  }

  advancePhase(
    input: OwnedIndexJobInput,
    phase: IndexJobPhase,
    leaseMs: number,
  ): Promise<IndexJobEntity | null> {
    return this.updateOwnedJob(input, leaseMs, (job) => {
      job.phase = phase;
    });
  }

  updateProgress(
    input: OwnedIndexJobInput,
    progress: IndexJobProgress,
    leaseMs: number,
  ): Promise<IndexJobEntity | null> {
    return this.updateOwnedJob(input, leaseMs, (job) => {
      job.totalFiles = progress.totalFiles;
      job.processedFiles = progress.processedFiles;
      job.skippedFiles = progress.skippedFiles;
      job.failedFiles = progress.failedFiles;
      job.processedSymbols = progress.processedSymbols;
      job.processedDependencies = progress.processedDependencies;
    });
  }

  complete(input: OwnedIndexJobInput): Promise<IndexJobEntity | null> {
    return this.dataSource.transaction(async (manager) => {
      const job = await this.findOwnedRunningJob(manager, input);

      if (
        !job ||
        job.cancellationRequestedAt !== null ||
        job.phase !== IndexJobPhase.Finalizing ||
        job.processedFiles + job.skippedFiles + job.failedFiles !==
          job.totalFiles ||
        job.failedFiles > 0
      ) {
        return null;
      }

      const now = new Date();
      job.status = IndexJobStatus.Succeeded;
      job.phase = IndexJobPhase.Finished;
      job.completedAt = now;
      this.clearLease(job);
      const saved = await manager.getRepository(IndexJobEntity).save(job);

      // Do not mark a newer branch head as indexed when this job completed an
      // older immutable commit snapshot.
      await manager.getRepository(RepositoryBranchEntity).update(
        {
          id: job.branchId,
          repositoryId: job.repositoryId,
          commitSha: job.targetCommitSha,
          status: BranchStatus.Active,
        },
        { lastIndexedAt: now },
      );

      return saved;
    });
  }

  fail(
    input: OwnedIndexJobInput,
    code: string,
    message: string,
    retryable: boolean,
    retryDelayMs: number,
  ): Promise<IndexJobEntity | null> {
    return this.dataSource.transaction(async (manager) => {
      const job = await this.findOwnedRunningJob(manager, input);

      if (!job) {
        return null;
      }

      const now = new Date();
      job.failureCode = code;
      job.failureMessage = message;
      this.clearLease(job);

      if (job.cancellationRequestedAt !== null) {
        job.status = IndexJobStatus.Cancelled;
        job.phase = IndexJobPhase.Finished;
        job.completedAt = now;
      } else if (retryable && job.attemptCount < job.maxAttempts) {
        this.resetForRetry(job, new Date(now.getTime() + retryDelayMs));
      } else {
        job.status = IndexJobStatus.Failed;
        job.phase = IndexJobPhase.Finished;
        job.completedAt = now;
      }

      return manager.getRepository(IndexJobEntity).save(job);
    });
  }

  acknowledgeCancellation(
    input: OwnedIndexJobInput,
  ): Promise<IndexJobEntity | null> {
    return this.dataSource.transaction(async (manager) => {
      const job = await this.findOwnedRunningJob(manager, input);

      if (!job || job.cancellationRequestedAt === null) {
        return null;
      }

      job.status = IndexJobStatus.Cancelled;
      job.phase = IndexJobPhase.Finished;
      job.completedAt = new Date();
      this.clearLease(job);

      return manager.getRepository(IndexJobEntity).save(job);
    });
  }

  requestCancellation(
    organizationId: string,
    repositoryId: number,
    jobId: number,
  ): Promise<IndexJobEntity | null> {
    return this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(IndexJobEntity);
      const job = await repository.findOne({
        where: { id: jobId, organizationId, repositoryId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!job) {
        return null;
      }

      if (job.status === IndexJobStatus.Queued) {
        job.cancellationRequestedAt = new Date();
        job.status = IndexJobStatus.Cancelled;
        job.phase = IndexJobPhase.Finished;
        job.completedAt = job.cancellationRequestedAt;
        this.clearLease(job);
        return repository.save(job);
      }

      if (job.status === IndexJobStatus.Running) {
        job.cancellationRequestedAt ??= new Date();
        return repository.save(job);
      }

      return job;
    });
  }

  recoverExpiredLeases(
    batchSize: number,
    retryDelayMs: number,
  ): Promise<IndexJobEntity[]> {
    return this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(IndexJobEntity);
      const now = new Date();
      const jobs = await repository
        .createQueryBuilder('job')
        .setLock('pessimistic_write')
        .setOnLocked('skip_locked')
        .where('job.status = :status', { status: IndexJobStatus.Running })
        .andWhere('job.leaseExpiresAt <= :now', { now })
        .orderBy('job.leaseExpiresAt', 'ASC')
        .addOrderBy('job.id', 'ASC')
        .take(batchSize)
        .getMany();

      for (const job of jobs) {
        this.clearLease(job);

        if (job.cancellationRequestedAt !== null) {
          job.status = IndexJobStatus.Cancelled;
          job.phase = IndexJobPhase.Finished;
          job.completedAt = now;
        } else if (job.attemptCount < job.maxAttempts) {
          job.failureCode = 'lease_expired';
          job.failureMessage = 'Worker lease expired before completion';
          this.resetForRetry(job, new Date(now.getTime() + retryDelayMs));
        } else {
          job.status = IndexJobStatus.Failed;
          job.phase = IndexJobPhase.Finished;
          job.failureCode = 'lease_expired';
          job.failureMessage = 'Worker lease expired and no attempts remain';
          job.completedAt = now;
        }
      }

      return jobs.length === 0 ? [] : repository.save(jobs);
    });
  }

  private updateOwnedJob(
    input: OwnedIndexJobInput,
    leaseMs: number,
    update: (job: IndexJobEntity) => void,
  ): Promise<IndexJobEntity | null> {
    return this.dataSource.transaction(async (manager) => {
      const job = await this.findOwnedRunningJob(manager, input);

      if (!job || job.cancellationRequestedAt !== null) {
        return null;
      }

      const now = new Date();
      update(job);
      job.lastHeartbeatAt = now;
      job.leaseExpiresAt = new Date(now.getTime() + leaseMs);

      return manager.getRepository(IndexJobEntity).save(job);
    });
  }

  private findOwnedRunningJob(
    manager: EntityManager,
    input: OwnedIndexJobInput,
  ): Promise<IndexJobEntity | null> {
    return manager.getRepository(IndexJobEntity).findOne({
      where: {
        id: input.jobId,
        status: IndexJobStatus.Running,
        leaseToken: input.leaseToken,
        leaseExpiresAt: MoreThan(new Date()),
      },
      lock: { mode: 'pessimistic_write' },
    });
  }

  private resetForRetry(job: IndexJobEntity, nextAttemptAt: Date): void {
    job.status = IndexJobStatus.Queued;
    job.phase = IndexJobPhase.Queued;
    job.totalFiles = 0;
    job.processedFiles = 0;
    job.skippedFiles = 0;
    job.failedFiles = 0;
    job.processedSymbols = 0;
    job.processedDependencies = 0;
    job.completedAt = null;
    job.nextAttemptAt = nextAttemptAt;
  }

  private clearLease(job: IndexJobEntity): void {
    job.claimedBy = null;
    job.leaseToken = null;
    job.lastHeartbeatAt = null;
    job.leaseExpiresAt = null;
  }
}
