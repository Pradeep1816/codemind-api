import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  SearchGraphCandidate,
  SearchGraphExpansionOptions,
  SearchGraphSource,
  SearchGraphDirection,
} from './search-query.types';

interface SearchGraphCandidateRow {
  seedDocumentId: number;
  graphSource: SearchGraphSource;
  relationshipKind: string;
  direction: SearchGraphDirection;
  seedCandidateCount: string | number;
  id: number;
  sourceType: SearchGraphCandidate['document']['sourceType'];
  title: string;
  contentPreview: string;
  path: string | null;
  language: string | null;
  kind: string | null;
  metadata: SearchGraphCandidate['document']['metadata'];
  indexedFileId: number | null;
  fileHashId: number | null;
  codeSymbolId: number | null;
  knowledgeNodeId: number | null;
}

export interface SearchGraphExpansionResult {
  data: SearchGraphCandidate[];
  truncated: boolean;
}

/**
 * Reads one-hop neighbors from the immutable Phase 3 and Phase 4 graphs.
 * Search only projects those relationships; it never writes graph truth.
 */
@Injectable()
export class SearchGraphExpansionRepository {
  constructor(private readonly dataSource: DataSource) {}

  async expand(
    options: SearchGraphExpansionOptions,
  ): Promise<SearchGraphExpansionResult> {
    if (options.seedDocumentIds.length === 0) {
      return { data: [], truncated: false };
    }

    const rows = await this.dataSource.query<SearchGraphCandidateRow[]>(
      GRAPH_EXPANSION_QUERY,
      [
        options.searchIndexId,
        options.seedDocumentIds,
        options.organizationId,
        options.repositoryId,
        options.branchId,
        options.knowledgeSnapshotId,
        options.sourceType ?? null,
        options.language ?? null,
        options.kind ?? null,
        options.maxNeighborsPerSeed,
        options.maxTotalCandidates + 1,
      ],
    );
    const globallyTruncated = rows.length > options.maxTotalCandidates;
    const selectedRows = rows.slice(0, options.maxTotalCandidates);
    const perSeedTruncated = selectedRows.some(
      (row) => Number(row.seedCandidateCount) > options.maxNeighborsPerSeed,
    );

    return {
      truncated: globallyTruncated || perSeedTruncated,
      data: selectedRows.map((row) => ({
        seedDocumentId: row.seedDocumentId,
        document: {
          id: row.id,
          sourceType: row.sourceType,
          title: row.title,
          contentPreview: row.contentPreview,
          path: row.path,
          language: row.language,
          kind: row.kind,
          source: {
            indexedFileId: row.indexedFileId,
            fileHashId: row.fileHashId,
            codeSymbolId: row.codeSymbolId,
            knowledgeNodeId: row.knowledgeNodeId,
          },
          metadata: row.metadata,
        },
        relationship: {
          source: row.graphSource,
          kind: row.relationshipKind,
          direction: row.direction,
          depth: 1,
        },
      })),
    };
  }
}

const GRAPH_EXPANSION_QUERY = `
  WITH seed_ids AS (
    SELECT "seedDocumentId", "seedOrder"
    FROM unnest($2::integer[]) WITH ORDINALITY
      AS seeds("seedDocumentId", "seedOrder")
  ), seeds AS (
    SELECT document.*, seed_ids."seedOrder"
    FROM seed_ids
    INNER JOIN search_documents document
      ON document.id = seed_ids."seedDocumentId"
     AND document.search_index_id = $1
  ), relations AS (
    SELECT
      seed.id AS "seedDocumentId",
      seed."seedOrder",
      neighbor.id AS "documentId",
      'code_dependency'::text AS "graphSource",
      dependency.kind::text AS "relationshipKind",
      'outgoing'::text AS "direction",
      dependency.id AS "relationshipId"
    FROM seeds seed
    INNER JOIN code_dependencies dependency
      ON dependency.organization_id = $3
     AND dependency.repository_id = $4
     AND dependency.branch_id = $5
     AND (
       (seed.code_symbol_id IS NOT NULL AND
        dependency.source_symbol_id = seed.code_symbol_id) OR
       (seed.code_symbol_id IS NULL AND
        seed.indexed_file_id IS NOT NULL AND
        dependency.source_indexed_file_id = seed.indexed_file_id AND
        dependency.source_file_hash_id = seed.file_hash_id)
     )
    INNER JOIN search_documents neighbor
      ON neighbor.search_index_id = $1
     AND (
       (dependency.target_symbol_id IS NOT NULL AND
        neighbor.code_symbol_id = dependency.target_symbol_id) OR
       (dependency.target_symbol_id IS NULL AND
        dependency.target_indexed_file_id IS NOT NULL AND
        neighbor.source_type = 'file' AND
        neighbor.indexed_file_id = dependency.target_indexed_file_id AND
        neighbor.file_hash_id = dependency.target_file_hash_id)
     )
     AND neighbor.id <> seed.id

    UNION ALL

    SELECT
      seed.id AS "seedDocumentId",
      seed."seedOrder",
      neighbor.id AS "documentId",
      'code_dependency'::text AS "graphSource",
      dependency.kind::text AS "relationshipKind",
      'incoming'::text AS "direction",
      dependency.id AS "relationshipId"
    FROM seeds seed
    INNER JOIN code_dependencies dependency
      ON dependency.organization_id = $3
     AND dependency.repository_id = $4
     AND dependency.branch_id = $5
     AND (
       (seed.code_symbol_id IS NOT NULL AND
        dependency.target_symbol_id = seed.code_symbol_id) OR
       (seed.code_symbol_id IS NULL AND
        seed.indexed_file_id IS NOT NULL AND
        dependency.target_indexed_file_id = seed.indexed_file_id AND
        dependency.target_file_hash_id = seed.file_hash_id)
     )
    INNER JOIN search_documents neighbor
      ON neighbor.search_index_id = $1
     AND (
       (dependency.source_symbol_id IS NOT NULL AND
        neighbor.code_symbol_id = dependency.source_symbol_id) OR
       (dependency.source_symbol_id IS NULL AND
        neighbor.source_type = 'file' AND
        neighbor.indexed_file_id = dependency.source_indexed_file_id AND
        neighbor.file_hash_id = dependency.source_file_hash_id)
     )
     AND neighbor.id <> seed.id

    UNION ALL

    SELECT
      seed.id AS "seedDocumentId",
      seed."seedOrder",
      neighbor.id AS "documentId",
      'knowledge_edge'::text AS "graphSource",
      edge.kind::text AS "relationshipKind",
      'outgoing'::text AS "direction",
      edge.id AS "relationshipId"
    FROM seeds seed
    INNER JOIN knowledge_edges edge
      ON edge.organization_id = $3
     AND edge.repository_id = $4
     AND edge.branch_id = $5
     AND edge.snapshot_id = $6
     AND edge.source_node_id = seed.knowledge_node_id
    INNER JOIN search_documents neighbor
      ON neighbor.search_index_id = $1
     AND neighbor.knowledge_node_id = edge.target_node_id
     AND neighbor.id <> seed.id

    UNION ALL

    SELECT
      seed.id AS "seedDocumentId",
      seed."seedOrder",
      neighbor.id AS "documentId",
      'knowledge_edge'::text AS "graphSource",
      edge.kind::text AS "relationshipKind",
      'incoming'::text AS "direction",
      edge.id AS "relationshipId"
    FROM seeds seed
    INNER JOIN knowledge_edges edge
      ON edge.organization_id = $3
     AND edge.repository_id = $4
     AND edge.branch_id = $5
     AND edge.snapshot_id = $6
     AND edge.target_node_id = seed.knowledge_node_id
    INNER JOIN search_documents neighbor
      ON neighbor.search_index_id = $1
     AND neighbor.knowledge_node_id = edge.source_node_id
     AND neighbor.id <> seed.id
  ), deduplicated AS (
    SELECT DISTINCT ON ("seedDocumentId", "documentId") *
    FROM relations
    ORDER BY
      "seedDocumentId",
      "documentId",
      "graphSource",
      "relationshipKind",
      "direction",
      "relationshipId"
  ), eligible AS (
    SELECT deduplicated.*, document.*
    FROM deduplicated
    INNER JOIN search_documents document
      ON document.id = deduplicated."documentId"
     AND document.search_index_id = $1
    WHERE ($7::text IS NULL OR document.source_type::text = $7::text)
      AND ($8::text IS NULL OR document.language = $8::text)
      AND ($9::text IS NULL OR document.kind = $9::text)
  ), ranked AS (
    SELECT
      eligible.*,
      count(*) OVER (PARTITION BY "seedDocumentId") AS "seedCandidateCount",
      row_number() OVER (
        PARTITION BY "seedDocumentId"
        ORDER BY
          "graphSource",
          "relationshipKind",
          "direction",
          "documentId"
      ) AS "neighborRank"
    FROM eligible
  )
  SELECT
    ranked."seedDocumentId",
    ranked."graphSource",
    ranked."relationshipKind",
    ranked."direction",
    ranked."seedCandidateCount",
    ranked.id,
    ranked.source_type AS "sourceType",
    ranked.title,
    left(ranked.content, 500) AS "contentPreview",
    ranked.path,
    ranked.language,
    ranked.kind,
    ranked.metadata,
    ranked.indexed_file_id AS "indexedFileId",
    ranked.file_hash_id AS "fileHashId",
    ranked.code_symbol_id AS "codeSymbolId",
    ranked.knowledge_node_id AS "knowledgeNodeId"
  FROM ranked
  WHERE ranked."neighborRank" <= $10
  ORDER BY ranked."seedOrder", ranked."neighborRank", ranked."documentId"
  LIMIT $11
`;
