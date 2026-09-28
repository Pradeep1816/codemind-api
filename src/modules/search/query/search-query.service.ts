import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import searchConfig from '../../../config/search.config';
import { CodeSymbolKind } from '../../indexing/enums/code-symbol-kind.enum';
import { SourceLanguage } from '../../indexing/enums/source-language.enum';
import { KnowledgeNodeKind } from '../../knowledge/enums/knowledge-node-kind.enum';
import { RepositoriesService } from '../../repositories/repositories.service';
import { SearchDocumentSourceType } from '../enums/search-document-source-type.enum';
import { SearchRankingService } from '../ranking/search-ranking.service';
import { normalizeTechnicalSearchText } from '../utils/search-text.utils';
import { SearchGraphExpansionRepository } from './search-graph-expansion.repository';
import { SearchQueryRepository } from './search-query.repository';
import {
  SearchDocumentKind,
  SearchIndexSummary,
  SearchQueryInput,
  SearchQueryResult,
  ScopedSearchIndexSummary,
} from './search-query.types';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const SEARCH_KINDS = new Set<SearchDocumentKind>([
  'file',
  ...Object.values(CodeSymbolKind),
  ...Object.values(KnowledgeNodeKind),
]);

@Injectable()
export class SearchQueryService {
  constructor(
    @Inject(searchConfig.KEY)
    private readonly configuration: ConfigType<typeof searchConfig>,
    private readonly repositoriesService: RepositoriesService,
    private readonly queryRepository: SearchQueryRepository,
    private readonly graphExpansionRepository: SearchGraphExpansionRepository,
    private readonly rankingService: SearchRankingService,
  ) {}

  /** Searches only the current immutable projection within one tenant scope. */
  async search(input: SearchQueryInput): Promise<SearchQueryResult> {
    const normalizedInput = this.validateAndNormalize(input);
    await this.repositoriesService.findOne(
      input.organizationId,
      input.repositoryId,
    );
    const searchIndex = await this.queryRepository.findCurrentIndex(
      input.organizationId,
      input.repositoryId,
      input.branchId,
    );

    if (!searchIndex) {
      throw new NotFoundException('Current search index was not found');
    }

    const [data, total] = await this.queryRepository.search({
      searchIndexId: searchIndex.id,
      exactQuery: normalizedInput.exactQuery,
      normalizedQuery: normalizedInput.normalizedQuery,
      page: normalizedInput.page,
      limit: normalizedInput.limit,
      sourceType: input.sourceType,
      language: input.language,
      kind: input.kind,
    });
    const seedDocumentIds = data
      .slice(0, this.configuration.graphMaxSeeds)
      .map((result) => result.id);
    const graphExpansion = await this.graphExpansionRepository.expand({
      organizationId: searchIndex.organizationId,
      repositoryId: searchIndex.repositoryId,
      branchId: searchIndex.branchId,
      searchIndexId: searchIndex.id,
      knowledgeSnapshotId: searchIndex.knowledgeSnapshotId,
      seedDocumentIds,
      maxNeighborsPerSeed: this.configuration.graphMaxNeighborsPerSeed,
      maxTotalCandidates: this.configuration.graphMaxTotalCandidates,
      sourceType: input.sourceType,
      language: input.language,
      kind: input.kind,
    });
    const seedLimitTruncated = data.length > seedDocumentIds.length;
    const ranking = this.rankingService.rank(
      data,
      graphExpansion.data,
      normalizedInput.limit,
    );

    return {
      searchIndex: this.toPublicIndexSummary(searchIndex),
      query: {
        original: normalizedInput.exactQuery,
        normalized: normalizedInput.normalizedQuery,
      },
      filters: {
        sourceType: input.sourceType ?? null,
        language: input.language ?? null,
        kind: input.kind ?? null,
      },
      data: ranking.data,
      ranking: {
        candidateCount: ranking.candidateCount,
        deduplicatedCount: ranking.deduplicatedCount,
        returnedCount: ranking.data.length,
        truncated: ranking.truncated,
      },
      graphExpansion: {
        depth: 1,
        seedsConsidered: seedDocumentIds.length,
        maxSeeds: this.configuration.graphMaxSeeds,
        maxNeighborsPerSeed: this.configuration.graphMaxNeighborsPerSeed,
        maxTotalCandidates: this.configuration.graphMaxTotalCandidates,
        truncated: seedLimitTruncated || graphExpansion.truncated,
        data: graphExpansion.data,
      },
      pagination: {
        page: normalizedInput.page,
        limit: normalizedInput.limit,
        total,
        totalPages: Math.ceil(total / normalizedInput.limit),
      },
    };
  }

  private validateAndNormalize(input: SearchQueryInput): {
    exactQuery: string;
    normalizedQuery: string;
    page: number;
    limit: number;
  } {
    const exactQuery = input.query?.trim();
    const normalizedQuery = normalizeTechnicalSearchText(exactQuery ?? '');
    const page = input.page ?? 1;
    const limit = input.limit ?? 20;

    if (
      !UUID_PATTERN.test(input.organizationId) ||
      !this.isPositiveInteger(input.repositoryId) ||
      !this.isPositiveInteger(input.branchId) ||
      !exactQuery ||
      exactQuery.length > this.configuration.maxQueryLength ||
      !normalizedQuery ||
      !this.isPositiveInteger(page) ||
      !this.isPositiveInteger(limit) ||
      limit > this.configuration.maxResultsPerPage ||
      (input.sourceType !== undefined &&
        !Object.values(SearchDocumentSourceType).includes(input.sourceType)) ||
      (input.language !== undefined &&
        !Object.values(SourceLanguage).includes(input.language)) ||
      (input.kind !== undefined && !SEARCH_KINDS.has(input.kind))
    ) {
      throw new BadRequestException('Search query is invalid');
    }

    return { exactQuery, normalizedQuery, page, limit };
  }

  private isPositiveInteger(value: number): boolean {
    return Number.isSafeInteger(value) && value > 0;
  }

  private toPublicIndexSummary(
    index: ScopedSearchIndexSummary,
  ): SearchIndexSummary {
    return {
      id: index.id,
      repositoryId: index.repositoryId,
      branchId: index.branchId,
      knowledgeSnapshotId: index.knowledgeSnapshotId,
      sourceIndexJobId: index.sourceIndexJobId,
      targetCommitSha: index.targetCommitSha,
      indexerVersion: index.indexerVersion,
      publishedAt: index.publishedAt,
    };
  }
}
