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
import { LanguageCapability } from './enums/language-capability.enum';
import { IndexingMode } from './enums/indexing-mode.enum';
import { IndexingRepository } from './indexing.repository';
import { LanguageDetectionService } from './language/language-detection.service';
import { LanguageDistribution } from './language/language-detection.types';
import { IndexingWorkspaceService } from './workspace/indexing-workspace.service';

export interface FileInventoryResult {
  jobId: number;
  organizationId: string;
  repositoryId: number;
  branchId: number;
  targetCommitSha: string;
  mode: IndexingMode;
  files: readonly DiscoveredFile[];
  activeFiles: number;
  newlyDeletedFiles: number;
  parserSupportedFiles: number;
  inventoryOnlyFiles: number;
  languages: LanguageDistribution;
  discovery: FileDiscoveryStatistics;
}

@Injectable()
export class FileInventoryService {
  constructor(
    private readonly indexingRepository: IndexingRepository,
    private readonly indexingWorkspaceService: IndexingWorkspaceService,
    private readonly fileDiscoveryService: FileDiscoveryService,
    private readonly languageDetectionService: LanguageDetectionService,
  ) {}

  /**
   * Discovers and reconciles one complete branch manifest. This is an internal
   * worker-facing use case and accepts only a job already moved to `running`.
   */
  async discoverAndPersist(
    organizationId: string,
    repositoryId: number,
    jobId: number,
    leaseToken: string,
  ): Promise<FileInventoryResult> {
    const job = await this.indexingRepository.findByIdAndRepository(
      organizationId,
      repositoryId,
      jobId,
    );

    if (!job) {
      throw new NotFoundException('Indexing job was not found');
    }

    if (
      job.status !== IndexJobStatus.Running ||
      job.leaseToken !== leaseToken ||
      !job.leaseExpiresAt ||
      job.leaseExpiresAt <= new Date() ||
      job.cancellationRequestedAt !== null
    ) {
      throw new ConflictException(
        'File discovery requires a running indexing job',
      );
    }

    await this.indexingWorkspaceService.reset({
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
    const languageDistribution: LanguageDistribution = {};
    let parserSupportedFiles = 0;
    let inventoryOnlyFiles = 0;
    const detectedFiles = manifest.files.map((file) => {
      const detection = this.languageDetectionService.detect(file.extension);
      languageDistribution[detection.language] =
        (languageDistribution[detection.language] ?? 0) + 1;

      if (detection.capability === LanguageCapability.ParserSupported) {
        parserSupportedFiles += 1;
      } else {
        inventoryOnlyFiles += 1;
      }

      return {
        file,
        language: detection.language,
      };
    });
    const persistenceResult =
      await this.indexingRepository.synchronizeFileInventory({
        organizationId,
        repositoryId,
        branchId: job.branchId,
        indexJobId: job.id,
        leaseToken,
        targetCommitSha: job.targetCommitSha,
        files: detectedFiles.map(({ file, language }) => ({
          path: file.path,
          extension: file.extension,
          language,
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
      organizationId: job.organizationId,
      repositoryId: job.repositoryId,
      branchId: job.branchId,
      targetCommitSha: job.targetCommitSha,
      mode: job.mode,
      files: manifest.files,
      activeFiles: persistenceResult.activeFiles,
      newlyDeletedFiles: persistenceResult.newlyDeletedFiles,
      parserSupportedFiles,
      inventoryOnlyFiles,
      languages: languageDistribution,
      discovery: manifest.statistics,
    };
  }
}
