import { CodeSymbolKind } from '../../indexing/enums/code-symbol-kind.enum';
import { SourceLanguage } from '../../indexing/enums/source-language.enum';
import { KnowledgeNodeKind } from '../../knowledge/enums/knowledge-node-kind.enum';
import { SearchDocumentSourceType } from '../enums/search-document-source-type.enum';

export type SearchDocumentKind = 'file' | CodeSymbolKind | KnowledgeNodeKind;

export interface SearchQueryInput {
  organizationId: string;
  repositoryId: number;
  branchId: number;
  query: string;
  page?: number;
  limit?: number;
  sourceType?: SearchDocumentSourceType;
  language?: SourceLanguage;
  kind?: SearchDocumentKind;
}

export interface SearchQueryOptions {
  searchIndexId: number;
  exactQuery: string;
  normalizedQuery: string;
  page: number;
  limit: number;
  sourceType?: SearchDocumentSourceType;
  language?: SourceLanguage;
  kind?: SearchDocumentKind;
}

export interface SearchIndexSummary {
  id: number;
  organizationId: string;
  repositoryId: number;
  branchId: number;
  knowledgeSnapshotId: number;
  sourceIndexJobId: number;
  targetCommitSha: string;
  indexerVersion: string;
  publishedAt: Date;
}

export interface SearchMatchSignals {
  exactIdentifier: boolean;
  exactTitle: boolean;
  exactPath: boolean;
  titlePrefix: boolean;
  identifierPrefix: boolean;
  pathContains: boolean;
  lexical: boolean;
}

export interface SearchDocumentResultItem {
  id: number;
  sourceType: SearchDocumentSourceType;
  title: string;
  contentPreview: string;
  path: string | null;
  language: string | null;
  kind: string | null;
  source: {
    indexedFileId: number | null;
    fileHashId: number | null;
    codeSymbolId: number | null;
    knowledgeNodeId: number | null;
  };
  metadata: Record<string, string | number | boolean | null>;
}

export interface SearchResultItem extends SearchDocumentResultItem {
  score: number;
  match: SearchMatchSignals;
}

export type SearchGraphSource = 'code_dependency' | 'knowledge_edge';
export type SearchGraphDirection = 'incoming' | 'outgoing';

export interface SearchGraphExpansionOptions {
  organizationId: string;
  repositoryId: number;
  branchId: number;
  searchIndexId: number;
  knowledgeSnapshotId: number;
  seedDocumentIds: number[];
  maxNeighborsPerSeed: number;
  maxTotalCandidates: number;
  sourceType?: SearchDocumentSourceType;
  language?: SourceLanguage;
  kind?: SearchDocumentKind;
}

export interface SearchGraphCandidate {
  seedDocumentId: number;
  document: SearchDocumentResultItem;
  relationship: {
    source: SearchGraphSource;
    kind: string;
    direction: SearchGraphDirection;
    depth: 1;
  };
}

export interface SearchQueryResult {
  searchIndex: SearchIndexSummary;
  query: {
    original: string;
    normalized: string;
  };
  filters: {
    sourceType: SearchDocumentSourceType | null;
    language: SourceLanguage | null;
    kind: SearchDocumentKind | null;
  };
  data: SearchResultItem[];
  graphExpansion: {
    depth: 1;
    seedsConsidered: number;
    maxSeeds: number;
    maxNeighborsPerSeed: number;
    maxTotalCandidates: number;
    truncated: boolean;
    data: SearchGraphCandidate[];
  };
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
