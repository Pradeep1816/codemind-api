import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import analysisConfig from '../../config/analysis.config';
import {
  AnalysisFactError,
  AnalysisFactErrorCode,
} from './analysis-fact.errors';
import {
  AnalysisEvidence,
  AnalysisFact,
  AnalysisPropertyValue,
  CreateAnalysisFactInput,
} from './types/analysis-fact.types';

const MAX_IDENTITY_KEY_LENGTH = 512;
const MAX_ANALYZER_IDENTITY_LENGTH = 100;

@Injectable()
export class AnalysisFactFactory {
  constructor(
    @Inject(analysisConfig.KEY)
    private readonly configuration: ConfigType<typeof analysisConfig>,
  ) {}

  /** Creates one validated, reproducible, ORM-independent analysis fact. */
  create(input: CreateAnalysisFactInput): AnalysisFact {
    this.assertBoundedText(
      input.identityKey,
      MAX_IDENTITY_KEY_LENGTH,
      AnalysisFactErrorCode.InvalidIdentity,
      'Analysis fact identity is invalid',
    );
    this.assertBoundedText(
      input.analyzerName,
      MAX_ANALYZER_IDENTITY_LENGTH,
      AnalysisFactErrorCode.InvalidAnalyzer,
      'Analysis fact analyzer name is invalid',
    );
    this.assertBoundedText(
      input.analyzerVersion,
      MAX_ANALYZER_IDENTITY_LENGTH,
      AnalysisFactErrorCode.InvalidAnalyzer,
      'Analysis fact analyzer version is invalid',
    );

    if (
      !Number.isFinite(input.confidence) ||
      input.confidence < 0 ||
      input.confidence > 1
    ) {
      throw new AnalysisFactError(
        'Analysis fact confidence must be between zero and one',
        AnalysisFactErrorCode.InvalidConfidence,
      );
    }

    if (input.evidence.length === 0) {
      throw new AnalysisFactError(
        'Analysis fact requires source evidence',
        AnalysisFactErrorCode.MissingEvidence,
      );
    }

    for (const evidence of input.evidence) {
      this.assertEvidence(evidence);
    }

    const normalizedProperties = this.normalizeObject(input.properties);
    const propertiesJson = JSON.stringify(normalizedProperties);

    if (
      Buffer.byteLength(propertiesJson, 'utf8') >
      this.configuration.maxPropertyBytes
    ) {
      throw new AnalysisFactError(
        'Analysis fact properties exceed the configured byte limit',
        AnalysisFactErrorCode.PropertiesTooLarge,
      );
    }

    const fingerprintPayload = this.normalizeObject({
      analyzerName: input.analyzerName,
      analyzerVersion: input.analyzerVersion,
      confidence: input.confidence,
      derivationType: input.derivationType,
      evidence: input.evidence,
      identityKey: input.identityKey,
      kind: input.kind,
      properties: normalizedProperties,
    });

    return {
      type: 'fact',
      kind: input.kind,
      identityKey: input.identityKey,
      contentFingerprint: createHash('sha256')
        .update(JSON.stringify(fingerprintPayload))
        .digest('hex'),
      analyzerName: input.analyzerName,
      analyzerVersion: input.analyzerVersion,
      derivationType: input.derivationType,
      confidence: input.confidence,
      properties: normalizedProperties,
      evidence: input.evidence,
    };
  }

  private assertEvidence(evidence: AnalysisEvidence): void {
    if (
      !Number.isSafeInteger(evidence.indexedFileId) ||
      evidence.indexedFileId < 1 ||
      !Number.isSafeInteger(evidence.fileHashId) ||
      evidence.fileHashId < 1 ||
      (evidence.codeSymbolId !== null &&
        (!Number.isSafeInteger(evidence.codeSymbolId) ||
          evidence.codeSymbolId < 1))
    ) {
      throw new AnalysisFactError(
        'Analysis evidence identity is invalid',
        AnalysisFactErrorCode.InvalidEvidence,
      );
    }

    const range = evidence.range;

    if (
      range !== null &&
      (!Number.isSafeInteger(range.start.line) ||
        range.start.line < 1 ||
        !Number.isSafeInteger(range.start.column) ||
        range.start.column < 1 ||
        !Number.isSafeInteger(range.start.offset) ||
        range.start.offset < 0 ||
        !Number.isSafeInteger(range.end.line) ||
        range.end.line < range.start.line ||
        !Number.isSafeInteger(range.end.column) ||
        range.end.column < 1 ||
        !Number.isSafeInteger(range.end.offset) ||
        range.end.offset < range.start.offset)
    ) {
      throw new AnalysisFactError(
        'Analysis evidence range is invalid',
        AnalysisFactErrorCode.InvalidEvidence,
      );
    }
  }

  private normalizeObject(
    value: Readonly<Record<string, unknown>>,
  ): Readonly<Record<string, AnalysisPropertyValue>> {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, this.normalizeValue(value[key])]),
    );
  }

  private normalizeValue(value: unknown): AnalysisPropertyValue {
    if (
      value === null ||
      typeof value === 'string' ||
      typeof value === 'boolean'
    ) {
      return value;
    }

    if (typeof value === 'number') {
      if (!Number.isFinite(value)) {
        throw new AnalysisFactError(
          'Analysis fact properties must contain finite numbers',
          AnalysisFactErrorCode.InvalidProperties,
        );
      }

      return value;
    }

    if (Array.isArray(value)) {
      return value.map((entry) => this.normalizeValue(entry));
    }

    if (typeof value === 'object') {
      return this.normalizeObject(
        value as Readonly<Record<string, AnalysisPropertyValue>>,
      );
    }

    throw new AnalysisFactError(
      'Analysis fact properties contain an unsupported value',
      AnalysisFactErrorCode.InvalidProperties,
    );
  }

  private assertBoundedText(
    value: string,
    maxLength: number,
    code: AnalysisFactErrorCode,
    message: string,
  ): void {
    if (
      value.trim().length === 0 ||
      value.length > maxLength ||
      /[\0\r\n]/u.test(value)
    ) {
      throw new AnalysisFactError(message, code);
    }
  }
}
