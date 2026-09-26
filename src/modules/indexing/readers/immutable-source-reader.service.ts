import { isUtf8 } from 'node:buffer';
import { Inject, Injectable } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import indexingConfig from '../../../config/indexing.config';
import { GitService } from '../../repositories/git/git.service';
import {
  ImmutableSourceContent,
  ImmutableSourceReader,
  ImmutableSourceReadRequest,
} from '../ports/immutable-source-reader.port';
import {
  ImmutableSourceReadError,
  ImmutableSourceReadErrorCode,
} from './immutable-source-reader.errors';

const GIT_OBJECT_ID_PATTERN = /^[0-9a-f]{40}(?:[0-9a-f]{24})?$/iu;

@Injectable()
export class ImmutableSourceReaderService implements ImmutableSourceReader {
  constructor(
    @Inject(indexingConfig.KEY)
    private readonly configuration: ConfigType<typeof indexingConfig>,
    private readonly gitService: GitService,
  ) {}

  /**
   * Reads one persisted content version from the managed Git object store.
   * Bytes are bounded and validated before transient UTF-8 text is returned.
   */
  async read(
    request: ImmutableSourceReadRequest,
  ): Promise<ImmutableSourceContent> {
    this.assertRequest(request);

    if (request.expectedSizeBytes > this.configuration.maxFileSizeBytes) {
      throw new ImmutableSourceReadError(
        'Immutable source exceeds the configured file-size limit',
        ImmutableSourceReadErrorCode.FileTooLarge,
      );
    }

    const blob = await this.gitService.readBlob(
      request.organizationId,
      request.repositoryId,
      request.targetCommitSha,
      request.gitBlobOid,
      this.configuration.maxFileSizeBytes,
    );

    if (blob.objectId.toLowerCase() !== request.gitBlobOid.toLowerCase()) {
      throw new ImmutableSourceReadError(
        'Git blob identity differs from persisted content metadata',
        ImmutableSourceReadErrorCode.BlobIdentityMismatch,
      );
    }

    if (blob.content.length !== request.expectedSizeBytes) {
      throw new ImmutableSourceReadError(
        'Git blob size differs from persisted content metadata',
        ImmutableSourceReadErrorCode.BlobSizeMismatch,
      );
    }

    if (!isUtf8(blob.content)) {
      throw new ImmutableSourceReadError(
        'Immutable source must use valid UTF-8 encoding',
        ImmutableSourceReadErrorCode.UnsupportedEncoding,
      );
    }

    return {
      indexedFileId: request.indexedFileId,
      fileHashId: request.fileHashId,
      path: request.path,
      gitBlobOid: blob.objectId.toLowerCase(),
      sizeBytes: blob.content.length,
      content: blob.content.toString('utf8'),
    };
  }

  private assertRequest(request: ImmutableSourceReadRequest): void {
    if (
      request.organizationId.trim().length === 0 ||
      !Number.isSafeInteger(request.repositoryId) ||
      request.repositoryId < 1 ||
      !Number.isSafeInteger(request.indexedFileId) ||
      request.indexedFileId < 1 ||
      !Number.isSafeInteger(request.fileHashId) ||
      request.fileHashId < 1 ||
      request.path.trim().length === 0 ||
      request.path.includes('\0') ||
      !GIT_OBJECT_ID_PATTERN.test(request.targetCommitSha) ||
      !GIT_OBJECT_ID_PATTERN.test(request.gitBlobOid) ||
      !Number.isSafeInteger(request.expectedSizeBytes) ||
      request.expectedSizeBytes < 0
    ) {
      throw new ImmutableSourceReadError(
        'Immutable source request metadata is invalid',
        ImmutableSourceReadErrorCode.InvalidRequest,
      );
    }
  }
}
