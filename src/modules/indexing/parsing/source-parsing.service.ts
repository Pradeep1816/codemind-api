import { isUtf8 } from 'node:buffer';
import { Inject, Injectable } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import indexingConfig from '../../../config/indexing.config';
import { ParserService } from '../../parser/parser.service';
import { ParseSourceResult } from '../../parser/types/parser.types';
import { GitService } from '../../repositories/git/git.service';
import {
  SourceParsingError,
  SourceParsingErrorCode,
} from './source-parsing.errors';
import { ParseIndexedFileInput } from './source-parsing.types';

@Injectable()
export class SourceParsingService {
  constructor(
    @Inject(indexingConfig.KEY)
    private readonly configuration: ConfigType<typeof indexingConfig>,
    private readonly gitService: GitService,
    private readonly parserService: ParserService,
  ) {}

  /**
   * Reads and parses exactly one immutable content version. Source bytes stay
   * transient, must fit the indexing limit, and must be valid UTF-8 before
   * they enter a language adapter.
   */
  async parseFile(input: ParseIndexedFileInput): Promise<ParseSourceResult> {
    this.assertInput(input);

    const blob = await this.gitService.readBlob(
      input.organizationId,
      input.repositoryId,
      input.targetCommitSha,
      input.gitBlobOid,
      this.configuration.maxFileSizeBytes,
    );

    if (blob.content.length !== input.expectedSizeBytes) {
      throw new SourceParsingError(
        'Git blob size differs from the persisted content metadata',
        SourceParsingErrorCode.BlobSizeMismatch,
      );
    }

    if (!isUtf8(blob.content)) {
      throw new SourceParsingError(
        'Source content must use valid UTF-8 encoding',
        SourceParsingErrorCode.UnsupportedEncoding,
      );
    }

    return this.parserService.parse({
      indexedFileId: input.indexedFileId,
      fileHashId: input.fileHashId,
      path: input.path,
      language: input.language,
      extension: input.extension,
      content: blob.content.toString('utf8'),
    });
  }

  private assertInput(input: ParseIndexedFileInput): void {
    if (
      !Number.isSafeInteger(input.repositoryId) ||
      input.repositoryId < 1 ||
      !Number.isSafeInteger(input.indexedFileId) ||
      input.indexedFileId < 1 ||
      !Number.isSafeInteger(input.fileHashId) ||
      input.fileHashId < 1 ||
      !Number.isSafeInteger(input.expectedSizeBytes) ||
      input.expectedSizeBytes < 0 ||
      input.path.trim().length === 0 ||
      input.extension.trim().length === 0
    ) {
      throw new SourceParsingError(
        'Persisted source metadata is invalid',
        SourceParsingErrorCode.InvalidMetadata,
      );
    }
  }
}
