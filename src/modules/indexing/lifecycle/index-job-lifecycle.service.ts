import { ConflictException, Inject, Injectable } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import indexingConfig from '../../../config/indexing.config';
import { IndexJobEntity } from '../entities/index-job.entity';
import { IndexJobPhase } from '../enums/index-job-phase.enum';
import { IndexJobLifecycleRepository } from './index-job-lifecycle.repository';
import {
  AdvanceIndexJobPhaseInput,
  ClaimedIndexJob,
  FailIndexJobInput,
  IndexJobHeartbeatResult,
  OwnedIndexJobInput,
  UpdateIndexJobProgressInput,
} from './index-job-lifecycle.types';

const PHASE_ORDER: readonly IndexJobPhase[] = [
  IndexJobPhase.Preparing,
  IndexJobPhase.Discovering,
  IndexJobPhase.Hashing,
  IndexJobPhase.Analyzing,
  IndexJobPhase.Finalizing,
];

@Injectable()
export class IndexJobLifecycleService {
  constructor(
    @Inject(indexingConfig.KEY)
    private readonly configuration: ConfigType<typeof indexingConfig>,
    private readonly repository: IndexJobLifecycleRepository,
  ) {}

  claimNext(workerId: string): Promise<ClaimedIndexJob | null> {
    if (!/^[A-Za-z0-9._:-]{1,200}$/.test(workerId)) {
      throw new ConflictException('Index worker identity is invalid');
    }

    return this.repository.claimNext(workerId, this.configuration.jobLeaseMs);
  }

  async heartbeat(input: OwnedIndexJobInput): Promise<IndexJobHeartbeatResult> {
    return this.requireOwnership(
      await this.repository.heartbeat(input, this.configuration.jobLeaseMs),
    );
  }

  async advancePhase(
    input: AdvanceIndexJobPhaseInput,
  ): Promise<IndexJobEntity> {
    if (!PHASE_ORDER.includes(input.phase)) {
      throw new ConflictException('Indexing job phase cannot be set directly');
    }

    const heartbeat = await this.heartbeat(input);
    const currentIndex = PHASE_ORDER.indexOf(heartbeat.job.phase);
    const requestedIndex = PHASE_ORDER.indexOf(input.phase);

    if (requestedIndex < currentIndex || requestedIndex > currentIndex + 1) {
      throw new ConflictException('Invalid indexing job phase transition');
    }

    return this.requireOwnership(
      await this.repository.advancePhase(
        input,
        input.phase,
        this.configuration.jobLeaseMs,
      ),
    );
  }

  async updateProgress(
    input: UpdateIndexJobProgressInput,
  ): Promise<IndexJobEntity> {
    const values = Object.values(input.progress);
    const accountedFiles =
      input.progress.processedFiles +
      input.progress.skippedFiles +
      input.progress.failedFiles;

    if (
      values.some((value) => !Number.isSafeInteger(value) || value < 0) ||
      accountedFiles > input.progress.totalFiles
    ) {
      throw new ConflictException('Indexing progress is invalid');
    }

    const heartbeat = await this.heartbeat(input);
    const previous = heartbeat.job;

    if (
      input.progress.totalFiles < previous.totalFiles ||
      input.progress.processedFiles < previous.processedFiles ||
      input.progress.skippedFiles < previous.skippedFiles ||
      input.progress.failedFiles < previous.failedFiles ||
      input.progress.processedSymbols < previous.processedSymbols ||
      input.progress.processedDependencies < previous.processedDependencies
    ) {
      throw new ConflictException('Indexing progress cannot move backwards');
    }

    return this.requireOwnership(
      await this.repository.updateProgress(
        input,
        input.progress,
        this.configuration.jobLeaseMs,
      ),
    );
  }

  async complete(input: OwnedIndexJobInput): Promise<IndexJobEntity> {
    const heartbeat = await this.heartbeat(input);
    const job = heartbeat.job;

    if (heartbeat.cancellationRequested) {
      throw new ConflictException('Indexing job cancellation is pending');
    }

    if (
      job.phase !== IndexJobPhase.Finalizing ||
      job.processedFiles + job.skippedFiles + job.failedFiles !==
        job.totalFiles ||
      job.failedFiles > 0
    ) {
      throw new ConflictException('Indexing job is not ready for completion');
    }

    return this.requireOwnership(await this.repository.complete(input));
  }

  async fail(input: FailIndexJobInput): Promise<IndexJobEntity> {
    if (
      input.code.length < 1 ||
      input.code.length > 100 ||
      input.message.length < 1 ||
      input.message.length > 1_000
    ) {
      throw new ConflictException('Indexing failure metadata is invalid');
    }

    return this.requireOwnership(
      await this.repository.fail(
        input,
        input.code,
        input.message,
        input.retryable,
        this.configuration.jobRetryDelayMs,
      ),
    );
  }

  async acknowledgeCancellation(
    input: OwnedIndexJobInput,
  ): Promise<IndexJobEntity> {
    return this.requireOwnership(
      await this.repository.acknowledgeCancellation(input),
    );
  }

  recoverExpiredLeases(): Promise<IndexJobEntity[]> {
    return this.repository.recoverExpiredLeases(
      this.configuration.jobRecoveryBatchSize,
      this.configuration.jobRetryDelayMs,
    );
  }

  requestCancellation(
    organizationId: string,
    repositoryId: number,
    jobId: number,
  ): Promise<IndexJobEntity | null> {
    return this.repository.requestCancellation(
      organizationId,
      repositoryId,
      jobId,
    );
  }

  private requireOwnership<T>(result: T | null): T {
    if (!result) {
      throw new ConflictException(
        'Indexing job lease is expired, cancelled, or no longer owned',
      );
    }

    return result;
  }
}
