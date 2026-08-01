import {
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import {
  RepositoryBranchResponseDto,
  RepositoryBranchesResponseDto,
} from './dto/repository-branch-response.dto';
import { RepositoryBranchEntity } from './entities/repository-branch.entity';
import {
  RepositoryEntity,
  RepositoryStatus,
} from './entities/repository.entity';
import {
  GitCommandError,
  GitIntegrationError,
  GitIntegrationErrorCode,
} from './git/git.errors';
import { GitService } from './git/git.service';
import type { GitRepositoryState } from './git/git.types';
import { RepositoryBranchesRepository } from './repositories/repository-branches.repository';
import { RepositoriesRepository } from './repositories/repositories.repository';

@Injectable()
export class RepositoryBranchesService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly repositoriesRepository: RepositoriesRepository,
    private readonly repositoryBranchesRepository: RepositoryBranchesRepository,
    private readonly gitService: GitService,
  ) {}

  async list(
    organizationId: string,
    repositoryId: number,
  ): Promise<RepositoryBranchesResponseDto> {
    const repository = await this.getRequiredRepository(
      organizationId,
      repositoryId,
    );
    const branches =
      await this.repositoryBranchesRepository.findManyByRepository(
        repositoryId,
      );

    return this.toResponse(repository, branches);
  }

  async synchronize(
    organizationId: string,
    repositoryId: number,
  ): Promise<RepositoryBranchesResponseDto> {
    const repository = await this.getRequiredRepository(
      organizationId,
      repositoryId,
    );

    this.ensureRepositoryIsActive(repository);

    let gitState: GitRepositoryState;

    try {
      gitState = await this.gitService.synchronizeRepository(
        repository.remoteUrl,
        organizationId,
        repositoryId,
      );
    } catch (error: unknown) {
      this.throwSynchronizationError(error);
    }

    return this.dataSource.transaction((manager) =>
      this.persistSynchronizedState(
        manager,
        organizationId,
        repositoryId,
        gitState,
      ),
    );
  }

  private async persistSynchronizedState(
    manager: EntityManager,
    organizationId: string,
    repositoryId: number,
    gitState: GitRepositoryState,
  ): Promise<RepositoryBranchesResponseDto> {
    const repository =
      await this.repositoriesRepository.findByIdAndOrganizationForUpdate(
        repositoryId,
        organizationId,
        manager,
      );

    if (!repository) {
      throw new NotFoundException('Repository was not found');
    }

    this.ensureRepositoryIsActive(repository);

    if (
      gitState.defaultBranch !== null &&
      repository.defaultBranch !== gitState.defaultBranch
    ) {
      repository.defaultBranch = gitState.defaultBranch;
      await this.repositoriesRepository.save(repository, manager);
    }

    const branches = await this.repositoryBranchesRepository.synchronize(
      repositoryId,
      gitState.branches,
      manager,
    );

    return this.toResponse(repository, branches);
  }

  private async getRequiredRepository(
    organizationId: string,
    repositoryId: number,
  ): Promise<RepositoryEntity> {
    const repository =
      await this.repositoriesRepository.findByIdAndOrganization(
        repositoryId,
        organizationId,
      );

    if (!repository) {
      throw new NotFoundException('Repository was not found');
    }

    return repository;
  }

  private ensureRepositoryIsActive(repository: RepositoryEntity): void {
    if (repository.status === RepositoryStatus.Disabled) {
      throw new ConflictException(
        'Disabled repositories cannot be synchronized',
      );
    }
  }

  private throwSynchronizationError(error: unknown): never {
    if (error instanceof GitIntegrationError) {
      if (
        error.code === GitIntegrationErrorCode.InvalidSource ||
        error.code === GitIntegrationErrorCode.UnsupportedSource ||
        error.code === GitIntegrationErrorCode.LocalSourceDisabled
      ) {
        throw new UnprocessableEntityException(
          'Repository source is not supported for synchronization',
        );
      }

      throw new ServiceUnavailableException(
        'Repository synchronization workspace is unavailable',
      );
    }

    if (error instanceof GitCommandError) {
      throw new ServiceUnavailableException(
        'Repository synchronization is temporarily unavailable',
      );
    }

    throw error;
  }

  private toResponse(
    repository: RepositoryEntity,
    branches: RepositoryBranchEntity[],
  ): RepositoryBranchesResponseDto {
    return {
      repositoryId: repository.id,
      defaultBranch: repository.defaultBranch,
      branches: branches.map((branch) => this.toBranchResponse(branch)),
    };
  }

  private toBranchResponse(
    branch: RepositoryBranchEntity,
  ): RepositoryBranchResponseDto {
    return {
      id: branch.id,
      name: branch.name,
      commitSha: branch.commitSha,
      status: branch.status,
      lastIndexedAt: branch.lastIndexedAt?.toISOString() ?? null,
      createdAt: branch.createdAt.toISOString(),
      updatedAt: branch.updatedAt.toISOString(),
    };
  }
}
