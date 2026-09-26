import type {
  AnalysisFileContext,
  AnalysisFileSupportContext,
} from '../types/analysis-context.types';
import type { AnalysisOutput } from '../types/analysis-diagnostic.types';

export interface CodeAnalyzer {
  readonly name: string;
  readonly version: string;

  supports(context: AnalysisFileSupportContext): boolean;

  analyze(
    context: AnalysisFileContext,
  ): Iterable<AnalysisOutput> | AsyncIterable<AnalysisOutput>;
}
