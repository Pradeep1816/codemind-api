import { createHash } from 'node:crypto';
import { ConflictException, Inject, Injectable } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import indexingConfig from '../../../config/indexing.config';
import { GitService } from '../../repositories/git/git.service';
import { FileInventoryService } from '../file-inventory.service';
import { IndexingMode } from '../enums/indexing-mode.enum';
import {
  IndexingRepository,
  PersistFileHashRecord,
} from '../indexing.repository';
import { ContentHashError, ContentHashErrorCode } from './content-hash.errors';
import { ContentHashResult } from './content-hash.types';

const HASH_PERSISTENCE_BATCH_SIZE = 250;

@Injectable()
export class ContentHashService {
  constructor(
    @Inject(indexingConfig.KEY)
    private readonly configuration: ConfigType<typeof indexingConfig>,
    private readonly fileInventoryService: FileInventoryService,
    private readonly indexingRepository: IndexingRepository,
    private readonly gitService: GitService,
  ) {}

  /**
   * Reconciles inventory, skips matching Git blobs in incremental mode, and
   * computes SHA-256 only for content that requires processing. Hash records
   * are committed in idempotent bounded batches for restart-safe retries.
   */
  async hashChangedFiles(
    organizationId: string,
    repositoryId: number,
    jobId: number,
  ): Promise<ContentHashResult> {
    const inventory = await this.fileInventoryService.discoverAndPersist(
      organizationId,
      repositoryId,
      jobId,
    );
    const indexedFiles = await this.indexingRepository.findActiveFilesByBranch(
      organizationId,
      repositoryId,
      inventory.branchId,
    );
    const indexedFileByPath = new Map(
      indexedFiles.map((file) => [file.path, file]),
    );
    let hashBatch: PersistFileHashRecord[] = [];
    let hashedFiles = 0;
    let unchangedFiles = 0;
    let createdHashes = 0;
    let reusedHashes = 0;
    let hashedBytes = 0;

    const persistBatch = async (): Promise<void> => {
      if (hashBatch.length === 0) {
        return;
      }

      const result = await this.indexingRepository.persistFileHashBatch({
        organizationId,
        repositoryId,
        branchId: inventory.branchId,
        indexJobId: inventory.jobId,
        hashes: hashBatch,
      });

      if (!result) {
        throw new ConflictException(
          'Indexing job no longer owns content-hash persistence',
        );
      }

      createdHashes += result.createdHashes;
      reusedHashes += result.reusedHashes;
      hashBatch = [];
    };

    for (const discoveredFile of inventory.files) {
      const indexedFile = indexedFileByPath.get(discoveredFile.path);

      if (!indexedFile) {
        throw new ContentHashError(
          'Discovered file is missing from the persisted inventory',
          ContentHashErrorCode.InventoryMismatch,
        );
      }

      if (
        inventory.mode === IndexingMode.Incremental &&
        indexedFile.currentFileHash?.gitBlobOid === discoveredFile.gitBlobOid &&
        indexedFile.currentFileHash.sizeBytes === discoveredFile.sizeBytes
      ) {
        unchangedFiles += 1;
        continue;
      }

      const blob = await this.gitService.readBlob(
        organizationId,
        repositoryId,
        inventory.targetCommitSha,
        discoveredFile.gitBlobOid,
        this.configuration.maxFileSizeBytes,
      );

      if (blob.content.length !== discoveredFile.sizeBytes) {
        throw new ContentHashError(
          'Git blob size differs from the discovered tree metadata',
          ContentHashErrorCode.BlobSizeMismatch,
        );
      }

      hashBatch.push({
        indexedFileId: indexedFile.id,
        sha256: createHash('sha256').update(blob.content).digest('hex'),
        gitBlobOid: blob.objectId,
        sizeBytes: blob.content.length,
      });
      hashedFiles += 1;
      hashedBytes += blob.content.length;

      if (hashBatch.length >= HASH_PERSISTENCE_BATCH_SIZE) {
        await persistBatch();
      }
    }

    await persistBatch();

    return {
      jobId: inventory.jobId,
      repositoryId: inventory.repositoryId,
      branchId: inventory.branchId,
      targetCommitSha: inventory.targetCommitSha,
      selectedFiles: inventory.files.length,
      newlyDeletedFiles: inventory.newlyDeletedFiles,
      hashedFiles,
      unchangedFiles,
      createdHashes,
      reusedHashes,
      hashedBytes,
    };
  }
}
