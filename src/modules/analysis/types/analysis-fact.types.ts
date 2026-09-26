import { AnalysisDerivationType } from '../enums/analysis-derivation-type.enum';
import { AnalysisEvidenceRole } from '../enums/analysis-evidence-role.enum';
import { AnalysisFactKind } from '../enums/analysis-fact-kind.enum';

export interface AnalysisSourcePosition {
  line: number;
  column: number;
  offset: number;
}

export interface AnalysisSourceRange {
  start: AnalysisSourcePosition;
  end: AnalysisSourcePosition;
}

export interface AnalysisEvidence {
  indexedFileId: number;
  fileHashId: number;
  codeSymbolId: number | null;
  role: AnalysisEvidenceRole;
  range: AnalysisSourceRange | null;
}

export type AnalysisPropertyValue =
  | string
  | number
  | boolean
  | null
  | readonly AnalysisPropertyValue[]
  | { readonly [key: string]: AnalysisPropertyValue };

export type AnalysisProperties = Readonly<
  Record<string, AnalysisPropertyValue>
>;

export interface AnalysisFact {
  type: 'fact';
  kind: AnalysisFactKind;
  identityKey: string;
  contentFingerprint: string;
  analyzerName: string;
  analyzerVersion: string;
  derivationType: AnalysisDerivationType;
  confidence: number;
  properties: AnalysisProperties;
  evidence: readonly [AnalysisEvidence, ...AnalysisEvidence[]];
}

export interface CreateAnalysisFactInput {
  kind: AnalysisFactKind;
  identityKey: string;
  analyzerName: string;
  analyzerVersion: string;
  derivationType: AnalysisDerivationType;
  confidence: number;
  properties: AnalysisProperties;
  evidence: readonly [AnalysisEvidence, ...AnalysisEvidence[]];
}
