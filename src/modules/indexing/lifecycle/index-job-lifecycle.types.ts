import { IndexJobEntity } from '../entities/index-job.entity';
import { IndexJobPhase } from '../enums/index-job-phase.enum';

export interface ClaimedIndexJob {
  job: IndexJobEntity;
  leaseToken: string;
}

export interface OwnedIndexJobInput {
  jobId: number;
  leaseToken: string;
}

export interface IndexJobHeartbeatResult {
  job: IndexJobEntity;
  cancellationRequested: boolean;
}

export interface IndexJobProgress {
  totalFiles: number;
  processedFiles: number;
  skippedFiles: number;
  failedFiles: number;
  processedSymbols: number;
  processedDependencies: number;
}

export interface UpdateIndexJobProgressInput extends OwnedIndexJobInput {
  progress: IndexJobProgress;
  currentFile: string | null;
}

export interface AdvanceIndexJobPhaseInput extends OwnedIndexJobInput {
  phase: IndexJobPhase;
}

export interface FailIndexJobInput extends OwnedIndexJobInput {
  code: string;
  message: string;
  retryable: boolean;
}
