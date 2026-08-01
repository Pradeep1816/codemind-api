import {
  RepositoryStatus,
  RepositorySyncStatus,
} from '../entities/repository.entity';

export interface RepositoryStatusResponseDto {
  repositoryId: number;
  status: RepositoryStatus;
  sync: {
    status: RepositorySyncStatus;
    lastAttemptedAt: string | null;
    lastSyncedAt: string | null;
  };
  indexing: {
    lastIndexedAt: string | null;
  };
  branches: {
    total: number;
    active: number;
    deleted: number;
  };
  repositorySizeBytes: number | null;
}
