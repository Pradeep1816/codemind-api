import { NotFoundException } from '@nestjs/common';
import {
  RepositoryEntity,
  RepositoryProvider,
  RepositoryStatus,
  RepositorySyncStatus,
} from './entities/repository.entity';
import { RepositoryStatusService } from './repository-status.service';
import { RepositoryBranchesRepository } from './repositories/repository-branches.repository';
import { RepositoriesRepository } from './repositories/repositories.repository';

describe('RepositoryStatusService', () => {
  const organizationId = '5abf1e5e-e03c-4890-83a5-c4e84ad48d18';
  const repositoryId = 101;
  const lastAttemptedAt = new Date('2026-08-01T10:00:00.000Z');
  const lastSyncedAt = new Date('2026-08-01T10:00:01.000Z');
  const lastIndexedAt = new Date('2026-08-01T10:05:00.000Z');

  function createRepository(): RepositoryEntity {
    return {
      id: repositoryId,
      organizationId,
      createdByUserId: '25d8bd53-047b-42d8-9efa-4ecedfe422d3',
      name: 'CodeMind API',
      provider: RepositoryProvider.GitHub,
      remoteUrl: 'https://github.com/codemind/codemind-api.git',
      defaultBranch: 'main',
      status: RepositoryStatus.Active,
      lastSyncStatus: RepositorySyncStatus.Succeeded,
      lastSyncAttemptedAt: lastAttemptedAt,
      lastSyncedAt,
      repositorySizeBytes: 8_192,
    } as RepositoryEntity;
  }

  it('returns tenant-scoped repository health with branch aggregates', async () => {
    const repositoriesRepository = {
      findByIdAndOrganization: jest.fn().mockResolvedValue(createRepository()),
    };
    const repositoryBranchesRepository = {
      getHealthSummary: jest.fn().mockResolvedValue({
        total: 3,
        active: 2,
        deleted: 1,
        lastIndexedAt,
      }),
    };
    const service = new RepositoryStatusService(
      repositoriesRepository as unknown as RepositoriesRepository,
      repositoryBranchesRepository as unknown as RepositoryBranchesRepository,
    );

    await expect(
      service.getStatus(organizationId, repositoryId),
    ).resolves.toEqual({
      repositoryId,
      status: RepositoryStatus.Active,
      sync: {
        status: RepositorySyncStatus.Succeeded,
        lastAttemptedAt: lastAttemptedAt.toISOString(),
        lastSyncedAt: lastSyncedAt.toISOString(),
      },
      indexing: {
        lastIndexedAt: lastIndexedAt.toISOString(),
      },
      branches: {
        total: 3,
        active: 2,
        deleted: 1,
      },
      repositorySizeBytes: 8_192,
    });
    expect(repositoriesRepository.findByIdAndOrganization).toHaveBeenCalledWith(
      repositoryId,
      organizationId,
    );
    expect(repositoryBranchesRepository.getHealthSummary).toHaveBeenCalledWith(
      repositoryId,
    );
  });

  it('returns not found without aggregating cross-tenant branch data', async () => {
    const repositoriesRepository = {
      findByIdAndOrganization: jest.fn().mockResolvedValue(null),
    };
    const repositoryBranchesRepository = {
      getHealthSummary: jest.fn(),
    };
    const service = new RepositoryStatusService(
      repositoriesRepository as unknown as RepositoriesRepository,
      repositoryBranchesRepository as unknown as RepositoryBranchesRepository,
    );

    await expect(
      service.getStatus(organizationId, repositoryId),
    ).rejects.toThrow(NotFoundException);
    expect(
      repositoryBranchesRepository.getHealthSummary,
    ).not.toHaveBeenCalled();
  });

  it('returns nullable health before the first synchronization or index', async () => {
    const repository = createRepository();
    repository.lastSyncStatus = RepositorySyncStatus.Never;
    repository.lastSyncAttemptedAt = null;
    repository.lastSyncedAt = null;
    repository.repositorySizeBytes = null;
    const repositoriesRepository = {
      findByIdAndOrganization: jest.fn().mockResolvedValue(repository),
    };
    const repositoryBranchesRepository = {
      getHealthSummary: jest.fn().mockResolvedValue({
        total: 0,
        active: 0,
        deleted: 0,
        lastIndexedAt: null,
      }),
    };
    const service = new RepositoryStatusService(
      repositoriesRepository as unknown as RepositoriesRepository,
      repositoryBranchesRepository as unknown as RepositoryBranchesRepository,
    );

    const result = await service.getStatus(organizationId, repositoryId);

    expect(result.sync).toEqual({
      status: RepositorySyncStatus.Never,
      lastAttemptedAt: null,
      lastSyncedAt: null,
    });
    expect(result.indexing.lastIndexedAt).toBeNull();
    expect(result.repositorySizeBytes).toBeNull();
  });
});
