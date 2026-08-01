import { EntityManager, Repository } from 'typeorm';
import {
  BranchStatus,
  RepositoryBranchEntity,
} from '../entities/repository-branch.entity';
import { RepositoryBranchesRepository } from './repository-branches.repository';

describe('RepositoryBranchesRepository', () => {
  const repositoryId = 101;
  const indexedAt = new Date('2026-08-01T08:00:00.000Z');

  function createBranch(
    overrides: Partial<RepositoryBranchEntity>,
  ): RepositoryBranchEntity {
    return {
      id: 1,
      repositoryId,
      name: 'main',
      commitSha: 'a'.repeat(40),
      status: BranchStatus.Active,
      lastIndexedAt: indexedAt,
      createdAt: new Date('2026-08-01T07:00:00.000Z'),
      updatedAt: new Date('2026-08-01T07:30:00.000Z'),
      ...overrides,
    } as RepositoryBranchEntity;
  }

  it('creates, updates, restores, and soft-deletes branch records', async () => {
    const main = createBranch({ name: 'main' });
    const removed = createBranch({ id: 2, name: 'removed' });
    const restored = createBranch({
      id: 3,
      name: 'restored',
      status: BranchStatus.Deleted,
    });
    const finalBranches = [main, restored, removed];
    const find = jest
      .fn()
      .mockResolvedValueOnce([main, removed, restored])
      .mockResolvedValueOnce(finalBranches);
    const create = jest
      .fn()
      .mockImplementation((input: Partial<RepositoryBranchEntity>) =>
        createBranch({ id: 4, ...input }),
      );
    const save = jest.fn().mockResolvedValue(undefined);
    const typeormRepository = {
      find,
      create,
      save,
    } as unknown as Repository<RepositoryBranchEntity>;
    const manager = {
      getRepository: jest.fn().mockReturnValue(typeormRepository),
    } as unknown as EntityManager;
    const repository = new RepositoryBranchesRepository(typeormRepository);

    await expect(
      repository.synchronize(
        repositoryId,
        [
          { name: 'main', commitSha: 'b'.repeat(40), isDefault: true },
          { name: 'restored', commitSha: 'c'.repeat(40), isDefault: false },
          { name: 'new', commitSha: 'd'.repeat(40), isDefault: false },
        ],
        manager,
      ),
    ).resolves.toBe(finalBranches);

    expect(main).toMatchObject({
      commitSha: 'b'.repeat(40),
      status: BranchStatus.Active,
      lastIndexedAt: indexedAt,
    });
    expect(restored).toMatchObject({
      commitSha: 'c'.repeat(40),
      status: BranchStatus.Active,
      lastIndexedAt: indexedAt,
    });
    expect(removed.status).toBe(BranchStatus.Deleted);
    expect(create).toHaveBeenCalledWith({
      repositoryId,
      name: 'new',
      commitSha: 'd'.repeat(40),
      status: BranchStatus.Active,
      lastIndexedAt: null,
    });
    expect(save).toHaveBeenCalledWith(
      expect.arrayContaining([main, restored, removed]),
      { chunk: 500 },
    );
    expect(find).toHaveBeenCalledTimes(2);
  });

  it('does not write when observed branch state is unchanged', async () => {
    const main = createBranch({ name: 'main' });
    const find = jest.fn().mockResolvedValue([main]);
    const save = jest.fn();
    const typeormRepository = {
      find,
      create: jest.fn(),
      save,
    } as unknown as Repository<RepositoryBranchEntity>;
    const manager = {
      getRepository: jest.fn().mockReturnValue(typeormRepository),
    } as unknown as EntityManager;
    const repository = new RepositoryBranchesRepository(typeormRepository);

    await repository.synchronize(
      repositoryId,
      [{ name: 'main', commitSha: main.commitSha!, isDefault: true }],
      manager,
    );

    expect(save).not.toHaveBeenCalled();
  });

  it('aggregates branch lifecycle and latest indexing health', async () => {
    const queryBuilder = {
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      setParameters: jest.fn().mockReturnThis(),
      getRawOne: jest.fn().mockResolvedValue({
        total: '4',
        active: '3',
        deleted: '1',
        lastIndexedAt: '2026-08-01T08:00:00.000Z',
      }),
    };
    const typeormRepository = {
      createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
    } as unknown as Repository<RepositoryBranchEntity>;
    const repository = new RepositoryBranchesRepository(typeormRepository);

    await expect(repository.getHealthSummary(repositoryId)).resolves.toEqual({
      total: 4,
      active: 3,
      deleted: 1,
      lastIndexedAt: indexedAt,
    });
    expect(queryBuilder.where).toHaveBeenCalledWith(
      'branch.repositoryId = :repositoryId',
      { repositoryId },
    );
    expect(queryBuilder.setParameters).toHaveBeenCalledWith({
      activeStatus: BranchStatus.Active,
      deletedStatus: BranchStatus.Deleted,
    });
  });

  it('returns empty health for a repository without branches', async () => {
    const queryBuilder = {
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      setParameters: jest.fn().mockReturnThis(),
      getRawOne: jest.fn().mockResolvedValue({
        total: '0',
        active: '0',
        deleted: '0',
        lastIndexedAt: null,
      }),
    };
    const typeormRepository = {
      createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
    } as unknown as Repository<RepositoryBranchEntity>;
    const repository = new RepositoryBranchesRepository(typeormRepository);

    await expect(repository.getHealthSummary(repositoryId)).resolves.toEqual({
      total: 0,
      active: 0,
      deleted: 0,
      lastIndexedAt: null,
    });
  });
});
