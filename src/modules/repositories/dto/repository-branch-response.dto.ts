import { BranchStatus } from '../entities/repository-branch.entity';

export interface RepositoryBranchResponseDto {
  id: number;
  name: string;
  commitSha: string | null;
  status: BranchStatus;
  lastIndexedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RepositoryBranchesResponseDto {
  repositoryId: number;
  defaultBranch: string | null;
  branches: RepositoryBranchResponseDto[];
}
