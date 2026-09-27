import { CodeSymbolKind } from '../../../indexing/enums/code-symbol-kind.enum';
import { SourceLanguage } from '../../../indexing/enums/source-language.enum';
import { AnalysisFactFactory } from '../../analysis-fact.factory';
import { AnalysisFactKind } from '../../enums/analysis-fact-kind.enum';
import { EventResolutionStatus } from '../../enums/event-resolution-status.enum';
import type { AnalysisFileContext } from '../../types/analysis-context.types';
import type { AnalysisOutput } from '../../types/analysis-diagnostic.types';
import type { AnalysisFact } from '../../types/analysis-fact.types';
import {
  TypeScriptEventAnalyzerError,
  TypeScriptEventAnalyzerErrorCode,
} from './typescript-event-analyzer.errors';
import { TypeScriptEventAnalyzer } from './typescript-event.analyzer';

describe('TypeScriptEventAnalyzer', () => {
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
    return new TypeScriptEventAnalyzer(
      new AnalysisFactFactory({ maxPropertyBytes: 16_384 } as never),
      { maxAstNodesPerFile } as never,
    );
  }

  function createContext(content: string): AnalysisFileContext {
    const sizeBytes = Buffer.byteLength(content, 'utf8');

    return {
      snapshot,
      file: {
        id: 7,
        path: 'src/appointments/appointment.events.ts',
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
            name: 'AppointmentEvents',
            qualifiedName: 'AppointmentEvents',
            kind: CodeSymbolKind.Class,
            visibility: null,
            exported: true,
            defaultExport: false,
            signature: null,
            startLine: 1,
            startColumn: 1,
            startOffset: 0,
            endLine: 50,
            endColumn: 2,
            endOffset: content.length,
          },
        ],
        dependencies: [],
      },
      source: {
        indexedFileId: 7,
        fileHashId: 8,
        path: 'src/appointments/appointment.events.ts',
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

  it('merges explicit publications with matching handler contracts', () => {
    const outputs = collect(`
@EventsHandler(AppointmentCancelledEvent)
export class AppointmentCancelledHandler {
  handle(event) {}
}

export class AppointmentEvents {
  publish() {
    this.bus.publish(new AppointmentCancelledEvent());
    this.emitter.emit('appointment.cancelled', { id: 1 });
  }

  @OnEvent('appointment.cancelled')
  onCancelled(payload) {}
}
`);
    const events = facts(outputs, AnalysisFactKind.DomainEvent);
    const handlers = facts(outputs, AnalysisFactKind.EventHandler);

    expect(events).toHaveLength(2);
    expect(events.map((event) => event.properties.name)).toEqual(
      expect.arrayContaining([
        'AppointmentCancelledEvent',
        'appointment.cancelled',
      ]),
    );
    expect(
      events.every(
        (event) =>
          event.properties.resolution === EventResolutionStatus.Resolved &&
          Array.isArray(event.properties.occurrences) &&
          event.properties.occurrences.length === 2,
      ),
    ).toBe(true);
    expect(handlers).toHaveLength(2);
    expect(
      handlers.every(
        (handler) =>
          handler.properties.resolution === EventResolutionStatus.Resolved,
      ),
    ).toBe(true);
  });

  it('extracts each constructed event from publishAll', () => {
    const events = facts(
      collect(`
export class AppointmentEvents {
  publish() {
    this.bus.publishAll([
      new AppointmentBookedEvent(),
      new AppointmentConfirmedEvent(),
    ]);
  }
}
`),
      AnalysisFactKind.DomainEvent,
    );

    expect(events.map((event) => event.properties.name)).toEqual([
      'AppointmentBookedEvent',
      'AppointmentConfirmedEvent',
    ]);
  });

  it('preserves dynamic publication and handler references as unresolved', () => {
    const outputs = collect(`
export class AppointmentEvents {
  publish(eventName) {
    this.emitter.emit(eventName, {});
  }

  @OnEvent(APPOINTMENT_EVENT)
  handle(payload) {}
}
`);
    const events = facts(outputs, AnalysisFactKind.DomainEvent);
    const handler = facts(outputs, AnalysisFactKind.EventHandler)[0];
    const diagnostics = outputs.filter(
      (output) => output.type === 'diagnostic',
    );

    expect(events).toHaveLength(2);
    expect(
      events.every(
        (event) =>
          event.properties.resolution === EventResolutionStatus.Unresolved,
      ),
    ).toBe(true);
    expect(handler?.properties).toMatchObject({
      eventIdentityKey: null,
      resolution: EventResolutionStatus.Unresolved,
    });
    expect(diagnostics).toHaveLength(2);
  });

  it('enforces the shared bounded AST traversal limit', () => {
    let captured: TypeScriptEventAnalyzerError | null = null;

    try {
      collect('export class Events { publish() {} }', 3);
    } catch (error: unknown) {
      if (error instanceof TypeScriptEventAnalyzerError) {
        captured = error;
      } else {
        throw error;
      }
    }

    expect(captured?.code).toBe(
      TypeScriptEventAnalyzerErrorCode.AstNodeLimitExceeded,
    );
  });
});
