import { IndexJobStatus } from '../enums/index-job-status.enum';
import { IndexJobPhase } from '../enums/index-job-phase.enum';
import { IndexJobTrigger } from '../enums/index-job-trigger.enum';
import { IndexingMode } from '../enums/indexing-mode.enum';

export interface IndexStatusDto {
  id: number;
  repositoryId: number;
  branchId: number;
  requestedByUserId: string | null;
  trigger: IndexJobTrigger;
  mode: IndexingMode;
  status: IndexJobStatus;
  phase: IndexJobPhase;
  targetCommitSha: string;
  retryOfJobId: number | null;
  progress: {
    totalFiles: number;
    processedFiles: number;
    skippedFiles: number;
    failedFiles: number;
    processedSymbols: number;
    processedDependencies: number;
  };
  attemptCount: number;
  maxAttempts: number;
  failure: {
    code: string | null;
    message: string | null;
  } | null;
  startedAt: string | null;
  completedAt: string | null;
  lastHeartbeatAt: string | null;
  nextAttemptAt: string | null;
  cancellationRequestedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface IndexJobListResponseDto {
  data: IndexStatusDto[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
