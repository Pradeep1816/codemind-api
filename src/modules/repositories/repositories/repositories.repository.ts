import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  RepositoryEntity,
  RepositoryProvider,
  RepositoryStatus,
} from '../entities/repository.entity';

export interface CreateRepositoryRecord {
  organizationId: string;
  createdByUserId: string;
  name: string;
  provider: RepositoryProvider;
  remoteUrl: string;
  defaultBranch: string | null;
}

export interface FindOrganizationRepositoriesOptions {
  organizationId: string;
  page: number;
  limit: number;
  search?: string;
  provider?: RepositoryProvider;
  status?: RepositoryStatus;
}

@Injectable()
export class RepositoriesRepository {
  constructor(
    @InjectRepository(RepositoryEntity)
    private readonly repository: Repository<RepositoryEntity>,
  ) {}

  create(input: CreateRepositoryRecord): Promise<RepositoryEntity> {
    return this.repository.save(this.repository.create(input));
  }

  findByRemoteUrlAndOrganization(
    organizationId: string,
    remoteUrl: string,
  ): Promise<RepositoryEntity | null> {
    return this.repository.findOne({
      where: {
        organizationId,
        remoteUrl,
      },
      select: {
        id: true,
      },
    });
  }

  findManyByOrganization(
    options: FindOrganizationRepositoriesOptions,
  ): Promise<[RepositoryEntity[], number]> {
    const query = this.repository
      .createQueryBuilder('repository')
      .where('repository.organizationId = :organizationId', {
        organizationId: options.organizationId,
      });

    if (options.search) {
      query.andWhere(
        '(repository.name ILIKE :search OR repository.remoteUrl ILIKE :search)',
        {
          search: `%${options.search}%`,
        },
      );
    }

    if (options.provider) {
      query.andWhere('repository.provider = :provider', {
        provider: options.provider,
      });
    }

    if (options.status) {
      query.andWhere('repository.status = :status', {
        status: options.status,
      });
    }

    return query
      .orderBy('repository.createdAt', 'DESC')
      .addOrderBy('repository.id', 'ASC')
      .skip((options.page - 1) * options.limit)
      .take(options.limit)
      .getManyAndCount();
  }

  findByIdAndOrganization(
    repositoryId: number,
    organizationId: string,
  ): Promise<RepositoryEntity | null> {
    return this.repository.findOne({
      where: {
        id: repositoryId,
        organizationId,
      },
    });
  }

  save(repository: RepositoryEntity): Promise<RepositoryEntity> {
    return this.repository.save(repository);
  }

  async deleteByIdAndOrganization(
    repositoryId: number,
    organizationId: string,
  ): Promise<boolean> {
    const result = await this.repository.delete({
      id: repositoryId,
      organizationId,
    });

    return (result.affected ?? 0) > 0;
  }
}
