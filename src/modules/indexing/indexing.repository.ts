import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, MoreThan, Repository } from 'typeorm';
import { FileHashEntity } from './entities/file-hash.entity';
import { IndexJobEntity } from './entities/index-job.entity';
import { IndexedFileEntity } from './entities/indexed-file.entity';
import { IndexingErrorEntity } from './entities/indexing-error.entity';
import { FileHashAlgorithm } from './enums/file-hash-algorithm.enum';
import { IndexJobPhase } from './enums/index-job-phase.enum';
import { IndexJobStatus } from './enums/index-job-status.enum';
import { IndexJobTrigger } from './enums/index-job-trigger.enum';
import { IndexedFileStatus } from './enums/indexed-file-status.enum';
import { IndexingMode } from './enums/indexing-mode.enum';
import { IndexingErrorPhase } from './enums/indexing-error-phase.enum';
import { SourceLanguage } from './enums/source-language.enum';

export interface CreateIndexJobRecord {
  organizationId: string;
  repositoryId: number;
  branchId: number;
  requestedByUserId: string;
  trigger: IndexJobTrigger;
  mode: IndexingMode;
  targetCommitSha: string;
  retryOfJobId?: number | null;
  maxAttempts: number;
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
  language: SourceLanguage;
  sizeBytes: number;
}

export interface SynchronizeFileInventoryRecord {
  organizationId: string;
  repositoryId: number;
  branchId: number;
  indexJobId: number;
  leaseToken: string;
  targetCommitSha: string;
  files: readonly FileInventoryRecord[];
}

export interface FileInventoryPersistenceResult {
  activeFiles: number;
  newlyDeletedFiles: number;
}

export interface PersistFileHashRecord {
  indexedFileId: number;
  sha256: string;
  gitBlobOid: string;
  sizeBytes: number;
}

export interface PersistFileHashBatchRecord {
  organizationId: string;
  repositoryId: number;
  branchId: number;
  indexJobId: number;
  leaseToken: string;
  hashes: readonly PersistFileHashRecord[];
}

export interface PersistFileHashBatchResult {
  createdHashes: number;
  reusedHashes: number;
}

export interface MarkFileAnalysisCompleteRecord {
  organizationId: string;
  repositoryId: number;
  branchId: number;
  indexJobId: number;
  leaseToken: string;
  indexedFileId: number;
  fileHashId: number;
  targetCommitSha: string;
}

export interface PersistIndexingErrorRecord {
  organizationId: string;
  repositoryId: number;
  indexJobId: number;
  leaseToken: string;
  indexedFileId: number | null;
  phase: IndexingErrorPhase;
  code: string;
  message: string;
  retryable: boolean;
  attemptNumber: number;
}

@Injectable()
export class IndexingRepository {
  constructor(
    @InjectRepository(IndexJobEntity)
    private readonly indexJobRepository: Repository<IndexJobEntity>,
    @InjectRepository(IndexedFileEntity)
    private readonly indexedFileRepository: Repository<IndexedFileEntity>,
    @InjectRepository(FileHashEntity)
    private readonly fileHashRepository: Repository<FileHashEntity>,
    @InjectRepository(IndexingErrorEntity)
    private readonly indexingErrorRepository: Repository<IndexingErrorEntity>,
  ) {}

  create(input: CreateIndexJobRecord): Promise<IndexJobEntity> {
    return this.indexJobRepository.save(
      this.indexJobRepository.create({
        ...input,
        retryOfJobId: input.retryOfJobId ?? null,
        status: IndexJobStatus.Queued,
        phase: IndexJobPhase.Queued,
        totalFiles: 0,
        processedFiles: 0,
        skippedFiles: 0,
        failedFiles: 0,
        processedSymbols: 0,
        processedDependencies: 0,
        attemptCount: 0,
        claimedBy: null,
        leaseToken: null,
        failureCode: null,
        failureMessage: null,
        startedAt: null,
        completedAt: null,
        lastHeartbeatAt: null,
        leaseExpiresAt: null,
        nextAttemptAt: null,
        cancellationRequestedAt: null,
        currentFile: null,
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
          leaseToken: input.leaseToken,
          leaseExpiresAt: MoreThan(new Date()),
          cancellationRequestedAt: IsNull(),
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
            currentFileHashId: null,
          });

        file.lastSeenJobId = input.indexJobId;
        file.extension = discoveredFile.extension;
        file.language = discoveredFile.language;
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

  findActiveFilesByBranch(
    organizationId: string,
    repositoryId: number,
    branchId: number,
  ): Promise<IndexedFileEntity[]> {
    return this.indexedFileRepository.find({
      where: {
        organizationId,
        repositoryId,
        branchId,
        status: IndexedFileStatus.Active,
      },
      relations: {
        currentFileHash: true,
      },
      order: {
        path: 'ASC',
      },
    });
  }

  /**
   * Persists one bounded hash batch and switches each stable file identity to
   * its current immutable content version. Every batch rechecks job ownership
   * so cancellation can stop future writes without invalidating prior batches.
   */
  persistFileHashBatch(
    input: PersistFileHashBatchRecord,
  ): Promise<PersistFileHashBatchResult | null> {
    return this.fileHashRepository.manager.transaction(async (manager) => {
      const job = await manager.getRepository(IndexJobEntity).findOne({
        where: {
          id: input.indexJobId,
          organizationId: input.organizationId,
          repositoryId: input.repositoryId,
          branchId: input.branchId,
          status: IndexJobStatus.Running,
          leaseToken: input.leaseToken,
          leaseExpiresAt: MoreThan(new Date()),
          cancellationRequestedAt: IsNull(),
        },
        lock: { mode: 'pessimistic_write' },
      });

      if (!job) {
        return null;
      }

      const indexedFileIds = input.hashes.map((hash) => hash.indexedFileId);
      const indexedFileRepository = manager.getRepository(IndexedFileEntity);
      const indexedFiles = await indexedFileRepository.find({
        where: {
          id: In(indexedFileIds),
          organizationId: input.organizationId,
          repositoryId: input.repositoryId,
          branchId: input.branchId,
          status: IndexedFileStatus.Active,
        },
      });

      if (indexedFiles.length !== new Set(indexedFileIds).size) {
        return null;
      }

      const fileHashRepository = manager.getRepository(FileHashEntity);
      const existingHashes = await fileHashRepository.find({
        where: {
          indexedFileId: In(indexedFileIds),
          algorithm: FileHashAlgorithm.Sha256,
        },
      });
      const hashByFileAndValue = new Map(
        existingHashes.map((hash) => [
          `${hash.indexedFileId}:${hash.value}`,
          hash,
        ]),
      );
      const newHashes: FileHashEntity[] = [];

      for (const hashInput of input.hashes) {
        const key = `${hashInput.indexedFileId}:${hashInput.sha256}`;

        if (!hashByFileAndValue.has(key)) {
          const hash = fileHashRepository.create({
            organizationId: input.organizationId,
            indexedFileId: hashInput.indexedFileId,
            observedByJobId: input.indexJobId,
            algorithm: FileHashAlgorithm.Sha256,
            value: hashInput.sha256,
            gitBlobOid: hashInput.gitBlobOid,
            sizeBytes: hashInput.sizeBytes,
          });
          hashByFileAndValue.set(key, hash);
          newHashes.push(hash);
        }
      }

      if (newHashes.length > 0) {
        await fileHashRepository.save(newHashes, { chunk: 250 });
      }

      const hashInputByFileId = new Map(
        input.hashes.map((hash) => [hash.indexedFileId, hash]),
      );

      for (const indexedFile of indexedFiles) {
        const hashInput = hashInputByFileId.get(indexedFile.id);
        const fileHash = hashInput
          ? hashByFileAndValue.get(`${indexedFile.id}:${hashInput.sha256}`)
          : undefined;

        if (!fileHash?.id) {
          throw new Error('Persisted file hash identity is unavailable');
        }

        indexedFile.currentFileHashId = fileHash.id;
      }

      await indexedFileRepository.save(indexedFiles, { chunk: 250 });

      return {
        createdHashes: newHashes.length,
        reusedHashes: input.hashes.length - newHashes.length,
      };
    });
  }

  /** Marks one immutable hash reusable only after all analysis is persisted. */
  markFileAnalysisComplete(
    input: MarkFileAnalysisCompleteRecord,
  ): Promise<boolean> {
    return this.fileHashRepository.manager.transaction(async (manager) => {
      const job = await manager.getRepository(IndexJobEntity).findOne({
        where: {
          id: input.indexJobId,
          organizationId: input.organizationId,
          repositoryId: input.repositoryId,
          branchId: input.branchId,
          targetCommitSha: input.targetCommitSha,
          status: IndexJobStatus.Running,
          leaseToken: input.leaseToken,
          leaseExpiresAt: MoreThan(new Date()),
          cancellationRequestedAt: IsNull(),
        },
        lock: { mode: 'pessimistic_write' },
      });

      if (!job) {
        return false;
      }

      const repository = manager.getRepository(FileHashEntity);
      const fileHash = await repository.findOne({
        where: {
          id: input.fileHashId,
          organizationId: input.organizationId,
          indexedFileId: input.indexedFileId,
          indexedFile: {
            id: input.indexedFileId,
            organizationId: input.organizationId,
            repositoryId: input.repositoryId,
            branchId: input.branchId,
            currentFileHashId: input.fileHashId,
            lastSeenCommitSha: input.targetCommitSha,
            status: IndexedFileStatus.Active,
          },
        },
      });

      if (!fileHash) {
        return false;
      }

      fileHash.analyzedByJobId = input.indexJobId;
      fileHash.analysisCompletedAt = new Date();
      await repository.save(fileHash);

      return true;
    });
  }

  /** Persists a sanitized operational failure while the worker owns the job. */
  persistError(input: PersistIndexingErrorRecord): Promise<boolean> {
    return this.indexingErrorRepository.manager.transaction(async (manager) => {
      const job = await manager.getRepository(IndexJobEntity).findOne({
        where: {
          id: input.indexJobId,
          organizationId: input.organizationId,
          repositoryId: input.repositoryId,
          status: IndexJobStatus.Running,
          leaseToken: input.leaseToken,
          leaseExpiresAt: MoreThan(new Date()),
        },
        lock: { mode: 'pessimistic_write' },
      });

      if (!job) {
        return false;
      }

      await manager.getRepository(IndexingErrorEntity).save(
        manager.getRepository(IndexingErrorEntity).create({
          organizationId: input.organizationId,
          indexJobId: input.indexJobId,
          indexedFileId: input.indexedFileId,
          phase: input.phase,
          code: input.code,
          message: input.message,
          retryable: input.retryable,
          attemptNumber: input.attemptNumber,
        }),
      );

      return true;
    });
  }
}
