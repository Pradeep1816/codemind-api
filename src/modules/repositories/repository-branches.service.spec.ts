import {
  ConflictException,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import {
  BranchStatus,
  RepositoryBranchEntity,
} from './entities/repository-branch.entity';
import {
  RepositoryEntity,
  RepositoryProvider,
  RepositoryStatus,
  RepositorySyncStatus,
} from './entities/repository.entity';
import {
  GitCommandError,
  GitIntegrationError,
  GitIntegrationErrorCode,
} from './git/git.errors';
import { GitService } from './git/git.service';
import type { GitRepositoryState } from './git/git.types';
import { RepositoryBranchesService } from './repository-branches.service';
import { RepositoryBranchesRepository } from './repositories/repository-branches.repository';
import { RepositoriesRepository } from './repositories/repositories.repository';

describe('RepositoryBranchesService', () => {
  const organizationId = '5abf1e5e-e03c-4890-83a5-c4e84ad48d18';
  const repositoryId = 101;
  const createdAt = new Date('2026-08-01T08:00:00.000Z');
  const updatedAt = new Date('2026-08-01T09:00:00.000Z');
  const manager = {} as EntityManager;

  function createRepository(
    overrides: Partial<RepositoryEntity> = {},
  ): RepositoryEntity {
    return {
      id: repositoryId,
      organizationId,
      createdByUserId: '25d8bd53-047b-42d8-9efa-4ecedfe422d3',
      name: 'CodeMind API',
      provider: RepositoryProvider.GitHub,
      remoteUrl: 'https://github.com/codemind/codemind-api.git',
      defaultBranch: null,
      status: RepositoryStatus.Active,
      lastSyncStatus: RepositorySyncStatus.Never,
      lastSyncAttemptedAt: null,
      lastSyncedAt: null,
      repositorySizeBytes: null,
      createdAt,
      updatedAt,
      ...overrides,
    } as RepositoryEntity;
  }

  function createBranch(): RepositoryBranchEntity {
    return {
      id: 201,
      repositoryId,
      name: 'main',
      commitSha: 'a'.repeat(40),
      status: BranchStatus.Active,
      lastIndexedAt: null,
      createdAt,
      updatedAt,
    } as RepositoryBranchEntity;
  }

  function createContext(options?: {
    repository?: RepositoryEntity | null;
    lockedRepository?: RepositoryEntity | null;
    gitError?: Error;
  }): {
    service: RepositoryBranchesService;
    dataSource: { transaction: jest.Mock };
    repositoriesRepository: {
      findByIdAndOrganization: jest.Mock;
      findByIdAndOrganizationForUpdate: jest.Mock;
      save: jest.Mock;
    };
    branchesRepository: {
      findManyByRepository: jest.Mock;
      synchronize: jest.Mock;
    };
    gitService: { synchronizeRepository: jest.Mock };
    lockedRepository: RepositoryEntity | null;
  } {
    const repository =
      options && 'repository' in options
        ? options.repository
        : createRepository();
    const lockedRepository =
      options && 'lockedRepository' in options
        ? options.lockedRepository
        : createRepository();
    const branch = createBranch();
    const gitState: GitRepositoryState = {
      workspacePath: '/tmp/workspace',
      defaultBranch: 'main',
      headCommitSha: branch.commitSha,
      sizeBytes: 4_096,
      branches: [
        { name: 'main', commitSha: branch.commitSha!, isDefault: true },
      ],
    };
    const dataSource = {
      transaction: jest
        .fn()
        .mockImplementation(
          (callback: (transactionManager: EntityManager) => unknown) =>
            callback(manager),
        ),
    };
    const repositoriesRepository = {
      findByIdAndOrganization: jest.fn().mockResolvedValue(repository),
      findByIdAndOrganizationForUpdate: jest
        .fn()
        .mockResolvedValue(lockedRepository),
      save: jest
        .fn()
        .mockImplementation((entity: RepositoryEntity) =>
          Promise.resolve(entity),
        ),
    };
    const branchesRepository = {
      findManyByRepository: jest.fn().mockResolvedValue([branch]),
      synchronize: jest.fn().mockResolvedValue([branch]),
    };
    const gitService = {
      synchronizeRepository: options?.gitError
        ? jest.fn().mockRejectedValue(options.gitError)
        : jest.fn().mockResolvedValue(gitState),
    };
    const service = new RepositoryBranchesService(
      dataSource as unknown as DataSource,
      repositoriesRepository as unknown as RepositoriesRepository,
      branchesRepository as unknown as RepositoryBranchesRepository,
      gitService as unknown as GitService,
    );

    return {
      service,
      dataSource,
      repositoriesRepository,
      branchesRepository,
      gitService,
      lockedRepository,
    };
  }

  it('lists only branches belonging to a tenant-scoped repository', async () => {
    const context = createContext();

    await expect(
      context.service.list(organizationId, repositoryId),
    ).resolves.toEqual({
      repositoryId,
      defaultBranch: null,
      branches: [
        {
          id: 201,
          name: 'main',
          commitSha: 'a'.repeat(40),
          status: BranchStatus.Active,
          lastIndexedAt: null,
          createdAt: createdAt.toISOString(),
          updatedAt: updatedAt.toISOString(),
        },
      ],
    });
    expect(
      context.repositoriesRepository.findByIdAndOrganization,
    ).toHaveBeenCalledWith(repositoryId, organizationId);
    expect(
      context.branchesRepository.findManyByRepository,
    ).toHaveBeenCalledWith(repositoryId);
  });

  it('synchronizes Git state and persists it in one locked transaction', async () => {
    const context = createContext();

    const response = await context.service.synchronize(
      organizationId,
      repositoryId,
    );

    expect(context.gitService.synchronizeRepository).toHaveBeenCalledWith(
      'https://github.com/codemind/codemind-api.git',
      organizationId,
      repositoryId,
    );
    expect(
      context.repositoriesRepository.findByIdAndOrganizationForUpdate,
    ).toHaveBeenCalledWith(repositoryId, organizationId, manager);
    expect(context.repositoriesRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        defaultBranch: 'main',
        lastSyncStatus: RepositorySyncStatus.Succeeded,
        repositorySizeBytes: 4_096,
      }),
      manager,
    );
    expect(context.lockedRepository?.lastSyncAttemptedAt).toBeInstanceOf(Date);
    expect(context.lockedRepository?.lastSyncedAt).toBeInstanceOf(Date);
    expect(context.branchesRepository.synchronize).toHaveBeenCalledWith(
      repositoryId,
      expect.arrayContaining([expect.objectContaining({ name: 'main' })]),
      manager,
    );
    expect(response.defaultBranch).toBe('main');
  });

  it('returns not found without running Git for a cross-tenant repository', async () => {
    const context = createContext({ repository: null });

    await expect(
      context.service.synchronize(organizationId, repositoryId),
    ).rejects.toThrow(NotFoundException);
    expect(context.gitService.synchronizeRepository).not.toHaveBeenCalled();
  });

  it('rejects synchronization for a disabled repository', async () => {
    const context = createContext({
      repository: createRepository({ status: RepositoryStatus.Disabled }),
    });

    await expect(
      context.service.synchronize(organizationId, repositoryId),
    ).rejects.toThrow(ConflictException);
    expect(context.gitService.synchronizeRepository).not.toHaveBeenCalled();
  });

  it('rechecks disabled status while holding the repository lock', async () => {
    const context = createContext({
      lockedRepository: createRepository({
        status: RepositoryStatus.Disabled,
      }),
    });

    await expect(
      context.service.synchronize(organizationId, repositoryId),
    ).rejects.toThrow(ConflictException);
    expect(context.branchesRepository.synchronize).not.toHaveBeenCalled();
  });

  it('maps unsupported sources to a safe validation response', async () => {
    const context = createContext({
      gitError: new GitIntegrationError(
        'sensitive source detail',
        GitIntegrationErrorCode.UnsupportedSource,
      ),
    });

    await expect(
      context.service.synchronize(organizationId, repositoryId),
    ).rejects.toThrow(UnprocessableEntityException);
    expect(context.repositoriesRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        lastSyncStatus: RepositorySyncStatus.Failed,
        lastSyncedAt: null,
        repositorySizeBytes: null,
      }),
      manager,
    );
    expect(context.lockedRepository?.lastSyncAttemptedAt).toBeInstanceOf(Date);
  });

  it('maps command failures to a safe temporary failure response', async () => {
    const context = createContext({
      gitError: new GitCommandError('fetch secret source', 128, null, false),
    });

    await expect(
      context.service.synchronize(organizationId, repositoryId),
    ).rejects.toThrow(ServiceUnavailableException);
    expect(context.repositoriesRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        lastSyncStatus: RepositorySyncStatus.Failed,
      }),
      manager,
    );
  });

  it('maps workspace failures to a safe temporary failure response', async () => {
    const context = createContext({
      gitError: new GitIntegrationError(
        'sensitive workspace detail',
        GitIntegrationErrorCode.WorkspaceNotFound,
      ),
    });

    await expect(
      context.service.synchronize(organizationId, repositoryId),
    ).rejects.toThrow(ServiceUnavailableException);
    expect(context.repositoriesRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        lastSyncStatus: RepositorySyncStatus.Failed,
      }),
      manager,
    );
  });

  it('preserves the last successful health data after a failed attempt', async () => {
    const lastSyncedAt = new Date('2026-08-01T07:00:00.000Z');
    const lockedRepository = createRepository({
      lastSyncStatus: RepositorySyncStatus.Succeeded,
      lastSyncAttemptedAt: lastSyncedAt,
      lastSyncedAt,
      repositorySizeBytes: 2_048,
    });
    const context = createContext({
      lockedRepository,
      gitError: new GitCommandError('fetch repository', 128, null, false),
    });

    await expect(
      context.service.synchronize(organizationId, repositoryId),
    ).rejects.toThrow(ServiceUnavailableException);

    expect(lockedRepository).toMatchObject({
      lastSyncStatus: RepositorySyncStatus.Failed,
      lastSyncedAt,
      repositorySizeBytes: 2_048,
    });
    expect(lockedRepository.lastSyncAttemptedAt).toBeInstanceOf(Date);
  });
});
