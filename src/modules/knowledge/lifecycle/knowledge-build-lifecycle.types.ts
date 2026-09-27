import { KnowledgeBuildEntity } from '../entities/knowledge-build.entity';
import { KnowledgeBuildPhase } from '../enums/knowledge-build-phase.enum';
import { KnowledgeBuildStatus } from '../enums/knowledge-build-status.enum';

export interface OwnedKnowledgeBuildLease {
  buildId: number;
  leaseToken: string;
}

export interface ClaimedKnowledgeBuild {
  build: KnowledgeBuildEntity;
  leaseToken: string;
}

export interface KnowledgeBuildHeartbeatResult {
  build: KnowledgeBuildEntity;
  cancellationRequested: boolean;
}

export interface KnowledgeBuildProgress {
  processedFiles: number;
  failedFiles: number;
  emittedFacts: number;
  persistedNodes: number;
  persistedEdges: number;
}

export interface UpdateKnowledgeBuildProgressInput extends OwnedKnowledgeBuildLease {
  progress: KnowledgeBuildProgress;
  currentFile: string | null;
}

export interface AdvanceKnowledgeBuildPhaseInput extends OwnedKnowledgeBuildLease {
  phase: KnowledgeBuildPhase;
}

export interface FailKnowledgeBuildInput extends OwnedKnowledgeBuildLease {
  code: string;
  message: string;
  retryable: boolean;
}

export interface RecordKnowledgeBuildErrorInput extends OwnedKnowledgeBuildLease {
  phase: KnowledgeBuildPhase;
  analyzerName: string | null;
  analyzerVersion: string | null;
  code: string;
  message: string;
  retryable: boolean;
  attemptNumber: number;
}

export interface FindKnowledgeBuildsOptions {
  organizationId: string;
  repositoryId: number;
  page: number;
  limit: number;
  status?: KnowledgeBuildStatus;
}
