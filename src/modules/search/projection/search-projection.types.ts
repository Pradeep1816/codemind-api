import { SearchDocumentSourceType } from '../enums/search-document-source-type.enum';
import { SearchIndexStatus } from '../enums/search-index-status.enum';

export interface BuildSearchProjectionInput {
  organizationId: string;
  repositoryId: number;
  knowledgeSnapshotId: number;
}

export interface CreateSearchIndexInput {
  organizationId: string;
  repositoryId: number;
  branchId: number;
  sourceIndexJobId: number;
  knowledgeSnapshotId: number;
  targetCommitSha: string;
  indexerVersion: string;
  configurationDigest: string;
}

export interface SearchIndexReference {
  id: number;
  status: SearchIndexStatus;
  isCurrent: boolean;
  documentCount: number;
  publishedAt: Date | null;
}

export interface SearchDocumentInput {
  organizationId: string;
  repositoryId: number;
  branchId: number;
  searchIndexId: number;
  sourceType: SearchDocumentSourceType;
  sourceIdentityKey: string;
  indexedFileId: number | null;
  fileHashId: number | null;
  codeSymbolId: number | null;
  knowledgeNodeId: number | null;
  title: string;
  content: string;
  path: string | null;
  language: string | null;
  kind: string | null;
  metadata: Record<string, string | number | boolean | null>;
}

export interface PublishedSearchIndex {
  searchIndexId: number;
  isCurrent: boolean;
  documentCount: number;
  publishedAt: Date;
}

export interface SearchDocumentCounts {
  files: number;
  symbols: number;
  knowledgeNodes: number;
  total: number;
}

export interface SearchProjectionResult extends PublishedSearchIndex {
  repositoryId: number;
  branchId: number;
  knowledgeSnapshotId: number;
  sourceIndexJobId: number;
  targetCommitSha: string;
  indexerVersion: string;
  reused: boolean;
  documents: SearchDocumentCounts;
}
