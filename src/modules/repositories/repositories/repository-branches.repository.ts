import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import {
  BranchStatus,
  RepositoryBranchEntity,
} from '../entities/repository-branch.entity';
import type { GitBranchState } from '../git/git.types';

@Injectable()
export class RepositoryBranchesRepository {
  constructor(
    @InjectRepository(RepositoryBranchEntity)
    private readonly repository: Repository<RepositoryBranchEntity>,
  ) {}

  findManyByRepository(
    repositoryId: number,
    manager?: EntityManager,
  ): Promise<RepositoryBranchEntity[]> {
    return this.getRepository(manager).find({
      where: { repositoryId },
      order: {
        status: 'ASC',
        name: 'ASC',
        id: 'ASC',
      },
    });
  }

  async synchronize(
    repositoryId: number,
    branchStates: readonly GitBranchState[],
    manager: EntityManager,
  ): Promise<RepositoryBranchEntity[]> {
    const repository = this.getRepository(manager);
    const existingBranches = await this.findManyByRepository(
      repositoryId,
      manager,
    );
    const existingByName = new Map(
      existingBranches.map((branch) => [branch.name, branch]),
    );
    const observedNames = new Set<string>();
    const changedBranches: RepositoryBranchEntity[] = [];

    for (const branchState of branchStates) {
      observedNames.add(branchState.name);
      const existingBranch = existingByName.get(branchState.name);

      if (!existingBranch) {
        changedBranches.push(
          repository.create({
            repositoryId,
            name: branchState.name,
            commitSha: branchState.commitSha,
            status: BranchStatus.Active,
            lastIndexedAt: null,
          }),
        );
        continue;
      }

      if (
        existingBranch.commitSha !== branchState.commitSha ||
        existingBranch.status !== BranchStatus.Active
      ) {
        existingBranch.commitSha = branchState.commitSha;
        existingBranch.status = BranchStatus.Active;
        changedBranches.push(existingBranch);
      }
    }

    for (const existingBranch of existingBranches) {
      if (
        existingBranch.status === BranchStatus.Active &&
        !observedNames.has(existingBranch.name)
      ) {
        existingBranch.status = BranchStatus.Deleted;
        changedBranches.push(existingBranch);
      }
    }

    if (changedBranches.length > 0) {
      await repository.save(changedBranches, { chunk: 500 });
    }

    return this.findManyByRepository(repositoryId, manager);
  }

  private getRepository(
    manager?: EntityManager,
  ): Repository<RepositoryBranchEntity> {
    return manager?.getRepository(RepositoryBranchEntity) ?? this.repository;
  }
}
