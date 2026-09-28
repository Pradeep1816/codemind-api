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
import { normalizeTechnicalSearchText } from '../utils/search-text.utils';
import { SearchQueryRepository } from './search-query.repository';
import {
  SearchDocumentKind,
  SearchQueryInput,
  SearchQueryResult,
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

    return {
      searchIndex,
      query: {
        original: normalizedInput.exactQuery,
        normalized: normalizedInput.normalizedQuery,
      },
      filters: {
        sourceType: input.sourceType ?? null,
        language: input.language ?? null,
        kind: input.kind ?? null,
      },
      data,
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
}
