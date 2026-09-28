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

export interface SearchResultItem {
  id: number;
  sourceType: SearchDocumentSourceType;
  title: string;
  contentPreview: string;
  path: string | null;
  language: string | null;
  kind: string | null;
  score: number;
  match: SearchMatchSignals;
  source: {
    indexedFileId: number | null;
    fileHashId: number | null;
    codeSymbolId: number | null;
    knowledgeNodeId: number | null;
  };
  metadata: Record<string, string | number | boolean | null>;
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
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
