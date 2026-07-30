import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import { CreateRepositoryDto } from './dto/create-repository.dto';
import { ListRepositoriesQueryDto } from './dto/list-repositories-query.dto';
import {
  RepositoryListResponseDto,
  RepositoryResponseDto,
} from './dto/repository-response.dto';
import { UpdateRepositoryDto } from './dto/update-repository.dto';
import {
  RepositoryEntity,
  RepositoryProvider,
} from './entities/repository.entity';
import { RepositoriesRepository } from './repositories/repositories.repository';

interface PostgresDriverError extends Error {
  code?: string;
  constraint?: string;
}

@Injectable()
export class RepositoriesService {
  constructor(
    private readonly repositoriesRepository: RepositoriesRepository,
  ) {}

  async create(
    organizationId: string,
    createdByUserId: string,
    input: CreateRepositoryDto,
  ): Promise<RepositoryResponseDto> {
    const remoteUrl = this.normalizeRemoteUrl(input.remoteUrl);
    const existing =
      await this.repositoriesRepository.findByRemoteUrlAndOrganization(
        organizationId,
        remoteUrl,
      );

    if (existing) {
      throw new ConflictException(
        'Repository is already registered in this organization',
      );
    }

    try {
      const repository = await this.repositoriesRepository.create({
        organizationId,
        createdByUserId,
        name: input.name.trim(),
        provider: this.detectProvider(remoteUrl),
        remoteUrl,
        defaultBranch: input.defaultBranch?.trim() ?? null,
      });

      return this.toResponse(repository);
    } catch (error: unknown) {
      if (
        this.getUniqueConstraint(error) ===
        'uq_repositories_organization_remote_url'
      ) {
        throw new ConflictException(
          'Repository is already registered in this organization',
        );
      }

      throw error;
    }
  }

  async list(
    organizationId: string,
    query: ListRepositoriesQueryDto,
  ): Promise<RepositoryListResponseDto> {
    const [repositories, total] =
      await this.repositoriesRepository.findManyByOrganization({
        organizationId,
        page: query.page,
        limit: query.limit,
        search: query.search,
        provider: query.provider,
        status: query.status,
      });

    return {
      data: repositories.map((repository) => this.toResponse(repository)),
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  async findOne(
    organizationId: string,
    repositoryId: number,
  ): Promise<RepositoryResponseDto> {
    return this.toResponse(
      await this.getRequiredRepository(organizationId, repositoryId),
    );
  }

  async update(
    organizationId: string,
    repositoryId: number,
    input: UpdateRepositoryDto,
  ): Promise<RepositoryResponseDto> {
    if (
      input.name === undefined &&
      input.defaultBranch === undefined &&
      input.status === undefined
    ) {
      throw new BadRequestException(
        'At least one repository field must be provided',
      );
    }

    const repository = await this.getRequiredRepository(
      organizationId,
      repositoryId,
    );

    if (input.name !== undefined) {
      repository.name = input.name.trim();
    }

    if (input.defaultBranch !== undefined) {
      repository.defaultBranch = input.defaultBranch.trim();
    }

    if (input.status !== undefined) {
      repository.status = input.status;
    }

    return this.toResponse(await this.repositoriesRepository.save(repository));
  }

  async remove(organizationId: string, repositoryId: number): Promise<void> {
    const deleted = await this.repositoriesRepository.deleteByIdAndOrganization(
      repositoryId,
      organizationId,
    );

    if (!deleted) {
      throw new NotFoundException('Repository was not found');
    }
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

  private normalizeRemoteUrl(value: string): string {
    let remoteUrl: URL;

    try {
      remoteUrl = new URL(value.trim());
    } catch {
      throw new BadRequestException('Repository URL must be a valid HTTPS URL');
    }

    if (
      remoteUrl.protocol !== 'https:' ||
      remoteUrl.username ||
      remoteUrl.password ||
      remoteUrl.search ||
      remoteUrl.hash
    ) {
      throw new BadRequestException(
        'Repository URL must use HTTPS without credentials, query parameters, or fragments',
      );
    }

    remoteUrl.pathname = remoteUrl.pathname.replace(/\/+$/, '');

    if (!remoteUrl.pathname || remoteUrl.pathname === '/') {
      throw new BadRequestException(
        'Repository URL must include a repository path',
      );
    }

    return remoteUrl.toString();
  }

  private detectProvider(remoteUrl: string): RepositoryProvider {
    const hostname = new URL(remoteUrl).hostname.toLowerCase();

    if (hostname === 'github.com') {
      return RepositoryProvider.GitHub;
    }

    if (hostname === 'gitlab.com') {
      return RepositoryProvider.GitLab;
    }

    if (hostname === 'bitbucket.org') {
      return RepositoryProvider.Bitbucket;
    }

    return RepositoryProvider.Generic;
  }

  private getUniqueConstraint(error: unknown): string | undefined {
    if (!(error instanceof QueryFailedError)) {
      return undefined;
    }

    const { code, constraint } = error.driverError as PostgresDriverError;

    return code === '23505' && typeof constraint === 'string'
      ? constraint
      : undefined;
  }

  private toResponse(repository: RepositoryEntity): RepositoryResponseDto {
    return {
      id: repository.id,
      name: repository.name,
      provider: repository.provider,
      remoteUrl: repository.remoteUrl,
      defaultBranch: repository.defaultBranch,
      status: repository.status,
      createdAt: repository.createdAt.toISOString(),
      updatedAt: repository.updatedAt.toISOString(),
    };
  }
}
