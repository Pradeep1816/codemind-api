import { Inject, Injectable } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import analysisConfig from '../../config/analysis.config';
import { CODE_INTELLIGENCE_READER } from '../indexing/ports/code-intelligence-reader.port';
import type {
  CodeIntelligenceReader,
  CodeIntelligenceSnapshotRequest,
} from '../indexing/ports/code-intelligence-reader.port';
import { IMMUTABLE_SOURCE_READER } from '../indexing/ports/immutable-source-reader.port';
import type { ImmutableSourceReader } from '../indexing/ports/immutable-source-reader.port';
import {
  AnalysisExecutionError,
  AnalysisExecutionErrorCode,
} from './analysis.errors';
import { TypeScriptBusinessAnalyzer } from './analyzers/business/typescript-business.analyzer';
import { TypeScriptStateAnalyzer } from './analyzers/business/typescript-state.analyzer';
import { TypeScriptTechnicalAnalyzer } from './analyzers/typescript/typescript-technical.analyzer';
import type { CodeAnalyzer } from './interfaces/code-analyzer.interface';
import { AnalysisFileContext } from './types/analysis-context.types';
import { AnalysisOutput } from './types/analysis-diagnostic.types';
import { AnalysisEvidence } from './types/analysis-fact.types';

@Injectable()
export class AnalysisService {
  private readonly analyzers: readonly CodeAnalyzer[];

  constructor(
    @Inject(analysisConfig.KEY)
    private readonly configuration: ConfigType<typeof analysisConfig>,
    @Inject(CODE_INTELLIGENCE_READER)
    private readonly codeIntelligenceReader: CodeIntelligenceReader,
    @Inject(IMMUTABLE_SOURCE_READER)
    private readonly immutableSourceReader: ImmutableSourceReader,
    @Inject(TypeScriptTechnicalAnalyzer)
    typeScriptTechnicalAnalyzer: CodeAnalyzer,
    @Inject(TypeScriptBusinessAnalyzer)
    typeScriptBusinessAnalyzer: CodeAnalyzer,
    @Inject(TypeScriptStateAnalyzer)
    typeScriptStateAnalyzer: CodeAnalyzer,
  ) {
    this.analyzers = [
      typeScriptTechnicalAnalyzer,
      typeScriptBusinessAnalyzer,
      typeScriptStateAnalyzer,
    ];
  }

  /**
   * Streams normalized facts for one successful Phase 3 snapshot. Source text
   * remains transient and is released after each file has been analyzed.
   */
  async *analyzeSnapshot(
    request: CodeIntelligenceSnapshotRequest,
  ): AsyncIterable<AnalysisOutput> {
    const snapshot = await this.codeIntelligenceReader.getSnapshot(request);
    let consumedSourceBytes = 0;

    for await (const file of this.codeIntelligenceReader.streamFiles(request)) {
      const supportContext = { snapshot, file };
      const analyzers = this.analyzers.filter((analyzer) =>
        analyzer.supports(supportContext),
      );

      if (analyzers.length === 0) {
        continue;
      }

      consumedSourceBytes += file.sizeBytes;

      if (consumedSourceBytes > this.configuration.maxTotalSourceBytes) {
        throw new AnalysisExecutionError(
          'Analysis source exceeds the configured snapshot byte limit',
          AnalysisExecutionErrorCode.SourceBudgetExceeded,
        );
      }

      const source = await this.immutableSourceReader.read({
        organizationId: snapshot.organizationId,
        repositoryId: snapshot.repositoryId,
        targetCommitSha: snapshot.targetCommitSha,
        indexedFileId: file.id,
        fileHashId: file.hash.id,
        path: file.path,
        gitBlobOid: file.hash.gitBlobOid,
        expectedSizeBytes: file.hash.sizeBytes,
      });

      if (
        source.indexedFileId !== file.id ||
        source.fileHashId !== file.hash.id ||
        source.path !== file.path ||
        source.gitBlobOid.toLowerCase() !==
          file.hash.gitBlobOid.toLowerCase() ||
        source.sizeBytes !== file.sizeBytes
      ) {
        throw new AnalysisExecutionError(
          'Immutable source identity differs from the Phase 3 snapshot',
          AnalysisExecutionErrorCode.SourceIdentityMismatch,
        );
      }

      const context: AnalysisFileContext = { snapshot, file, source };
      const identities = new Set<string>();
      let factCount = 0;
      let diagnosticCount = 0;

      for (const analyzer of analyzers) {
        try {
          for await (const output of analyzer.analyze(context)) {
            this.assertAnalyzerOutput(analyzer, context, output);

            if (output.type === 'fact') {
              factCount += 1;

              if (factCount > this.configuration.maxFactsPerFile) {
                throw new AnalysisExecutionError(
                  'Analysis fact count exceeds the configured per-file limit',
                  AnalysisExecutionErrorCode.FactLimitExceeded,
                );
              }

              if (identities.has(output.identityKey)) {
                throw new AnalysisExecutionError(
                  'Analyzer emitted a duplicate fact identity for one file',
                  AnalysisExecutionErrorCode.AnalyzerContractViolation,
                );
              }

              identities.add(output.identityKey);
            } else {
              diagnosticCount += 1;

              if (diagnosticCount > this.configuration.maxDiagnosticsPerFile) {
                throw new AnalysisExecutionError(
                  'Analysis diagnostic count exceeds the configured per-file limit',
                  AnalysisExecutionErrorCode.DiagnosticLimitExceeded,
                );
              }
            }

            yield output;
          }
        } catch (error: unknown) {
          if (error instanceof AnalysisExecutionError) {
            throw error;
          }

          throw new AnalysisExecutionError(
            `Analyzer ${analyzer.name}@${analyzer.version} failed`,
            AnalysisExecutionErrorCode.AnalyzerExecutionFailed,
            { cause: error },
          );
        }
      }
    }
  }

  private assertAnalyzerOutput(
    analyzer: CodeAnalyzer,
    context: AnalysisFileContext,
    output: AnalysisOutput,
  ): void {
    if (
      output.analyzerName !== analyzer.name ||
      output.analyzerVersion !== analyzer.version
    ) {
      throw new AnalysisExecutionError(
        'Analyzer output identity does not match its registered contract',
        AnalysisExecutionErrorCode.AnalyzerContractViolation,
      );
    }

    if (
      output.type === 'diagnostic' &&
      (output.code.trim().length === 0 ||
        output.code.length > 100 ||
        output.message.trim().length === 0 ||
        output.message.length > 1_000 ||
        output.message.includes('\0'))
    ) {
      throw new AnalysisExecutionError(
        'Analyzer emitted an invalid diagnostic',
        AnalysisExecutionErrorCode.AnalyzerContractViolation,
      );
    }

    const evidence =
      output.type === 'fact'
        ? output.evidence
        : output.evidence
          ? [output.evidence]
          : [];

    for (const item of evidence) {
      this.assertEvidenceScope(context, item);
    }
  }

  private assertEvidenceScope(
    context: AnalysisFileContext,
    evidence: AnalysisEvidence,
  ): void {
    if (
      evidence.indexedFileId !== context.file.id ||
      evidence.fileHashId !== context.file.hash.id ||
      (evidence.range !== null &&
        evidence.range.end.offset > context.source.content.length)
    ) {
      throw new AnalysisExecutionError(
        'Analyzer evidence falls outside the current immutable source',
        AnalysisExecutionErrorCode.AnalyzerContractViolation,
      );
    }
  }
}
