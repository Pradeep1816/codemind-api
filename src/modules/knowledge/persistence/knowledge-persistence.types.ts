import { KnowledgeBuildTrigger } from '../enums/knowledge-build-trigger.enum';
import { KnowledgeDerivationType } from '../enums/knowledge-derivation-type.enum';
import { KnowledgeEdgeKind } from '../enums/knowledge-edge-kind.enum';
import { KnowledgeEvidenceRole } from '../enums/knowledge-evidence-role.enum';
import { KnowledgeNodeKind } from '../enums/knowledge-node-kind.enum';

export interface CreateKnowledgeBuildInput {
  organizationId: string;
  repositoryId: number;
  branchId: number;
  sourceIndexJobId: number;
  requestedByUserId: string | null;
  trigger: KnowledgeBuildTrigger;
  analyzerBundleVersion: string;
  configurationDigest: string;
  maxAttempts: number;
}

export interface CreatedKnowledgeBuild {
  buildId: number;
  snapshotId: number;
  targetCommitSha: string;
}

export interface OwnedKnowledgeBuildInput {
  organizationId: string;
  repositoryId: number;
  buildId: number;
  leaseToken: string;
}

export interface KnowledgeEvidenceInput {
  indexedFileId: number;
  fileHashId: number;
  codeSymbolId: number | null;
  role: KnowledgeEvidenceRole;
  range: {
    startLine: number;
    startColumn: number;
    startOffset: number;
    endLine: number;
    endColumn: number;
    endOffset: number;
  } | null;
}

export interface KnowledgeNodeReference {
  kind: KnowledgeNodeKind;
  identityKey: string;
}

export interface KnowledgeNodeInput extends KnowledgeNodeReference {
  name: string;
  summary: string | null;
  derivationType: KnowledgeDerivationType;
  confidence: number;
  analyzerName: string;
  analyzerVersion: string;
  contentFingerprint: string;
  propertySchemaVersion: number;
  properties: Readonly<Record<string, unknown>>;
  evidence: readonly [KnowledgeEvidenceInput, ...KnowledgeEvidenceInput[]];
}

export interface KnowledgeEdgeInput {
  identityKey: string;
  kind: KnowledgeEdgeKind;
  source: KnowledgeNodeReference;
  target: KnowledgeNodeReference;
  derivationType: KnowledgeDerivationType;
  confidence: number;
  analyzerName: string;
  analyzerVersion: string;
  contentFingerprint: string;
  propertySchemaVersion: number;
  properties: Readonly<Record<string, unknown>>;
  evidence: readonly [KnowledgeEvidenceInput, ...KnowledgeEvidenceInput[]];
}

export interface PersistKnowledgeGraphBatchInput extends OwnedKnowledgeBuildInput {
  nodes: readonly KnowledgeNodeInput[];
  edges: readonly KnowledgeEdgeInput[];
}

export interface PersistKnowledgeGraphBatchResult {
  snapshotId: number;
  persistedNodes: number;
  persistedEdges: number;
}

export interface PublishKnowledgeSnapshotResult {
  buildId: number;
  snapshotId: number;
  targetCommitSha: string;
  isCurrent: boolean;
  publishedAt: Date;
}
