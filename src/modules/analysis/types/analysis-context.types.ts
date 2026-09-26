import type {
  CodeIntelligenceFile,
  CodeIntelligenceSnapshot,
} from '../../indexing/ports/code-intelligence-reader.port';
import type { ImmutableSourceContent } from '../../indexing/ports/immutable-source-reader.port';

export interface AnalysisFileSupportContext {
  snapshot: CodeIntelligenceSnapshot;
  file: CodeIntelligenceFile;
}

export interface AnalysisFileContext extends AnalysisFileSupportContext {
  source: ImmutableSourceContent;
}
