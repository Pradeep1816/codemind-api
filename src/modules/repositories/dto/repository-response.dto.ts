import {
  RepositoryProvider,
  RepositoryStatus,
} from '../entities/repository.entity';

export interface RepositoryResponseDto {
  id: number;
  name: string;
  provider: RepositoryProvider;
  remoteUrl: string;
  defaultBranch: string | null;
  status: RepositoryStatus;
  createdAt: string;
  updatedAt: string;
}

export interface RepositoryListResponseDto {
  data: RepositoryResponseDto[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
