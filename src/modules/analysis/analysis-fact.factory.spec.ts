import {
  AnalysisFactError,
  AnalysisFactErrorCode,
} from './analysis-fact.errors';
import { AnalysisFactFactory } from './analysis-fact.factory';
import { AnalysisDerivationType } from './enums/analysis-derivation-type.enum';
import { AnalysisEvidenceRole } from './enums/analysis-evidence-role.enum';
import { AnalysisFactKind } from './enums/analysis-fact-kind.enum';
import { CreateAnalysisFactInput } from './types/analysis-fact.types';

describe('AnalysisFactFactory', () => {
  const evidence = {
    indexedFileId: 1,
    fileHashId: 2,
    codeSymbolId: 3,
    role: AnalysisEvidenceRole.CallSite,
    range: {
      start: { line: 1, column: 1, offset: 0 },
      end: { line: 1, column: 10, offset: 9 },
    },
  } as const;

  function createFactory(maxPropertyBytes = 1_000): AnalysisFactFactory {
    return new AnalysisFactFactory({ maxPropertyBytes } as never);
  }

  function createInput(
    properties: CreateAnalysisFactInput['properties'] = {
      callee: 'service.execute',
      argumentCount: 1,
    },
  ): CreateAnalysisFactInput {
    return {
      kind: AnalysisFactKind.CallSite,
      identityKey: 'call_site:2:0:9',
      analyzerName: 'typescript-technical',
      analyzerVersion: '1.0.0',
      derivationType: AnalysisDerivationType.Deterministic,
      confidence: 1,
      properties,
      evidence: [evidence],
    };
  }

  function captureError(action: () => void): AnalysisFactError {
    try {
      action();
    } catch (error: unknown) {
      if (error instanceof AnalysisFactError) {
        return error;
      }

      throw error;
    }

    throw new Error('Expected AnalysisFactError');
  }

  it('normalizes properties and produces a reproducible fingerprint', () => {
    const factory = createFactory();
    const first = factory.create(
      createInput({ callee: 'service.execute', argumentCount: 1 }),
    );
    const second = factory.create(
      createInput({ argumentCount: 1, callee: 'service.execute' }),
    );

    expect(first.contentFingerprint).toMatch(/^[0-9a-f]{64}$/u);
    expect(second.contentFingerprint).toBe(first.contentFingerprint);
    expect(Object.keys(first.properties)).toEqual(['argumentCount', 'callee']);
  });

  it('rejects invalid confidence and evidence', () => {
    expect(
      captureError(() =>
        createFactory().create({ ...createInput(), confidence: 1.1 }),
      ).code,
    ).toBe(AnalysisFactErrorCode.InvalidConfidence);
    expect(
      captureError(() =>
        createFactory().create({
          ...createInput(),
          evidence: [] as never,
        }),
      ).code,
    ).toBe(AnalysisFactErrorCode.MissingEvidence);
  });

  it('rejects property payloads above the configured limit', () => {
    expect(
      captureError(() =>
        createFactory(20).create(createInput({ value: 'x'.repeat(100) })),
      ).code,
    ).toBe(AnalysisFactErrorCode.PropertiesTooLarge);
  });
});
