import { CodeDependencyKind } from '../enums/code-dependency-kind.enum';
import { CodeSymbolKind } from '../enums/code-symbol-kind.enum';
import { CodeSymbolVisibility } from '../enums/code-symbol-visibility.enum';
import { SourceLanguage } from '../enums/source-language.enum';

export const CODE_INTELLIGENCE_READER = Symbol('CODE_INTELLIGENCE_READER');

export interface CodeIntelligenceSnapshotRequest {
  organizationId: string;
  repositoryId: number;
  indexJobId: number;
}

export interface CodeIntelligenceSnapshot {
  organizationId: string;
  repositoryId: number;
  branchId: number;
  indexJobId: number;
  targetCommitSha: string;
  totalFiles: number;
  completedAt: Date;
}

export interface CodeIntelligenceSourceRange {
  startLine: number;
  startColumn: number;
  startOffset: number;
  endLine: number;
  endColumn: number;
  endOffset: number;
}

export interface CodeIntelligenceFileHash {
  id: number;
  sha256: string;
  gitBlobOid: string;
  sizeBytes: number;
}

export interface CodeIntelligenceSymbol extends CodeIntelligenceSourceRange {
  id: number;
  indexedFileId: number;
  fileHashId: number;
  name: string;
  qualifiedName: string;
  kind: CodeSymbolKind;
  visibility: CodeSymbolVisibility | null;
  exported: boolean;
  defaultExport: boolean;
  signature: string | null;
  documentation?: string | null;
}

export interface CodeIntelligenceDependency extends CodeIntelligenceSourceRange {
  id: number;
  sourceIndexedFileId: number;
  sourceFileHashId: number;
  sourceSymbolId: number | null;
  kind: CodeDependencyKind;
  moduleSpecifier: string | null;
  targetName: string | null;
  localName: string | null;
  typeOnly: boolean;
  targetIndexedFileId: number | null;
  targetFileHashId: number | null;
  targetSymbolId: number | null;
}

export interface CodeIntelligenceFile {
  id: number;
  path: string;
  extension: string;
  language: SourceLanguage;
  sizeBytes: number;
  hash: CodeIntelligenceFileHash;
  symbols: readonly CodeIntelligenceSymbol[];
  dependencies: readonly CodeIntelligenceDependency[];
}

export interface CodeIntelligenceReader {
  getSnapshot(
    request: CodeIntelligenceSnapshotRequest,
  ): Promise<CodeIntelligenceSnapshot>;

  streamFiles(
    request: CodeIntelligenceSnapshotRequest,
  ): AsyncIterable<CodeIntelligenceFile>;
}
