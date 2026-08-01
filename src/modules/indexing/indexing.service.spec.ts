import { ConflictException, NotFoundException } from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import { RepositoryBranchesService } from '../repositories/repository-branches.service';
import { RepositoriesService } from '../repositories/repositories.service';
import { BranchStatus } from '../repositories/entities/repository-branch.entity';
import {
  RepositoryProvider,
  RepositoryStatus,
} from '../repositories/entities/repository.entity';
import { ListIndexJobsQueryDto } from './dto/list-index-jobs-query.dto';
import { IndexJobEntity } from './entities/index-job.entity';
import { IndexJobStatus } from './enums/index-job-status.enum';
import { IndexJobTrigger } from './enums/index-job-trigger.enum';
import { IndexingMode } from './enums/indexing-mode.enum';
import { IndexingService } from './indexing.service';
import { IndexingRepository } from './indexing.repository';

describe('IndexingService', () => {
  const createdAt = new Date('2026-08-01T10:00:00.000Z');
  const updatedAt = new Date('2026-08-01T10:01:00.000Z');
  const commitSha = '8e008e725d9e411c5bff3a713b91afeaf4613f13';

  function createRepositoryResponse(
    status = RepositoryStatus.Active,
  ): Awaited<ReturnType<RepositoriesService['findOne']>> {
    return {
      id: 101,
      name: 'CodeMind API',
      provider: RepositoryProvider.GitHub,
      remoteUrl: 'https://github.com/codemind/codemind-api.git',
      defaultBranch: 'main',
      status,
      createdAt: createdAt.toISOString(),
      updatedAt: updatedAt.toISOString(),
    };
  }

  function createBranchResponse(
    overrides: Record<string, unknown> = {},
  ): Awaited<ReturnType<RepositoryBranchesService['list']>> {
    return {
      repositoryId: 101,
      defaultBranch: 'main',
      branches: [
        {
          id: 201,
          name: 'main',
          commitSha,
          status: BranchStatus.Active,
          lastIndexedAt: null,
          createdAt: createdAt.toISOString(),
          updatedAt: updatedAt.toISOString(),
          ...overrides,
        },
      ],
    };
  }

  function createEntity(
    overrides: Partial<IndexJobEntity> = {},
  ): IndexJobEntity {
    return {
      id: 301,
      organizationId: 'organization-id',
      repositoryId: 101,
      branchId: 201,
      requestedByUserId: 'user-id',
      trigger: IndexJobTrigger.Manual,
      mode: IndexingMode.Incremental,
      status: IndexJobStatus.Queued,
      targetCommitSha: commitSha,
      totalFiles: 0,
      processedFiles: 0,
      skippedFiles: 0,
      failedFiles: 0,
      attemptCount: 0,
      failureCode: null,
      failureMessage: null,
      startedAt: null,
      completedAt: null,
      createdAt,
      updatedAt,
      ...overrides,
    } as IndexJobEntity;
  }

  function createService(options?: {
    repositoryStatus?: RepositoryStatus;
    branchOverrides?: Record<string, unknown>;
    activeJob?: IndexJobEntity | null;
    createError?: unknown;
    jobs?: IndexJobEntity[];
    total?: number;
    foundJob?: IndexJobEntity | null;
  }) {
    const findOne = jest
      .fn()
      .mockResolvedValue(createRepositoryResponse(options?.repositoryStatus));
    const list = jest
      .fn()
      .mockResolvedValue(createBranchResponse(options?.branchOverrides));
    const create = options?.createError
      ? jest.fn().mockRejectedValue(options.createError)
      : jest.fn().mockResolvedValue(createEntity());
    const indexJobsRepository = {
      findActiveByRepositoryAndBranch: jest
        .fn()
        .mockResolvedValue(options?.activeJob ?? null),
      create,
      findManyByRepository: jest
        .fn()
        .mockResolvedValue([options?.jobs ?? [], options?.total ?? 0]),
      findByIdAndRepository: jest
        .fn()
        .mockResolvedValue(options?.foundJob ?? null),
    };

    return {
      service: new IndexingService(
        { findOne } as unknown as RepositoriesService,
        { list } as unknown as RepositoryBranchesService,
        indexJobsRepository as unknown as IndexingRepository,
      ),
      findOne,
      list,
      indexJobsRepository,
    };
  }

  it('queues a job for the synchronized branch commit snapshot', async () => {
    const { service, findOne, list, indexJobsRepository } = createService();

    const result = await service.createJob('organization-id', 'user-id', 101, {
      branchId: 201,
    });

    expect(findOne).toHaveBeenCalledWith('organization-id', 101);
    expect(list).toHaveBeenCalledWith('organization-id', 101);
    expect(
      indexJobsRepository.findActiveByRepositoryAndBranch,
    ).toHaveBeenCalledWith('organization-id', 101, 201);
    expect(indexJobsRepository.create).toHaveBeenCalledWith({
      organizationId: 'organization-id',
      repositoryId: 101,
      branchId: 201,
      requestedByUserId: 'user-id',
      trigger: IndexJobTrigger.Manual,
      mode: IndexingMode.Incremental,
      targetCommitSha: commitSha,
    });
    expect(result).toMatchObject({
      id: 301,
      branchId: 201,
      status: IndexJobStatus.Queued,
      targetCommitSha: commitSha,
      progress: {
        totalFiles: 0,
        processedFiles: 0,
        skippedFiles: 0,
        failedFiles: 0,
      },
    });
  });

  it('rejects disabled repositories before loading branches', async () => {
    const { service, list } = createService({
      repositoryStatus: RepositoryStatus.Disabled,
    });

    await expect(
      service.createJob('organization-id', 'user-id', 101, { branchId: 201 }),
    ).rejects.toThrow(ConflictException);
    expect(list).not.toHaveBeenCalled();
  });

  it('rejects an unknown repository branch', async () => {
    const { service } = createService({
      branchOverrides: { id: 202 },
    });

    await expect(
      service.createJob('organization-id', 'user-id', 101, { branchId: 201 }),
    ).rejects.toThrow(NotFoundException);
  });

  it.each([
    [{ status: BranchStatus.Deleted }, 'deleted branch'],
    [{ commitSha: null }, 'unsynchronized branch'],
  ])('rejects a %s', async (branchOverrides) => {
    const { service } = createService({ branchOverrides });

    await expect(
      service.createJob('organization-id', 'user-id', 101, { branchId: 201 }),
    ).rejects.toThrow(ConflictException);
  });

  it('rejects a second active job for the same branch', async () => {
    const { service, indexJobsRepository } = createService({
      activeJob: createEntity(),
    });

    await expect(
      service.createJob('organization-id', 'user-id', 101, { branchId: 201 }),
    ).rejects.toThrow(ConflictException);
    expect(indexJobsRepository.create).not.toHaveBeenCalled();
  });

  it('maps a database uniqueness race to a conflict', async () => {
    const driverError = Object.assign(new Error('duplicate key'), {
      code: '23505',
      constraint: 'uq_index_jobs_active_repository_branch',
    });
    const { service } = createService({
      createError: new QueryFailedError('INSERT', [], driverError),
    });

    await expect(
      service.createJob('organization-id', 'user-id', 101, { branchId: 201 }),
    ).rejects.toThrow(ConflictException);
  });

  it('lists only jobs scoped to the tenant and repository', async () => {
    const entity = createEntity({
      status: IndexJobStatus.Failed,
      totalFiles: 3,
      processedFiles: 1,
      failedFiles: 2,
      failureCode: 'PARSER_ERROR',
      failureMessage: 'Parser stopped unexpectedly',
      completedAt: updatedAt,
    });
    const { service, indexJobsRepository } = createService({
      jobs: [entity],
      total: 1,
    });
    const query = Object.assign(new ListIndexJobsQueryDto(), {
      page: 2,
      limit: 10,
      status: IndexJobStatus.Failed,
    });

    const result = await service.listJobs('organization-id', 101, query);

    expect(indexJobsRepository.findManyByRepository).toHaveBeenCalledWith({
      organizationId: 'organization-id',
      repositoryId: 101,
      page: 2,
      limit: 10,
      status: IndexJobStatus.Failed,
    });
    expect(result.pagination).toEqual({
      page: 2,
      limit: 10,
      total: 1,
      totalPages: 1,
    });
    expect(result.data[0]).toMatchObject({
      status: IndexJobStatus.Failed,
      failure: {
        code: 'PARSER_ERROR',
        message: 'Parser stopped unexpectedly',
      },
    });
  });

  it('does not disclose a job outside the tenant and repository scope', async () => {
    const { service, indexJobsRepository } = createService();

    await expect(service.findJob('organization-id', 101, 999)).rejects.toThrow(
      NotFoundException,
    );
    expect(indexJobsRepository.findByIdAndRepository).toHaveBeenCalledWith(
      'organization-id',
      101,
      999,
    );
  });
});
