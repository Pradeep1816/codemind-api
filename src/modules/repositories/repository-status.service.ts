import { Injectable, NotFoundException } from '@nestjs/common';
import { RepositoryStatusResponseDto } from './dto/repository-status-response.dto';
import { RepositoryBranchesRepository } from './repositories/repository-branches.repository';
import { RepositoriesRepository } from './repositories/repositories.repository';

@Injectable()
export class RepositoryStatusService {
  constructor(
    private readonly repositoriesRepository: RepositoriesRepository,
    private readonly repositoryBranchesRepository: RepositoryBranchesRepository,
  ) {}

  async getStatus(
    organizationId: string,
    repositoryId: number,
  ): Promise<RepositoryStatusResponseDto> {
    const repository =
      await this.repositoriesRepository.findByIdAndOrganization(
        repositoryId,
        organizationId,
      );

    if (!repository) {
      throw new NotFoundException('Repository was not found');
    }

    const branchSummary =
      await this.repositoryBranchesRepository.getHealthSummary(repositoryId);

    return {
      repositoryId: repository.id,
      status: repository.status,
      sync: {
        status: repository.lastSyncStatus,
        lastAttemptedAt: repository.lastSyncAttemptedAt?.toISOString() ?? null,
        lastSyncedAt: repository.lastSyncedAt?.toISOString() ?? null,
      },
      indexing: {
        lastIndexedAt: branchSummary.lastIndexedAt?.toISOString() ?? null,
      },
      branches: {
        total: branchSummary.total,
        active: branchSummary.active,
        deleted: branchSummary.deleted,
      },
      repositorySizeBytes: repository.repositorySizeBytes,
    };
  }
}
