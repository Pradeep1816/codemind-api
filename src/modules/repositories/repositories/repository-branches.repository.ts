import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import {
  BranchStatus,
  RepositoryBranchEntity,
} from '../entities/repository-branch.entity';
import type { GitBranchState } from '../git/git.types';

export interface RepositoryBranchHealthSummary {
  total: number;
  active: number;
  deleted: number;
  lastIndexedAt: Date | null;
}

interface RepositoryBranchHealthRawResult {
  total: string;
  active: string;
  deleted: string;
  lastIndexedAt: Date | string | null;
}

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

  async getHealthSummary(
    repositoryId: number,
  ): Promise<RepositoryBranchHealthSummary> {
    const result = await this.repository
      .createQueryBuilder('branch')
      .select('COUNT(branch.id)', 'total')
      .addSelect(
        'COUNT(branch.id) FILTER (WHERE branch.status = :activeStatus)',
        'active',
      )
      .addSelect(
        'COUNT(branch.id) FILTER (WHERE branch.status = :deletedStatus)',
        'deleted',
      )
      .addSelect('MAX(branch.lastIndexedAt)', 'lastIndexedAt')
      .where('branch.repositoryId = :repositoryId', { repositoryId })
      .setParameters({
        activeStatus: BranchStatus.Active,
        deletedStatus: BranchStatus.Deleted,
      })
      .getRawOne<RepositoryBranchHealthRawResult>();

    return {
      total: this.parseCount(result?.total),
      active: this.parseCount(result?.active),
      deleted: this.parseCount(result?.deleted),
      lastIndexedAt: this.parseDate(result?.lastIndexedAt),
    };
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

  private parseCount(value: string | undefined): number {
    const count = Number.parseInt(value ?? '0', 10);

    if (!Number.isSafeInteger(count) || count < 0) {
      throw new Error('Repository branch count is invalid');
    }

    return count;
  }

  private parseDate(value: Date | string | null | undefined): Date | null {
    if (value === null || value === undefined) {
      return null;
    }

    const date = value instanceof Date ? value : new Date(value);

    if (Number.isNaN(date.getTime())) {
      throw new Error('Repository branch index timestamp is invalid');
    }

    return date;
  }
}
