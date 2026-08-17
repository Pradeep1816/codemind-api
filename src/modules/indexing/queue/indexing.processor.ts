import { Inject, Injectable } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { QueryFailedError } from 'typeorm';
import indexingConfig from '../../../config/indexing.config';
import { GitCommandError } from '../../repositories/git/git.errors';
import { ContentHashService } from '../content/content-hash.service';
import { ContentAnalysisFile } from '../content/content-hash.types';
import { DependencyExtractionService } from '../dependencies/dependency-extraction.service';
import { IndexJobEntity } from '../entities/index-job.entity';
import { IndexJobPhase } from '../enums/index-job-phase.enum';
import { IndexingErrorPhase } from '../enums/indexing-error-phase.enum';
import { FileInventoryService } from '../file-inventory.service';
import {
  ClaimedIndexJob,
  IndexJobProgress,
  OwnedIndexJobInput,
} from '../lifecycle/index-job-lifecycle.types';
import { IndexingJobService } from '../services/indexing-job.service';
import { SymbolExtractionService } from '../symbols/symbol-extraction.service';

interface SafeIndexingFailure {
  code: string;
  message: string;
  retryable: boolean;
}

class IndexingCancellationRequestedError extends Error {
  constructor() {
    super('Indexing job cancellation was requested');
    this.name = IndexingCancellationRequestedError.name;
  }
}

class IndexingWorkerStoppingError extends Error {
  constructor() {
    super('Indexing worker is shutting down');
    this.name = IndexingWorkerStoppingError.name;
  }
}

class IndexingHeartbeatMonitor {
  private readonly controller = new AbortController();
  private readonly task: Promise<void>;
  private cancellationRequested = false;
  private failure: unknown;

  constructor(
    private readonly indexingJobService: IndexingJobService,
    private readonly ownership: OwnedIndexJobInput,
    private readonly intervalMs: number,
  ) {
    this.task = this.run();
  }

  async checkpoint(workerStopping: boolean): Promise<void> {
    if (workerStopping) {
      throw new IndexingWorkerStoppingError();
    }

    if (this.failure) {
      throw this.failure instanceof Error
        ? this.failure
        : new Error('Indexing heartbeat failed');
    }

    const heartbeat = await this.indexingJobService.heartbeat(this.ownership);
    this.cancellationRequested ||= heartbeat.cancellationRequested;

    if (this.cancellationRequested) {
      throw new IndexingCancellationRequestedError();
    }
  }

  async stop(): Promise<void> {
    this.controller.abort();
    await this.task;
  }

  wasCancellationRequested(): boolean {
    return this.cancellationRequested;
  }

  private async run(): Promise<void> {
    while (!this.controller.signal.aborted) {
      await this.wait(this.intervalMs, this.controller.signal);

      if (this.controller.signal.aborted) {
        return;
      }

      try {
        const heartbeat = await this.indexingJobService.heartbeat(
          this.ownership,
        );
        this.cancellationRequested ||= heartbeat.cancellationRequested;
      } catch (error: unknown) {
        this.failure = error;
        return;
      }
    }
  }

  private wait(milliseconds: number, signal: AbortSignal): Promise<void> {
    return new Promise((resolve) => {
      const onAbort = (): void => {
        clearTimeout(timeout);
        resolve();
      };
      const timeout = setTimeout(() => {
        signal.removeEventListener('abort', onAbort);
        resolve();
      }, milliseconds);

      signal.addEventListener('abort', onAbort, { once: true });
    });
  }
}

@Injectable()
export class IndexingProcessor {
  constructor(
    @Inject(indexingConfig.KEY)
    private readonly configuration: ConfigType<typeof indexingConfig>,
    private readonly indexingJobService: IndexingJobService,
    private readonly fileInventoryService: FileInventoryService,
    private readonly contentHashService: ContentHashService,
    private readonly symbolExtractionService: SymbolExtractionService,
    private readonly dependencyExtractionService: DependencyExtractionService,
  ) {}

  /** Executes one claimed immutable commit outside the HTTP request process. */
  async process(
    claimed: ClaimedIndexJob,
    isWorkerStopping: () => boolean,
  ): Promise<void> {
    const job = claimed.job;
    const ownership: OwnedIndexJobInput = {
      jobId: job.id,
      leaseToken: claimed.leaseToken,
    };
    const monitor = new IndexingHeartbeatMonitor(
      this.indexingJobService,
      ownership,
      this.configuration.jobHeartbeatIntervalMs,
    );
    const progress: IndexJobProgress = {
      totalFiles: 0,
      processedFiles: 0,
      skippedFiles: 0,
      failedFiles: 0,
      processedSymbols: 0,
      processedDependencies: 0,
    };
    let errorPhase = IndexingErrorPhase.Materialization;
    let currentFile: ContentAnalysisFile | null = null;

    try {
      await monitor.checkpoint(isWorkerStopping());
      errorPhase = IndexingErrorPhase.Discovery;
      await this.indexingJobService.advancePhase(
        ownership,
        IndexJobPhase.Discovering,
      );
      const inventory = await this.fileInventoryService.discoverAndPersist(
        job.organizationId,
        job.repositoryId,
        job.id,
        claimed.leaseToken,
      );
      progress.totalFiles = inventory.files.length;
      await this.indexingJobService.updateProgress(ownership, progress, null);

      await monitor.checkpoint(isWorkerStopping());
      errorPhase = IndexingErrorPhase.Hashing;
      await this.indexingJobService.advancePhase(
        ownership,
        IndexJobPhase.Hashing,
      );
      const hashResult = await this.contentHashService.hashInventory(
        inventory,
        claimed.leaseToken,
      );
      progress.skippedFiles =
        progress.totalFiles - hashResult.analysisFiles.length;
      await this.indexingJobService.updateProgress(ownership, progress, null);

      await monitor.checkpoint(isWorkerStopping());
      errorPhase = IndexingErrorPhase.Parsing;
      await this.indexingJobService.advancePhase(
        ownership,
        IndexJobPhase.ExtractingSymbols,
      );

      for (const file of hashResult.analysisFiles) {
        currentFile = file;
        await monitor.checkpoint(isWorkerStopping());
        await this.indexingJobService.updateProgress(
          ownership,
          progress,
          file.path,
        );
        const result = await this.symbolExtractionService.extractAndPersist(
          this.createAnalysisInput(job, claimed.leaseToken, file),
        );
        progress.processedSymbols += result.parsedSymbols;
        currentFile = null;
      }

      await this.indexingJobService.updateProgress(ownership, progress, null);
      await monitor.checkpoint(isWorkerStopping());
      await this.indexingJobService.advancePhase(
        ownership,
        IndexJobPhase.BuildingGraph,
      );

      for (const file of hashResult.analysisFiles) {
        currentFile = file;
        await monitor.checkpoint(isWorkerStopping());
        await this.indexingJobService.updateProgress(
          ownership,
          progress,
          file.path,
        );
        const result =
          await this.dependencyExtractionService.extractDependenciesAndPersist(
            this.createAnalysisInput(job, claimed.leaseToken, file),
          );
        errorPhase = IndexingErrorPhase.Persistence;
        await this.indexingJobService.markFileComplete(ownership, job, file);
        progress.processedFiles += 1;
        progress.processedDependencies += result.parsedDependencies;
        errorPhase = IndexingErrorPhase.Parsing;
        currentFile = null;
      }

      await this.indexingJobService.updateProgress(ownership, progress, null);
      await monitor.checkpoint(isWorkerStopping());
      errorPhase = IndexingErrorPhase.Finalization;
      await this.indexingJobService.advancePhase(
        ownership,
        IndexJobPhase.Finalizing,
      );
      await monitor.stop();
      await this.indexingJobService.complete(ownership);
    } catch (error: unknown) {
      await monitor.stop();
      await this.handleFailure(
        error,
        monitor,
        ownership,
        job,
        currentFile,
        errorPhase,
        progress,
      );
    }
  }

  private createAnalysisInput(
    job: IndexJobEntity,
    leaseToken: string,
    file: ContentAnalysisFile,
  ) {
    return {
      organizationId: job.organizationId,
      repositoryId: job.repositoryId,
      branchId: job.branchId,
      indexJobId: job.id,
      leaseToken,
      targetCommitSha: job.targetCommitSha,
      indexedFileId: file.indexedFileId,
      fileHashId: file.fileHashId,
      path: file.path,
      language: file.language,
      extension: file.extension,
      gitBlobOid: file.gitBlobOid,
      expectedSizeBytes: file.sizeBytes,
    };
  }

  private async handleFailure(
    error: unknown,
    monitor: IndexingHeartbeatMonitor,
    ownership: OwnedIndexJobInput,
    job: IndexJobEntity,
    currentFile: ContentAnalysisFile | null,
    phase: IndexingErrorPhase,
    progress: IndexJobProgress,
  ): Promise<void> {
    if (
      error instanceof IndexingCancellationRequestedError ||
      monitor.wasCancellationRequested() ||
      (await this.isCancellationPending(ownership))
    ) {
      await this.tryAcknowledgeCancellation(ownership);
      return;
    }

    const failure = this.toSafeFailure(error);

    if (currentFile) {
      progress.failedFiles += 1;

      try {
        await this.indexingJobService.updateProgress(
          ownership,
          progress,
          currentFile.path,
        );
      } catch {
        // The lease may already be expired; recovery owns the next transition.
      }
    }

    try {
      await this.indexingJobService.recordFailure({
        ...ownership,
        job,
        indexedFileId: currentFile?.indexedFileId ?? null,
        phase,
        ...failure,
      });
      await this.indexingJobService.fail(
        ownership,
        failure.code,
        failure.message,
        failure.retryable,
      );
    } catch (terminalError: unknown) {
      console.error(
        `indexing job ${job.id} could not persist its failure transition`,
        terminalError,
      );
    }

    console.error(`indexing job ${job.id} failed`, error);
  }

  private async isCancellationPending(
    ownership: OwnedIndexJobInput,
  ): Promise<boolean> {
    try {
      return (await this.indexingJobService.heartbeat(ownership))
        .cancellationRequested;
    } catch {
      return false;
    }
  }

  private async tryAcknowledgeCancellation(
    ownership: OwnedIndexJobInput,
  ): Promise<void> {
    try {
      await this.indexingJobService.acknowledgeCancellation(ownership);
    } catch {
      // Expired-lease recovery will finalize the pending cancellation.
    }
  }

  private toSafeFailure(error: unknown): SafeIndexingFailure {
    if (error instanceof IndexingWorkerStoppingError) {
      return {
        code: 'worker_shutdown',
        message: 'Indexing worker stopped before the job completed',
        retryable: true,
      };
    }

    if (error instanceof GitCommandError) {
      return {
        code: error.timedOut ? 'git_timeout' : 'git_command_failed',
        message: error.message.slice(0, 1_000),
        retryable: true,
      };
    }

    if (error instanceof QueryFailedError) {
      return {
        code: 'database_operation_failed',
        message: 'A database operation failed during indexing',
        retryable: true,
      };
    }

    if (error instanceof Error) {
      const code = this.readStableErrorCode(error);

      if (code) {
        return {
          code,
          message: error.message.slice(0, 1_000),
          retryable: false,
        };
      }
    }

    return {
      code: 'indexing_pipeline_failed',
      message: 'The indexing pipeline failed unexpectedly',
      retryable: false,
    };
  }

  private readStableErrorCode(error: Error): string | null {
    const code = (error as Error & { code?: unknown }).code;

    return typeof code === 'string' && /^[a-z][a-z0-9_]{0,99}$/u.test(code)
      ? code
      : null;
  }
}
