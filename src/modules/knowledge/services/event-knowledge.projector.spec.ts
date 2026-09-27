import { AnalysisDerivationType } from '../../analysis/enums/analysis-derivation-type.enum';
import { AnalysisEvidenceRole } from '../../analysis/enums/analysis-evidence-role.enum';
import { AnalysisFactKind } from '../../analysis/enums/analysis-fact-kind.enum';
import { EventResolutionStatus } from '../../analysis/enums/event-resolution-status.enum';
import type { AnalysisFact } from '../../analysis/types/analysis-fact.types';
import { KnowledgeEdgeKind } from '../enums/knowledge-edge-kind.enum';
import { KnowledgeNodeKind } from '../enums/knowledge-node-kind.enum';
import {
  EventKnowledgeProjectionError,
  EventKnowledgeProjector,
} from './event-knowledge.projector';

describe('EventKnowledgeProjector', () => {
  const componentIdentity = `architecture_component:${'a'.repeat(64)}`;
  const eventIdentity = `domain_event:${'b'.repeat(64)}`;
  const handlerIdentity = `event_handler:${'c'.repeat(64)}`;

  function evidence(
    startOffset: number,
    endOffset: number,
    role: AnalysisEvidenceRole,
  ) {
    return {
      indexedFileId: 10,
      fileHashId: 11,
      codeSymbolId: 12,
      role,
      range: {
        start: { line: 1, column: 1, offset: startOffset },
        end: { line: 20, column: 2, offset: endOffset },
      },
    } as const;
  }

  function fact(
    kind: AnalysisFactKind,
    identityKey: string,
    properties: AnalysisFact['properties'],
    factEvidence: AnalysisFact['evidence'],
    confidence = 1,
  ): AnalysisFact {
    return {
      type: 'fact',
      kind,
      identityKey,
      contentFingerprint: 'd'.repeat(64),
      analyzerName: 'typescript-event',
      analyzerVersion: '1.0.0',
      derivationType: AnalysisDerivationType.Deterministic,
      confidence,
      properties,
      evidence: factEvidence,
    };
  }

  function architecture(): AnalysisFact {
    return fact(
      AnalysisFactKind.ArchitectureComponent,
      componentIdentity,
      { name: 'AppointmentService', componentType: 'service' },
      [evidence(0, 500, AnalysisEvidenceRole.Declaration)],
    );
  }

  function event(): AnalysisFact {
    return fact(
      AnalysisFactKind.DomainEvent,
      eventIdentity,
      {
        eventKey: 'AppointmentCancelledEvent',
        name: 'AppointmentCancelledEvent',
        occurrences: ['handler_contract', 'publication'],
        operations: ['EventsHandler', 'this.bus.publish'],
        referenceKind: 'type',
        resolution: EventResolutionStatus.Resolved,
      },
      [
        evidence(100, 150, AnalysisEvidenceRole.CallSite),
        evidence(200, 230, AnalysisEvidenceRole.Decorator),
      ],
    );
  }

  function handler(targetEventIdentity: string | null): AnalysisFact {
    return fact(
      AnalysisFactKind.EventHandler,
      handlerIdentity,
      {
        name: 'AppointmentCancelledHandler',
        targetKind: 'class',
        eventIdentityKey: targetEventIdentity,
        eventKey: targetEventIdentity ? 'AppointmentCancelledEvent' : null,
        eventName: targetEventIdentity ? 'AppointmentCancelledEvent' : null,
        resolution: targetEventIdentity
          ? EventResolutionStatus.Resolved
          : EventResolutionStatus.Unresolved,
      },
      [evidence(200, 230, AnalysisEvidenceRole.Decorator)],
      targetEventIdentity ? 1 : 0.5,
    );
  }

  it('projects events, handlers, publication, and handling relationships', () => {
    const result = new EventKnowledgeProjector().project([
      architecture(),
      event(),
      handler(eventIdentity),
    ]);

    expect(result.nodes).toHaveLength(2);
    expect(result.nodes.map((node) => node.kind)).toEqual(
      expect.arrayContaining([
        KnowledgeNodeKind.DomainEvent,
        KnowledgeNodeKind.EventHandler,
      ]),
    );
    expect(result.edges.map((edge) => edge.kind)).toEqual(
      expect.arrayContaining([
        KnowledgeEdgeKind.Triggers,
        KnowledgeEdgeKind.Handles,
      ]),
    );
    expect(
      result.edges.find((edge) => edge.kind === KnowledgeEdgeKind.Triggers),
    ).toMatchObject({
      source: {
        kind: KnowledgeNodeKind.ArchitecturalComponent,
        identityKey: componentIdentity,
      },
      target: {
        kind: KnowledgeNodeKind.DomainEvent,
        identityKey: eventIdentity,
      },
    });
    expect(
      result.edges.find((edge) => edge.kind === KnowledgeEdgeKind.Handles),
    ).toMatchObject({
      source: {
        kind: KnowledgeNodeKind.EventHandler,
        identityKey: handlerIdentity,
      },
      target: {
        kind: KnowledgeNodeKind.DomainEvent,
        identityKey: eventIdentity,
      },
    });
  });

  it('preserves unresolved references without creating event nodes or edges', () => {
    const unresolved = fact(
      AnalysisFactKind.DomainEvent,
      `domain_event_reference:${'e'.repeat(64)}`,
      {
        eventKey: null,
        name: null,
        occurrences: ['publication'],
        operations: ['this.emitter.emit'],
        referenceKind: null,
        resolution: EventResolutionStatus.Unresolved,
      },
      [evidence(100, 150, AnalysisEvidenceRole.CallSite)],
      0,
    );
    const result = new EventKnowledgeProjector().project([
      unresolved,
      handler(null),
    ]);

    expect(result.unresolvedEventReferences).toEqual([unresolved]);
    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0]?.kind).toBe(KnowledgeNodeKind.EventHandler);
    expect(result.edges).toEqual([]);
  });

  it('rejects a resolved handler whose event is absent', () => {
    expect(() =>
      new EventKnowledgeProjector().project([handler(eventIdentity)]),
    ).toThrow(EventKnowledgeProjectionError);
  });
});
