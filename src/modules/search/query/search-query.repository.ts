import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { SearchIndexEntity } from '../entities/search-index.entity';
import { SearchIndexStatus } from '../enums/search-index-status.enum';
import {
  ScopedSearchIndexSummary,
  SearchQueryOptions,
  SearchResultItem,
} from './search-query.types';

interface SearchResultRow {
  id: number;
  sourceType: SearchResultItem['sourceType'];
  title: string;
  contentPreview: string;
  path: string | null;
  language: string | null;
  kind: string | null;
  metadata: SearchResultItem['metadata'];
  indexedFileId: number | null;
  fileHashId: number | null;
  codeSymbolId: number | null;
  knowledgeNodeId: number | null;
  exactIdentifier: boolean;
  exactTitle: boolean;
  exactPath: boolean;
  titlePrefix: boolean;
  identifierPrefix: boolean;
  pathContains: boolean;
  lexical: boolean;
  score: string | number;
}

const CANDIDATE_QUERY = `
  WITH query_terms AS (
    SELECT plainto_tsquery('simple'::regconfig, $3) AS terms
  ), candidates AS (
    SELECT
      document."id",
      document."source_type" AS "sourceType",
      document."title",
      left(document."content", 500) AS "contentPreview",
      document."path",
      document."language",
      document."kind",
      document."metadata",
      document."indexed_file_id" AS "indexedFileId",
      document."file_hash_id" AS "fileHashId",
      document."code_symbol_id" AS "codeSymbolId",
      document."knowledge_node_id" AS "knowledgeNodeId",
      lower(coalesce(document."metadata"->>'name', '')) = lower($2)
        AS "exactIdentifier",
      lower(document."title") = lower($2) AS "exactTitle",
      lower(coalesce(document."path", '')) = lower($2) AS "exactPath",
      strpos(lower(document."title"), lower($2)) = 1 AS "titlePrefix",
      strpos(
        lower(coalesce(document."metadata"->>'name', '')),
        lower($2)
      ) = 1 AS "identifierPrefix",
      strpos(lower(coalesce(document."path", '')), lower($2)) > 0
        AS "pathContains",
      document."search_vector" @@ query_terms.terms AS "lexical",
      (
        CASE WHEN lower(coalesce(document."metadata"->>'name', '')) = lower($2)
          THEN 120 ELSE 0 END +
        CASE WHEN lower(document."title") = lower($2)
          THEN 110 ELSE 0 END +
        CASE WHEN lower(coalesce(document."path", '')) = lower($2)
          THEN 100 ELSE 0 END +
        CASE WHEN strpos(lower(document."title"), lower($2)) = 1
          THEN 70 ELSE 0 END +
        CASE WHEN strpos(
          lower(coalesce(document."metadata"->>'name', '')),
          lower($2)
        ) = 1 THEN 65 ELSE 0 END +
        CASE WHEN strpos(lower(coalesce(document."path", '')), lower($2)) > 0
          THEN 40 ELSE 0 END +
        ts_rank_cd(
          ARRAY[0.1, 0.2, 0.4, 1.0]::real[],
          document."search_vector",
          query_terms.terms,
          32
        ) * 50
      ) AS "score"
    FROM "search_documents" document
    CROSS JOIN query_terms
    WHERE document."search_index_id" = $1
      AND ($4::text IS NULL OR document."source_type"::text = $4::text)
      AND ($5::text IS NULL OR document."language" = $5::text)
      AND ($6::text IS NULL OR document."kind" = $6::text)
  )
`;

const MATCH_PREDICATE = `
  "exactIdentifier" OR "exactTitle" OR "exactPath" OR
  "titlePrefix" OR "identifierPrefix" OR "pathContains" OR "lexical"
`;

@Injectable()
export class SearchQueryRepository {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(SearchIndexEntity)
    private readonly searchIndexRepository: Repository<SearchIndexEntity>,
  ) {}

  async findCurrentIndex(
    organizationId: string,
    repositoryId: number,
    branchId: number,
  ): Promise<ScopedSearchIndexSummary | null> {
    const index = await this.searchIndexRepository.findOne({
      where: {
        organizationId,
        repositoryId,
        branchId,
        status: SearchIndexStatus.Published,
        isCurrent: true,
      },
    });

    if (!index?.publishedAt) {
      return null;
    }

    return {
      id: index.id,
      organizationId: index.organizationId,
      repositoryId: index.repositoryId,
      branchId: index.branchId,
      knowledgeSnapshotId: index.knowledgeSnapshotId,
      sourceIndexJobId: index.sourceIndexJobId,
      targetCommitSha: index.targetCommitSha,
      indexerVersion: index.indexerVersion,
      publishedAt: index.publishedAt,
    };
  }

  async search(
    options: SearchQueryOptions,
  ): Promise<[SearchResultItem[], number]> {
    const parameters = [
      options.searchIndexId,
      options.exactQuery,
      options.normalizedQuery,
      options.sourceType ?? null,
      options.language ?? null,
      options.kind ?? null,
    ];
    const countRows = await this.dataSource.query<Array<{ count: string }>>(
      `${CANDIDATE_QUERY}
       SELECT COUNT(*) AS "count"
       FROM candidates
       WHERE ${MATCH_PREDICATE}`,
      parameters,
    );
    const total = Number(countRows[0]?.count ?? 0);

    if (total === 0) {
      return [[], 0];
    }

    const offset = (options.page - 1) * options.limit;
    const rows = await this.dataSource.query<SearchResultRow[]>(
      `${CANDIDATE_QUERY}
       SELECT *
       FROM candidates
       WHERE ${MATCH_PREDICATE}
       ORDER BY "score" DESC, "sourceType" ASC, "title" ASC, "id" ASC
       LIMIT $7 OFFSET $8`,
      [...parameters, options.limit, offset],
    );

    return [
      rows.map((row) => ({
        id: row.id,
        sourceType: row.sourceType,
        title: row.title,
        contentPreview: row.contentPreview,
        path: row.path,
        language: row.language,
        kind: row.kind,
        score: Number(row.score),
        match: {
          exactIdentifier: row.exactIdentifier,
          exactTitle: row.exactTitle,
          exactPath: row.exactPath,
          titlePrefix: row.titlePrefix,
          identifierPrefix: row.identifierPrefix,
          pathContains: row.pathContains,
          lexical: row.lexical,
        },
        source: {
          indexedFileId: row.indexedFileId,
          fileHashId: row.fileHashId,
          codeSymbolId: row.codeSymbolId,
          knowledgeNodeId: row.knowledgeNodeId,
        },
        metadata: row.metadata,
      })),
      total,
    ];
  }
}
