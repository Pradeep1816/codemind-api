import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { IndexJobEntity } from './entities/index-job.entity';
import { IndexedFileEntity } from './entities/indexed-file.entity';
import { IndexJobStatus } from './enums/index-job-status.enum';
import { IndexJobTrigger } from './enums/index-job-trigger.enum';
import { IndexedFileStatus } from './enums/indexed-file-status.enum';
import { IndexingMode } from './enums/indexing-mode.enum';

export interface CreateIndexJobRecord {
  organizationId: string;
  repositoryId: number;
  branchId: number;
  requestedByUserId: string;
  trigger: IndexJobTrigger;
  mode: IndexingMode;
  targetCommitSha: string;
}

export interface FindIndexJobsOptions {
  organizationId: string;
  repositoryId: number;
  page: number;
  limit: number;
  status?: IndexJobStatus;
}

export interface FileInventoryRecord {
  path: string;
  extension: string;
  sizeBytes: number;
}

export interface SynchronizeFileInventoryRecord {
  organizationId: string;
  repositoryId: number;
  branchId: number;
  indexJobId: number;
  targetCommitSha: string;
  files: readonly FileInventoryRecord[];
}

export interface FileInventoryPersistenceResult {
  activeFiles: number;
  newlyDeletedFiles: number;
}

@Injectable()
export class IndexingRepository {
  constructor(
    @InjectRepository(IndexJobEntity)
    private readonly indexJobRepository: Repository<IndexJobEntity>,
    @InjectRepository(IndexedFileEntity)
    private readonly indexedFileRepository: Repository<IndexedFileEntity>,
  ) {}

  create(input: CreateIndexJobRecord): Promise<IndexJobEntity> {
    return this.indexJobRepository.save(
      this.indexJobRepository.create({
        ...input,
        status: IndexJobStatus.Queued,
        totalFiles: 0,
        processedFiles: 0,
        skippedFiles: 0,
        failedFiles: 0,
        attemptCount: 0,
        failureCode: null,
        failureMessage: null,
        startedAt: null,
        completedAt: null,
      }),
    );
  }

  findActiveByRepositoryAndBranch(
    organizationId: string,
    repositoryId: number,
    branchId: number,
  ): Promise<IndexJobEntity | null> {
    return this.indexJobRepository.findOne({
      where: {
        organizationId,
        repositoryId,
        branchId,
        status: In([IndexJobStatus.Queued, IndexJobStatus.Running]),
      },
      order: {
        createdAt: 'DESC',
        id: 'DESC',
      },
    });
  }

  findManyByRepository(
    options: FindIndexJobsOptions,
  ): Promise<[IndexJobEntity[], number]> {
    const query = this.indexJobRepository
      .createQueryBuilder('job')
      .where('job.organizationId = :organizationId', {
        organizationId: options.organizationId,
      })
      .andWhere('job.repositoryId = :repositoryId', {
        repositoryId: options.repositoryId,
      });

    if (options.status) {
      query.andWhere('job.status = :status', { status: options.status });
    }

    return query
      .orderBy('job.createdAt', 'DESC')
      .addOrderBy('job.id', 'DESC')
      .skip((options.page - 1) * options.limit)
      .take(options.limit)
      .getManyAndCount();
  }

  findByIdAndRepository(
    organizationId: string,
    repositoryId: number,
    jobId: number,
  ): Promise<IndexJobEntity | null> {
    return this.indexJobRepository.findOne({
      where: {
        id: jobId,
        organizationId,
        repositoryId,
      },
    });
  }

  /**
   * Reconciles the complete selected-file manifest for one running job. The
   * job row is locked and rechecked so cancellation or another terminal state
   * cannot race with inventory persistence.
   */
  synchronizeFileInventory(
    input: SynchronizeFileInventoryRecord,
  ): Promise<FileInventoryPersistenceResult | null> {
    return this.indexedFileRepository.manager.transaction(async (manager) => {
      const job = await manager.getRepository(IndexJobEntity).findOne({
        where: {
          id: input.indexJobId,
          organizationId: input.organizationId,
          repositoryId: input.repositoryId,
          branchId: input.branchId,
          status: IndexJobStatus.Running,
        },
        lock: { mode: 'pessimistic_write' },
      });

      if (!job) {
        return null;
      }

      job.totalFiles = input.files.length;
      await manager.getRepository(IndexJobEntity).save(job);

      const repository = manager.getRepository(IndexedFileEntity);
      const existingFiles = await repository.find({
        where: {
          organizationId: input.organizationId,
          repositoryId: input.repositoryId,
          branchId: input.branchId,
        },
      });
      const existingByPath = new Map(
        existingFiles.map((file) => [file.path, file]),
      );
      const observedPaths = new Set<string>();
      const filesToSave: IndexedFileEntity[] = [];

      for (const discoveredFile of input.files) {
        observedPaths.add(discoveredFile.path);

        const file =
          existingByPath.get(discoveredFile.path) ??
          repository.create({
            organizationId: input.organizationId,
            repositoryId: input.repositoryId,
            branchId: input.branchId,
            path: discoveredFile.path,
            language: null,
          });

        file.lastSeenJobId = input.indexJobId;
        file.extension = discoveredFile.extension;
        file.sizeBytes = discoveredFile.sizeBytes;
        file.status = IndexedFileStatus.Active;
        file.lastSeenCommitSha = input.targetCommitSha;
        filesToSave.push(file);
      }

      let newlyDeletedFiles = 0;

      for (const existingFile of existingFiles) {
        if (
          !observedPaths.has(existingFile.path) &&
          existingFile.status !== IndexedFileStatus.Deleted
        ) {
          existingFile.status = IndexedFileStatus.Deleted;
          filesToSave.push(existingFile);
          newlyDeletedFiles += 1;
        }
      }

      if (filesToSave.length > 0) {
        await repository.save(filesToSave, { chunk: 500 });
      }

      return {
        activeFiles: input.files.length,
        newlyDeletedFiles,
      };
    });
  }
}
