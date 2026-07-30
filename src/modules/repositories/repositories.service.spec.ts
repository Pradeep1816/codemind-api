import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import {
  RepositoryEntity,
  RepositoryProvider,
  RepositoryStatus,
} from './entities/repository.entity';
import {
  CreateRepositoryRecord,
  RepositoriesRepository,
} from './repositories/repositories.repository';
import { RepositoriesService } from './repositories.service';
import { ListRepositoriesQueryDto } from './dto/list-repositories-query.dto';

describe('RepositoriesService', () => {
  const createdAt = new Date('2026-07-31T10:00:00.000Z');
  const updatedAt = new Date('2026-07-31T11:00:00.000Z');

  function createEntity(
    overrides: Partial<RepositoryEntity> = {},
  ): RepositoryEntity {
    return {
      id: 101,
      organizationId: 'organization-id',
      createdByUserId: 'user-id',
      name: 'CodeMind API',
      provider: RepositoryProvider.GitHub,
      remoteUrl: 'https://github.com/codemind/codemind-api.git',
      defaultBranch: 'main',
      status: RepositoryStatus.Active,
      createdAt,
      updatedAt,
      ...overrides,
    } as RepositoryEntity;
  }

  it('normalizes a credential-free URL and detects its provider', async () => {
    const create = jest
      .fn()
      .mockImplementation((input: CreateRepositoryRecord) =>
        Promise.resolve(
          createEntity({
            ...input,
            status: RepositoryStatus.Active,
          }),
        ),
      );
    const repository = {
      findByRemoteUrlAndOrganization: jest.fn().mockResolvedValue(null),
      create,
    } as unknown as RepositoriesRepository;
    const service = new RepositoriesService(repository);

    const result = await service.create('organization-id', 'user-id', {
      name: ' CodeMind API ',
      remoteUrl: 'https://github.com/codemind/codemind-api.git/',
      defaultBranch: ' main ',
    });

    expect(create).toHaveBeenCalledWith({
      organizationId: 'organization-id',
      createdByUserId: 'user-id',
      name: 'CodeMind API',
      provider: RepositoryProvider.GitHub,
      remoteUrl: 'https://github.com/codemind/codemind-api.git',
      defaultBranch: 'main',
    });
    expect(result).toEqual({
      id: 101,
      name: 'CodeMind API',
      provider: RepositoryProvider.GitHub,
      remoteUrl: 'https://github.com/codemind/codemind-api.git',
      defaultBranch: 'main',
      status: RepositoryStatus.Active,
      createdAt: createdAt.toISOString(),
      updatedAt: updatedAt.toISOString(),
    });
  });

  it('rejects a duplicate repository inside the organization', async () => {
    const repository = {
      findByRemoteUrlAndOrganization: jest.fn().mockResolvedValue({ id: 102 }),
      create: jest.fn(),
    } as unknown as RepositoriesRepository;
    const service = new RepositoriesService(repository);

    await expect(
      service.create('organization-id', 'user-id', {
        name: 'CodeMind API',
        remoteUrl: 'https://github.com/codemind/codemind-api.git',
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('rejects a URL without a repository path before persistence', async () => {
    const findByRemoteUrlAndOrganization = jest.fn();
    const repository = {
      findByRemoteUrlAndOrganization,
      create: jest.fn(),
    } as unknown as RepositoriesRepository;
    const service = new RepositoriesService(repository);

    await expect(
      service.create('organization-id', 'user-id', {
        name: 'Invalid Repository',
        remoteUrl: 'https://github.com/',
      }),
    ).rejects.toThrow(BadRequestException);
    expect(findByRemoteUrlAndOrganization).not.toHaveBeenCalled();
  });

  it('lists and paginates only repositories from the supplied organization', async () => {
    const entity = createEntity();
    const findManyByOrganization = jest.fn().mockResolvedValue([[entity], 1]);
    const repository = {
      findManyByOrganization,
    } as unknown as RepositoriesRepository;
    const service = new RepositoriesService(repository);
    const query = Object.assign(new ListRepositoriesQueryDto(), {
      page: 2,
      limit: 10,
      search: 'api',
      provider: RepositoryProvider.GitHub,
      status: RepositoryStatus.Active,
    });

    const result = await service.list('organization-id', query);

    expect(findManyByOrganization).toHaveBeenCalledWith({
      organizationId: 'organization-id',
      page: 2,
      limit: 10,
      search: 'api',
      provider: RepositoryProvider.GitHub,
      status: RepositoryStatus.Active,
    });
    expect(result.pagination).toEqual({
      page: 2,
      limit: 10,
      total: 1,
      totalPages: 1,
    });
    expect(result.data).toHaveLength(1);
  });

  it('does not disclose a repository from another organization', async () => {
    const findByIdAndOrganization = jest.fn().mockResolvedValue(null);
    const repository = {
      findByIdAndOrganization,
    } as unknown as RepositoriesRepository;
    const service = new RepositoriesService(repository);

    await expect(service.findOne('organization-id', 999)).rejects.toThrow(
      NotFoundException,
    );
    expect(findByIdAndOrganization).toHaveBeenCalledWith(
      999,
      'organization-id',
    );
  });

  it('updates mutable metadata while keeping the remote URL immutable', async () => {
    const entity = createEntity();
    const save = jest.fn().mockImplementation((value: RepositoryEntity) => {
      value.updatedAt = updatedAt;

      return Promise.resolve(value);
    });
    const repository = {
      findByIdAndOrganization: jest.fn().mockResolvedValue(entity),
      save,
    } as unknown as RepositoriesRepository;
    const service = new RepositoriesService(repository);

    const result = await service.update('organization-id', entity.id, {
      name: 'CodeMind Backend',
      defaultBranch: 'develop',
      status: RepositoryStatus.Disabled,
    });

    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'CodeMind Backend',
        defaultBranch: 'develop',
        status: RepositoryStatus.Disabled,
        remoteUrl: entity.remoteUrl,
      }),
    );
    expect(result.status).toBe(RepositoryStatus.Disabled);
  });

  it('requires at least one mutable field when updating', async () => {
    const findByIdAndOrganization = jest.fn();
    const repository = {
      findByIdAndOrganization,
    } as unknown as RepositoriesRepository;
    const service = new RepositoriesService(repository);

    await expect(service.update('organization-id', 101, {})).rejects.toThrow(
      BadRequestException,
    );
    expect(findByIdAndOrganization).not.toHaveBeenCalled();
  });

  it('returns not found when a tenant-scoped deletion changes no row', async () => {
    const repository = {
      deleteByIdAndOrganization: jest.fn().mockResolvedValue(false),
    } as unknown as RepositoriesRepository;
    const service = new RepositoriesService(repository);

    await expect(service.remove('organization-id', 999)).rejects.toThrow(
      NotFoundException,
    );
  });
});
