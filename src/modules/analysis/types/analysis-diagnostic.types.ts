import { AnalysisDiagnosticSeverity } from '../enums/analysis-diagnostic-severity.enum';
import type { AnalysisEvidence, AnalysisFact } from './analysis-fact.types';

export interface AnalysisDiagnostic {
  type: 'diagnostic';
  analyzerName: string;
  analyzerVersion: string;
  code: string;
  severity: AnalysisDiagnosticSeverity;
  message: string;
  retryable: boolean;
  evidence: AnalysisEvidence | null;
}

export type AnalysisOutput = AnalysisDiagnostic | AnalysisFact;
