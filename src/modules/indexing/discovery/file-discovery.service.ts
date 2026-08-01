import { extname } from 'node:path';
import { Inject, Injectable } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import indexingConfig from '../../../config/indexing.config';
import { GitService } from '../../repositories/git/git.service';
import {
  IGNORED_DIRECTORY_NAMES,
  INDEXABLE_EXTENSIONS,
  REGULAR_GIT_FILE_MODES,
} from './file-discovery.constants';
import {
  FileDiscoveryError,
  FileDiscoveryErrorCode,
} from './file-discovery.errors';
import {
  DiscoveredFile,
  FileDiscoveryManifest,
  FileDiscoveryStatistics,
} from './file-discovery.types';

@Injectable()
export class FileDiscoveryService {
  constructor(
    @Inject(indexingConfig.KEY)
    private readonly configuration: ConfigType<typeof indexingConfig>,
    private readonly gitService: GitService,
  ) {}

  /**
   * Reads file metadata from an immutable Git tree and applies CodeMind's
   * platform policy before any repository-controlled content is materialized.
   */
  async discover(
    organizationId: string,
    repositoryId: number,
    targetCommitSha: string,
  ): Promise<FileDiscoveryManifest> {
    const entries = await this.gitService.listCommitFiles(
      organizationId,
      repositoryId,
      targetCommitSha,
    );
    const files: DiscoveredFile[] = [];
    const observedPaths = new Set<string>();
    const statistics: FileDiscoveryStatistics = {
      observedEntries: entries.length,
      selectedFiles: 0,
      ignoredFiles: 0,
      unsupportedFiles: 0,
      oversizedFiles: 0,
      specialFiles: 0,
      selectedBytes: 0,
    };

    for (const entry of entries) {
      this.validatePath(entry.path);

      if (observedPaths.has(entry.path)) {
        throw new FileDiscoveryError(
          'Repository tree contains a duplicate normalized path',
          FileDiscoveryErrorCode.DuplicatePath,
        );
      }

      observedPaths.add(entry.path);

      if (!REGULAR_GIT_FILE_MODES.has(entry.mode)) {
        statistics.specialFiles += 1;
        continue;
      }

      if (this.isIgnored(entry.path)) {
        statistics.ignoredFiles += 1;
        continue;
      }

      const extension = this.getExtension(entry.path);

      if (!extension || !INDEXABLE_EXTENSIONS.has(extension)) {
        statistics.unsupportedFiles += 1;
        continue;
      }

      if (entry.sizeBytes > this.configuration.maxFileSizeBytes) {
        statistics.oversizedFiles += 1;
        continue;
      }

      if (files.length >= this.configuration.maxFiles) {
        throw new FileDiscoveryError(
          'Repository exceeds the configured supported-file limit',
          FileDiscoveryErrorCode.FileLimitExceeded,
        );
      }

      const selectedBytes = statistics.selectedBytes + entry.sizeBytes;

      if (selectedBytes > this.configuration.maxTotalBytes) {
        throw new FileDiscoveryError(
          'Repository exceeds the configured selected-byte limit',
          FileDiscoveryErrorCode.ByteLimitExceeded,
        );
      }

      files.push({
        path: entry.path,
        extension,
        sizeBytes: entry.sizeBytes,
        gitBlobOid: entry.objectId,
      });
      statistics.selectedFiles += 1;
      statistics.selectedBytes = selectedBytes;
    }

    return {
      repositoryId,
      targetCommitSha: targetCommitSha.toLowerCase(),
      files,
      statistics,
    };
  }

  private validatePath(path: string): void {
    const segments = path.split('/');

    if (
      path.length === 0 ||
      path.length > this.configuration.maxPathLength ||
      path.startsWith('/') ||
      path.includes('\\') ||
      this.hasUnsafeCharacter(path) ||
      segments.length > this.configuration.maxPathDepth ||
      segments.some(
        (segment) =>
          segment.length === 0 || segment === '.' || segment === '..',
      )
    ) {
      throw new FileDiscoveryError(
        'Repository tree contains an unsafe or unsupported path',
        FileDiscoveryErrorCode.UnsafePath,
      );
    }
  }

  private isIgnored(path: string): boolean {
    const directorySegments = path.split('/').slice(0, -1);

    return directorySegments.some((segment) =>
      IGNORED_DIRECTORY_NAMES.has(segment.toLowerCase()),
    );
  }

  private hasUnsafeCharacter(path: string): boolean {
    return Array.from(path).some((character) => {
      const codePoint = character.codePointAt(0);

      return (
        codePoint !== undefined &&
        (codePoint <= 31 || codePoint === 127 || codePoint === 0xfffd)
      );
    });
  }

  private getExtension(path: string): string | null {
    const extension = extname(path).slice(1).toLowerCase();

    return extension.length > 0 && extension.length <= 32 ? extension : null;
  }
}
