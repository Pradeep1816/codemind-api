import { createHash } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
} from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import searchConfig from '../../../config/search.config';
import { CODE_INTELLIGENCE_READER } from '../../indexing/ports/code-intelligence-reader.port';
import type { CodeIntelligenceReader } from '../../indexing/ports/code-intelligence-reader.port';
import { IMMUTABLE_SOURCE_READER } from '../../indexing/ports/immutable-source-reader.port';
import type { ImmutableSourceReader } from '../../indexing/ports/immutable-source-reader.port';
import { KnowledgeQueryService } from '../../knowledge/services/knowledge-query.service';
import { SearchDocumentSourceType } from '../enums/search-document-source-type.enum';
import { SearchIndexStatus } from '../enums/search-index-status.enum';
import { SearchDocumentBuilderService } from './search-document-builder.service';
import {
  SearchProjectionError,
  SearchProjectionErrorCode,
} from './search-projection.errors';
import { SearchProjectionRepository } from './search-projection.repository';
import {
  BuildCurrentSearchProjectionInput,
  BuildSearchProjectionInput,
  SearchDocumentCounts,
  SearchDocumentInput,
  SearchProjectionResult,
} from './search-projection.types';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const KNOWLEDGE_PAGE_SIZE = 100;

@Injectable()
export class SearchProjectionService {
  constructor(
    @Inject(searchConfig.KEY)
    private readonly configuration: ConfigType<typeof searchConfig>,
    @Inject(CODE_INTELLIGENCE_READER)
    private readonly codeReader: CodeIntelligenceReader,
    @Inject(IMMUTABLE_SOURCE_READER)
    private readonly sourceReader: ImmutableSourceReader,
    private readonly knowledgeQueryService: KnowledgeQueryService,
    private readonly documentBuilder: SearchDocumentBuilderService,
    private readonly projectionRepository: SearchProjectionRepository,
  ) {}

  /** Builds the projection for the published snapshot currently selected by a branch. */
  async buildCurrent(
    input: BuildCurrentSearchProjectionInput,
  ): Promise<SearchProjectionResult> {
    const knowledgeSnapshot =
      await this.knowledgeQueryService.findCurrentSnapshot(
        input.organizationId,
        input.repositoryId,
        { branchId: input.branchId },
      );

    return this.build({
      organizationId: input.organizationId,
      repositoryId: input.repositoryId,
      knowledgeSnapshotId: knowledgeSnapshot.id,
    });
  }

  /**
   * Rebuilds one deterministic search projection from immutable Phase 3 and
   * published Phase 4 sources, then atomically publishes the complete result.
   */
  async build(
    input: BuildSearchProjectionInput,
  ): Promise<SearchProjectionResult> {
    this.assertInput(input);

    const knowledgeSnapshot = await this.knowledgeQueryService.findSnapshot(
      input.organizationId,
      input.repositoryId,
      input.knowledgeSnapshotId,
    );
    const codeSnapshot = await this.codeReader.getSnapshot({
      organizationId: input.organizationId,
      repositoryId: input.repositoryId,
      indexJobId: knowledgeSnapshot.sourceIndexJobId,
    });

    if (
      codeSnapshot.branchId !== knowledgeSnapshot.branchId ||
      codeSnapshot.targetCommitSha !== knowledgeSnapshot.targetCommitSha
    ) {
      throw new ConflictException(
        'Search projection sources do not reference the same code snapshot',
      );
    }

    try {
      return await this.projectionRepository.withBuildLock(
        codeSnapshot.branchId,
        async () => {
          const configurationDigest = this.configurationDigest();
          const searchIndex = await this.projectionRepository.createOrFindIndex(
            {
              organizationId: input.organizationId,
              repositoryId: input.repositoryId,
              branchId: codeSnapshot.branchId,
              sourceIndexJobId: codeSnapshot.indexJobId,
              knowledgeSnapshotId: knowledgeSnapshot.id,
              targetCommitSha: codeSnapshot.targetCommitSha,
              indexerVersion: this.configuration.indexerVersion,
              configurationDigest,
            },
          );

          if (searchIndex.status === SearchIndexStatus.Published) {
            const counts = await this.projectionRepository.countDocuments(
              searchIndex.id,
            );

            return this.toResult({
              searchIndexId: searchIndex.id,
              isCurrent: searchIndex.isCurrent,
              documentCount: searchIndex.documentCount,
              publishedAt: searchIndex.publishedAt!,
              sourceIndexJobId: codeSnapshot.indexJobId,
              knowledgeSnapshotId: knowledgeSnapshot.id,
              repositoryId: input.repositoryId,
              branchId: codeSnapshot.branchId,
              targetCommitSha: codeSnapshot.targetCommitSha,
              counts,
              reused: true,
            });
          }

          await this.projectionRepository.resetDraft(searchIndex.id);
          const counts = await this.buildDocuments(
            input,
            codeSnapshot.branchId,
            codeSnapshot.indexJobId,
            codeSnapshot.targetCommitSha,
            knowledgeSnapshot.id,
            searchIndex.id,
          );
          const published = await this.projectionRepository.publish(
            searchIndex.id,
          );

          if (published.documentCount !== counts.total) {
            throw new SearchProjectionError(
              'Published search document count changed during projection',
              SearchProjectionErrorCode.SourceMismatch,
            );
          }

          return this.toResult({
            ...published,
            sourceIndexJobId: codeSnapshot.indexJobId,
            knowledgeSnapshotId: knowledgeSnapshot.id,
            repositoryId: input.repositoryId,
            branchId: codeSnapshot.branchId,
            targetCommitSha: codeSnapshot.targetCommitSha,
            counts,
            reused: false,
          });
        },
      );
    } catch (error: unknown) {
      if (error instanceof SearchProjectionError) {
        throw new ConflictException(error.message, { cause: error });
      }

      throw error;
    }
  }

  private async buildDocuments(
    input: BuildSearchProjectionInput,
    branchId: number,
    sourceIndexJobId: number,
    targetCommitSha: string,
    knowledgeSnapshotId: number,
    searchIndexId: number,
  ): Promise<SearchDocumentCounts> {
    const scope = {
      organizationId: input.organizationId,
      repositoryId: input.repositoryId,
      branchId,
      searchIndexId,
    };
    const counts: SearchDocumentCounts = {
      files: 0,
      symbols: 0,
      knowledgeNodes: 0,
      total: 0,
    };
    const batch: SearchDocumentInput[] = [];
    let totalContentBytes = 0;

    const append = async (document: SearchDocumentInput): Promise<void> => {
      const contentBytes = Buffer.byteLength(document.content, 'utf8');
      this.assertCapacity(counts.total + 1, totalContentBytes + contentBytes);
      totalContentBytes += contentBytes;
      counts.total += 1;

      if (document.sourceType === SearchDocumentSourceType.File) {
        counts.files += 1;
      } else if (document.sourceType === SearchDocumentSourceType.Symbol) {
        counts.symbols += 1;
      } else {
        counts.knowledgeNodes += 1;
      }

      batch.push(document);

      if (batch.length >= this.configuration.persistenceBatchSize) {
        await this.flush(searchIndexId, batch);
      }
    };

    for await (const file of this.codeReader.streamFiles({
      organizationId: input.organizationId,
      repositoryId: input.repositoryId,
      indexJobId: sourceIndexJobId,
    })) {
      const source = await this.sourceReader.read({
        organizationId: input.organizationId,
        repositoryId: input.repositoryId,
        targetCommitSha,
        indexedFileId: file.id,
        fileHashId: file.hash.id,
        path: file.path,
        gitBlobOid: file.hash.gitBlobOid,
        expectedSizeBytes: file.hash.sizeBytes,
      });
      const documents = this.documentBuilder.buildFileDocuments(
        scope,
        file,
        source.content,
        this.configuration.maxDocumentContentBytes,
      );

      for (const document of documents) {
        await append(document);
      }
    }

    let page = 1;
    let emittedKnowledgeNodes = 0;

    while (true) {
      const response = await this.knowledgeQueryService.listNodes(
        input.organizationId,
        input.repositoryId,
        knowledgeSnapshotId,
        { page, limit: KNOWLEDGE_PAGE_SIZE },
      );

      for (const node of response.data) {
        await append(
          this.documentBuilder.buildKnowledgeDocument(
            scope,
            node,
            this.configuration.maxDocumentContentBytes,
          ),
        );
        emittedKnowledgeNodes += 1;
      }

      if (emittedKnowledgeNodes >= response.pagination.total) {
        break;
      }

      if (response.data.length === 0) {
        throw new SearchProjectionError(
          'Knowledge snapshot changed during search projection',
          SearchProjectionErrorCode.SourceMismatch,
        );
      }

      page += 1;
    }

    await this.flush(searchIndexId, batch);
    return counts;
  }

  private async flush(
    searchIndexId: number,
    batch: SearchDocumentInput[],
  ): Promise<void> {
    if (batch.length === 0) {
      return;
    }

    const documents = batch.splice(0, batch.length);
    await this.projectionRepository.persistDocuments(searchIndexId, documents);
  }

  private assertCapacity(documentCount: number, contentBytes: number): void {
    if (
      documentCount > this.configuration.maxDocuments ||
      contentBytes > this.configuration.maxTotalContentBytes
    ) {
      throw new SearchProjectionError(
        'Search projection exceeds configured resource limits',
        SearchProjectionErrorCode.ResourceLimitExceeded,
      );
    }
  }

  private configurationDigest(): string {
    return createHash('sha256')
      .update(
        JSON.stringify({
          indexerVersion: this.configuration.indexerVersion,
          maxDocumentContentBytes: this.configuration.maxDocumentContentBytes,
          documentTypes: [
            SearchDocumentSourceType.File,
            SearchDocumentSourceType.Symbol,
            SearchDocumentSourceType.KnowledgeNode,
          ],
          identifierNormalization: 'technical-v1',
          knowledgePropertyTerms: 'bounded-v1',
        }),
      )
      .digest('hex');
  }

  private toResult(input: {
    searchIndexId: number;
    isCurrent: boolean;
    documentCount: number;
    publishedAt: Date;
    repositoryId: number;
    branchId: number;
    knowledgeSnapshotId: number;
    sourceIndexJobId: number;
    targetCommitSha: string;
    counts: SearchDocumentCounts;
    reused: boolean;
  }): SearchProjectionResult {
    return {
      searchIndexId: input.searchIndexId,
      repositoryId: input.repositoryId,
      branchId: input.branchId,
      knowledgeSnapshotId: input.knowledgeSnapshotId,
      sourceIndexJobId: input.sourceIndexJobId,
      targetCommitSha: input.targetCommitSha,
      indexerVersion: this.configuration.indexerVersion,
      isCurrent: input.isCurrent,
      documentCount: input.documentCount,
      publishedAt: input.publishedAt,
      reused: input.reused,
      documents: input.counts,
    };
  }

  private assertInput(input: BuildSearchProjectionInput): void {
    if (
      !UUID_PATTERN.test(input.organizationId) ||
      !Number.isSafeInteger(input.repositoryId) ||
      input.repositoryId < 1 ||
      !Number.isSafeInteger(input.knowledgeSnapshotId) ||
      input.knowledgeSnapshotId < 1
    ) {
      throw new BadRequestException('Search projection input is invalid');
    }
  }
}
