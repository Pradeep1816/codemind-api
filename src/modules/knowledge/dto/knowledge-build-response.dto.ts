import { KnowledgeBuildPhase } from '../enums/knowledge-build-phase.enum';
import { KnowledgeBuildStatus } from '../enums/knowledge-build-status.enum';
import { KnowledgeBuildTrigger } from '../enums/knowledge-build-trigger.enum';
import { PaginationResponseDto } from './knowledge-response.dto';

export interface KnowledgeBuildResponseDto {
  id: number;
  repositoryId: number;
  branchId: number;
  sourceIndexJobId: number;
  requestedByUserId: string | null;
  trigger: KnowledgeBuildTrigger;
  status: KnowledgeBuildStatus;
  phase: KnowledgeBuildPhase;
  targetCommitSha: string;
  analyzerBundleVersion: string;
  configurationDigest: string;
  progress: {
    percentage: number;
    totalFiles: number;
    processedFiles: number;
    failedFiles: number;
    emittedFacts: number;
    persistedNodes: number;
    persistedEdges: number;
    currentFile: string | null;
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

export interface KnowledgeBuildListResponseDto {
  data: KnowledgeBuildResponseDto[];
  pagination: PaginationResponseDto;
}
