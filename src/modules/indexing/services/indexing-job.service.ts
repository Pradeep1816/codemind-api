import { ConflictException, Injectable } from '@nestjs/common';
import { ContentAnalysisFile } from '../content/content-hash.types';
import { IndexJobEntity } from '../entities/index-job.entity';
import { IndexJobPhase } from '../enums/index-job-phase.enum';
import { IndexingErrorPhase } from '../enums/indexing-error-phase.enum';
import { IndexingRepository } from '../indexing.repository';
import { IndexJobLifecycleService } from '../lifecycle/index-job-lifecycle.service';
import {
  ClaimedIndexJob,
  IndexJobHeartbeatResult,
  IndexJobProgress,
  OwnedIndexJobInput,
} from '../lifecycle/index-job-lifecycle.types';

export interface RecordIndexingFailureInput extends OwnedIndexJobInput {
  job: IndexJobEntity;
  indexedFileId: number | null;
  phase: IndexingErrorPhase;
  code: string;
  message: string;
  retryable: boolean;
}

@Injectable()
export class IndexingJobService {
  constructor(
    private readonly lifecycleService: IndexJobLifecycleService,
    private readonly indexingRepository: IndexingRepository,
  ) {}

  /** Claims one eligible durable job for the supplied worker identity. */
  claimNext(workerId: string): Promise<ClaimedIndexJob | null> {
    return this.lifecycleService.claimNext(workerId);
  }

  /** Recovers expired jobs so crashed workers cannot leave permanent work. */
  recoverExpired(): Promise<IndexJobEntity[]> {
    return this.lifecycleService.recoverExpiredLeases();
  }

  /** Renews ownership and returns the current cancellation signal. */
  heartbeat(input: OwnedIndexJobInput): Promise<IndexJobHeartbeatResult> {
    return this.lifecycleService.heartbeat(input);
  }

  /** Moves a lease-owned job through the ordered processing pipeline. */
  advancePhase(
    input: OwnedIndexJobInput,
    phase: IndexJobPhase,
  ): Promise<IndexJobEntity> {
    return this.lifecycleService.advancePhase({ ...input, phase });
  }

  /** Persists one absolute progress snapshot and the currently handled file. */
  updateProgress(
    input: OwnedIndexJobInput,
    progress: IndexJobProgress,
    currentFile: string | null,
  ): Promise<IndexJobEntity> {
    return this.lifecycleService.updateProgress({
      ...input,
      progress,
      currentFile,
    });
  }

  /** Marks a file hash reusable only after symbols and dependencies commit. */
  async markFileComplete(
    input: OwnedIndexJobInput,
    job: IndexJobEntity,
    file: ContentAnalysisFile,
  ): Promise<void> {
    const persisted = await this.indexingRepository.markFileAnalysisComplete({
      organizationId: job.organizationId,
      repositoryId: job.repositoryId,
      branchId: job.branchId,
      indexJobId: job.id,
      leaseToken: input.leaseToken,
      indexedFileId: file.indexedFileId,
      fileHashId: file.fileHashId,
      targetCommitSha: job.targetCommitSha,
    });

    if (!persisted) {
      throw new ConflictException(
        'Indexing job no longer owns file-analysis completion',
      );
    }
  }

  /** Stores a bounded failure record without persisting an internal stack. */
  recordFailure(input: RecordIndexingFailureInput): Promise<boolean> {
    return this.indexingRepository.persistError({
      organizationId: input.job.organizationId,
      repositoryId: input.job.repositoryId,
      indexJobId: input.job.id,
      leaseToken: input.leaseToken,
      indexedFileId: input.indexedFileId,
      phase: input.phase,
      code: input.code,
      message: input.message,
      retryable: input.retryable,
      attemptNumber: input.job.attemptCount,
    });
  }

  /** Finalizes a fully accounted, failure-free job. */
  complete(input: OwnedIndexJobInput): Promise<IndexJobEntity> {
    return this.lifecycleService.complete(input);
  }

  /** Requeues or terminally fails a job according to its attempt policy. */
  fail(
    input: OwnedIndexJobInput,
    code: string,
    message: string,
    retryable: boolean,
  ): Promise<IndexJobEntity> {
    return this.lifecycleService.fail({
      ...input,
      code,
      message,
      retryable,
    });
  }

  /** Finalizes a cancellation already requested through the public API. */
  acknowledgeCancellation(input: OwnedIndexJobInput): Promise<IndexJobEntity> {
    return this.lifecycleService.acknowledgeCancellation(input);
  }
}
