import { FileHashAlgorithm } from '../../indexing/enums/file-hash-algorithm.enum';
import { CodeSymbolKind } from '../../indexing/enums/code-symbol-kind.enum';
import { KnowledgeDerivationType } from '../enums/knowledge-derivation-type.enum';
import { KnowledgeEdgeKind } from '../enums/knowledge-edge-kind.enum';
import { KnowledgeEvidenceRole } from '../enums/knowledge-evidence-role.enum';
import { KnowledgeNodeKind } from '../enums/knowledge-node-kind.enum';
import { KnowledgeSnapshotStatus } from '../enums/knowledge-snapshot-status.enum';

export interface PaginationResponseDto {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface KnowledgeSnapshotResponseDto {
  id: number;
  repositoryId: number;
  branchId: number;
  knowledgeBuildId: number;
  sourceIndexJobId: number;
  targetCommitSha: string;
  analyzerBundleVersion: string;
  configurationDigest: string;
  status: KnowledgeSnapshotStatus;
  isCurrent: boolean;
  publishedAt: string;
  supersededAt: string | null;
  createdAt: string;
}

export interface KnowledgeSnapshotDetailResponseDto extends KnowledgeSnapshotResponseDto {
  graph: {
    nodes: number;
    edges: number;
  };
}

export interface KnowledgeSnapshotListResponseDto {
  data: KnowledgeSnapshotResponseDto[];
  pagination: PaginationResponseDto;
}

export interface KnowledgeEvidenceSummaryDto {
  id: number;
  role: KnowledgeEvidenceRole;
  file: {
    id: number;
    path: string;
    hash: {
      id: number;
      algorithm: FileHashAlgorithm;
      value: string;
    };
  };
  symbol: {
    id: number;
    name: string;
    qualifiedName: string;
    kind: CodeSymbolKind;
  } | null;
  range: {
    startLine: number;
    startColumn: number;
    startOffset: number;
    endLine: number;
    endColumn: number;
    endOffset: number;
  } | null;
}

export interface KnowledgeNodeResponseDto {
  id: number;
  identityKey: string;
  kind: KnowledgeNodeKind;
  name: string;
  summary: string | null;
  derivationType: KnowledgeDerivationType;
  confidence: number;
  analyzerName: string;
  analyzerVersion: string;
  contentFingerprint: string;
  propertySchemaVersion: number;
  properties: Record<string, unknown>;
  createdAt: string;
}

export interface KnowledgeNodeDetailResponseDto extends KnowledgeNodeResponseDto {
  evidence: KnowledgeEvidenceSummaryDto[];
  evidenceTotal: number;
  evidenceTruncated: boolean;
}

export interface KnowledgeNodeListResponseDto {
  data: KnowledgeNodeResponseDto[];
  pagination: PaginationResponseDto;
}

export interface KnowledgeNodeReferenceResponseDto {
  id: number;
  identityKey: string;
  kind: KnowledgeNodeKind;
  name: string;
}

export interface KnowledgeEdgeResponseDto {
  id: number;
  identityKey: string;
  kind: KnowledgeEdgeKind;
  source: KnowledgeNodeReferenceResponseDto;
  target: KnowledgeNodeReferenceResponseDto;
  derivationType: KnowledgeDerivationType;
  confidence: number;
  analyzerName: string;
  analyzerVersion: string;
  contentFingerprint: string;
  propertySchemaVersion: number;
  properties: Record<string, unknown>;
  createdAt: string;
}

export interface KnowledgeEdgeDetailResponseDto extends KnowledgeEdgeResponseDto {
  evidence: KnowledgeEvidenceSummaryDto[];
  evidenceTotal: number;
  evidenceTruncated: boolean;
}

export interface KnowledgeEdgeListResponseDto {
  data: KnowledgeEdgeResponseDto[];
  pagination: PaginationResponseDto;
}
