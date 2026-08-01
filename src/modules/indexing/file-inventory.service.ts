import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  DiscoveredFile,
  FileDiscoveryStatistics,
} from './discovery/file-discovery.types';
import { FileDiscoveryService } from './discovery/file-discovery.service';
import { IndexJobStatus } from './enums/index-job-status.enum';
import { IndexingMode } from './enums/indexing-mode.enum';
import { IndexingRepository } from './indexing.repository';
import { IndexingWorkspaceService } from './workspace/indexing-workspace.service';

export interface FileInventoryResult {
  jobId: number;
  repositoryId: number;
  branchId: number;
  targetCommitSha: string;
  mode: IndexingMode;
  files: readonly DiscoveredFile[];
  activeFiles: number;
  newlyDeletedFiles: number;
  discovery: FileDiscoveryStatistics;
}

@Injectable()
export class FileInventoryService {
  constructor(
    private readonly indexingRepository: IndexingRepository,
    private readonly indexingWorkspaceService: IndexingWorkspaceService,
    private readonly fileDiscoveryService: FileDiscoveryService,
  ) {}

  /**
   * Discovers and reconciles one complete branch manifest. This is an internal
   * worker-facing use case and accepts only a job already moved to `running`.
   */
  async discoverAndPersist(
    organizationId: string,
    repositoryId: number,
    jobId: number,
  ): Promise<FileInventoryResult> {
    const job = await this.indexingRepository.findByIdAndRepository(
      organizationId,
      repositoryId,
      jobId,
    );

    if (!job) {
      throw new NotFoundException('Indexing job was not found');
    }

    if (job.status !== IndexJobStatus.Running) {
      throw new ConflictException(
        'File discovery requires a running indexing job',
      );
    }

    await this.indexingWorkspaceService.prepare({
      organizationId,
      repositoryId,
      jobId,
      targetCommitSha: job.targetCommitSha,
    });

    const manifest = await this.fileDiscoveryService.discover(
      organizationId,
      repositoryId,
      job.targetCommitSha,
    );
    const persistenceResult =
      await this.indexingRepository.synchronizeFileInventory({
        organizationId,
        repositoryId,
        branchId: job.branchId,
        indexJobId: job.id,
        targetCommitSha: job.targetCommitSha,
        files: manifest.files.map((file) => ({
          path: file.path,
          extension: file.extension,
          sizeBytes: file.sizeBytes,
        })),
      });

    if (!persistenceResult) {
      throw new ConflictException(
        'Indexing job no longer owns file inventory persistence',
      );
    }

    return {
      jobId: job.id,
      repositoryId: job.repositoryId,
      branchId: job.branchId,
      targetCommitSha: job.targetCommitSha,
      mode: job.mode,
      files: manifest.files,
      activeFiles: persistenceResult.activeFiles,
      newlyDeletedFiles: persistenceResult.newlyDeletedFiles,
      discovery: manifest.statistics,
    };
  }
}
