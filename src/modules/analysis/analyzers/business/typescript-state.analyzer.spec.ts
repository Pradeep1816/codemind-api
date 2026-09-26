import { CodeSymbolKind } from '../../../indexing/enums/code-symbol-kind.enum';
import { SourceLanguage } from '../../../indexing/enums/source-language.enum';
import { AnalysisFactFactory } from '../../analysis-fact.factory';
import { AnalysisDerivationType } from '../../enums/analysis-derivation-type.enum';
import { AnalysisFactKind } from '../../enums/analysis-fact-kind.enum';
import type { AnalysisFileContext } from '../../types/analysis-context.types';
import type { AnalysisOutput } from '../../types/analysis-diagnostic.types';
import type { AnalysisFact } from '../../types/analysis-fact.types';
import {
  TypeScriptStateAnalyzerError,
  TypeScriptStateAnalyzerErrorCode,
} from './typescript-state-analyzer.errors';
import { TypeScriptStateAnalyzer } from './typescript-state.analyzer';

describe('TypeScriptStateAnalyzer', () => {
  const snapshot = {
    organizationId: '5abf1e5e-e03c-4890-83a5-c4e84ad48d18',
    repositoryId: 2,
    branchId: 3,
    indexJobId: 4,
    targetCommitSha: '8e008e725d9e411c5bff3a713b91afeaf4613f13',
    totalFiles: 1,
    completedAt: new Date('2026-08-07T13:07:59.994Z'),
  };

  function createAnalyzer(maxAstNodesPerFile = 10_000) {
    return new TypeScriptStateAnalyzer(
      new AnalysisFactFactory({ maxPropertyBytes: 16_384 } as never),
      { maxAstNodesPerFile } as never,
    );
  }

  function createContext(content: string): AnalysisFileContext {
    const sizeBytes = Buffer.byteLength(content, 'utf8');
    const classStart = Math.max(content.indexOf('export class'), 0);
    const methodStart = Math.max(content.indexOf('cancel('), classStart);

    return {
      snapshot,
      file: {
        id: 7,
        path: 'src/appointments/appointment.service.ts',
        extension: 'ts',
        language: SourceLanguage.TypeScript,
        sizeBytes,
        hash: {
          id: 8,
          sha256: 'c'.repeat(64),
          gitBlobOid: 'a'.repeat(40),
          sizeBytes,
        },
        symbols: [
          {
            id: 10,
            indexedFileId: 7,
            fileHashId: 8,
            name: 'AppointmentService',
            qualifiedName: 'AppointmentService',
            kind: CodeSymbolKind.Class,
            visibility: null,
            exported: true,
            defaultExport: false,
            signature: null,
            startLine: 1,
            startColumn: 1,
            startOffset: classStart,
            endLine: 30,
            endColumn: 2,
            endOffset: content.length,
          },
          {
            id: 11,
            indexedFileId: 7,
            fileHashId: 8,
            name: 'cancel',
            qualifiedName: 'AppointmentService.cancel',
            kind: CodeSymbolKind.Method,
            visibility: null,
            exported: false,
            defaultExport: false,
            signature: null,
            startLine: 1,
            startColumn: 1,
            startOffset: methodStart,
            endLine: 29,
            endColumn: 2,
            endOffset: content.length - 2,
          },
        ],
        dependencies: [],
      },
      source: {
        indexedFileId: 7,
        fileHashId: 8,
        path: 'src/appointments/appointment.service.ts',
        gitBlobOid: 'a'.repeat(40),
        sizeBytes,
        content,
      },
    };
  }

  function collect(content: string, maxAstNodesPerFile = 10_000) {
    return [
      ...createAnalyzer(maxAstNodesPerFile).analyze(createContext(content)),
    ];
  }

  function facts(
    outputs: readonly AnalysisOutput[],
    kind: AnalysisFactKind,
  ): AnalysisFact[] {
    return outputs.filter(
      (output): output is AnalysisFact =>
        output.type === 'fact' && output.kind === kind,
    );
  }

  it('extracts enum states and a guarded state transition', () => {
    const outputs = collect(`
export enum AppointmentStatus {
  Pending = 'pending',
  Cancelled = 'cancelled',
}

export class AppointmentService {
  cancel(appointment) {
    if (appointment.status === AppointmentStatus.Pending) {
      appointment.status = AppointmentStatus.Cancelled;
    }
  }
}
`);
    const states = facts(outputs, AnalysisFactKind.State);
    const transitions = facts(outputs, AnalysisFactKind.StateTransition);

    expect(states.map((state) => state.properties.name)).toEqual(
      expect.arrayContaining(['Pending', 'Cancelled']),
    );
    expect(transitions).toHaveLength(1);
    expect(transitions[0]?.properties).toMatchObject({
      subject: 'appointment',
      field: 'status',
      fromStateName: 'Pending',
      toStateName: 'Cancelled',
      containingSymbolId: 11,
    });
    expect(transitions[0]?.derivationType).toBe(
      AnalysisDerivationType.Deterministic,
    );
    expect(transitions[0]?.evidence.map((item) => item.role)).toEqual([
      'assignment',
      'condition',
    ]);
  });

  it('preserves an unknown source state for direct literal assignment', () => {
    const outputs = collect(`
export class AppointmentService {
  cancel(appointment) {
    appointment.state = 'cancelled';
  }
}
`);
    const states = facts(outputs, AnalysisFactKind.State);
    const transition = facts(outputs, AnalysisFactKind.StateTransition)[0];

    expect(states).toHaveLength(1);
    expect(states[0]?.properties).toMatchObject({
      stateSet: 'appointment.state',
      name: 'cancelled',
      source: 'assignment',
    });
    expect(transition?.properties).toMatchObject({
      fromStateIdentityKey: null,
      fromStateName: null,
      toStateName: 'cancelled',
    });
    expect(transition?.derivationType).toBe(AnalysisDerivationType.Heuristic);
  });

  it('ignores non-state assignments and inequality guards', () => {
    const outputs = collect(`
export class AppointmentService {
  cancel(appointment) {
    appointment.name = 'cancelled';
    if (appointment.status !== AppointmentStatus.Pending) {
      appointment.status = AppointmentStatus.Cancelled;
    }
  }
}
`);
    const transition = facts(outputs, AnalysisFactKind.StateTransition)[0];

    expect(facts(outputs, AnalysisFactKind.StateTransition)).toHaveLength(1);
    expect(transition?.properties.fromStateIdentityKey).toBeNull();
  });

  it('enforces the shared bounded AST traversal limit', () => {
    let captured: TypeScriptStateAnalyzerError | null = null;

    try {
      collect('export enum State { One, Two }', 3);
    } catch (error: unknown) {
      if (error instanceof TypeScriptStateAnalyzerError) {
        captured = error;
      } else {
        throw error;
      }
    }

    expect(captured?.code).toBe(
      TypeScriptStateAnalyzerErrorCode.AstNodeLimitExceeded,
    );
  });
});
