import { IndexJobStatus } from '../enums/index-job-status.enum';
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
  targetCommitSha: string;
  progress: {
    totalFiles: number;
    processedFiles: number;
    skippedFiles: number;
    failedFiles: number;
  };
  attemptCount: number;
  failure: {
    code: string | null;
    message: string | null;
  } | null;
  startedAt: string | null;
  completedAt: string | null;
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
