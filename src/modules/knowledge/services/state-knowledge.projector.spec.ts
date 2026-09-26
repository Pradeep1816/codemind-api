import { AnalysisDerivationType } from '../../analysis/enums/analysis-derivation-type.enum';
import { AnalysisEvidenceRole } from '../../analysis/enums/analysis-evidence-role.enum';
import { AnalysisFactKind } from '../../analysis/enums/analysis-fact-kind.enum';
import type { AnalysisFact } from '../../analysis/types/analysis-fact.types';
import { KnowledgeEdgeKind } from '../enums/knowledge-edge-kind.enum';
import { KnowledgeNodeKind } from '../enums/knowledge-node-kind.enum';
import {
  StateKnowledgeProjectionError,
  StateKnowledgeProjector,
} from './state-knowledge.projector';

describe('StateKnowledgeProjector', () => {
  const componentIdentity = `architecture_component:${'a'.repeat(64)}`;
  const pendingIdentity = `state:${'b'.repeat(64)}`;
  const cancelledIdentity = `state:${'c'.repeat(64)}`;
  const transitionIdentity = `state_transition:${'d'.repeat(64)}`;

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
    derivationType = AnalysisDerivationType.Deterministic,
    confidence = 1,
  ): AnalysisFact {
    return {
      type: 'fact',
      kind,
      identityKey,
      contentFingerprint: 'e'.repeat(64),
      analyzerName: 'typescript-state',
      analyzerVersion: '1.0.0',
      derivationType,
      confidence,
      properties,
      evidence: factEvidence,
    };
  }

  function state(identityKey: string, name: string): AnalysisFact {
    return fact(
      AnalysisFactKind.State,
      identityKey,
      { name, stateSet: 'AppointmentStatus', source: 'enum_member' },
      [evidence(10, 30, AnalysisEvidenceRole.Declaration)],
    );
  }

  function architecture(): AnalysisFact {
    return fact(
      AnalysisFactKind.ArchitectureComponent,
      componentIdentity,
      { name: 'AppointmentService', componentType: 'service' },
      [evidence(0, 500, AnalysisEvidenceRole.Declaration)],
    );
  }

  function transition(fromIdentity: string | null): AnalysisFact {
    return fact(
      AnalysisFactKind.StateTransition,
      transitionIdentity,
      {
        subject: 'appointment',
        field: 'status',
        fromStateIdentityKey: fromIdentity,
        fromStateName: fromIdentity ? 'Pending' : null,
        toStateIdentityKey: cancelledIdentity,
        toStateName: 'Cancelled',
        containingSymbolId: 12,
        containingSymbolName: 'AppointmentService.cancel',
      },
      [
        evidence(100, 160, AnalysisEvidenceRole.Assignment),
        evidence(80, 99, AnalysisEvidenceRole.Condition),
      ],
    );
  }

  it('projects states, a transition, and proven graph relationships', () => {
    const result = new StateKnowledgeProjector().project([
      architecture(),
      state(pendingIdentity, 'Pending'),
      state(cancelledIdentity, 'Cancelled'),
      transition(pendingIdentity),
    ]);

    expect(result.nodes).toHaveLength(3);
    expect(
      result.nodes.filter((node) => node.kind === KnowledgeNodeKind.State),
    ).toHaveLength(2);
    expect(
      result.nodes.find(
        (node) => node.kind === KnowledgeNodeKind.StateTransition,
      ),
    ).toMatchObject({
      identityKey: transitionIdentity,
      name: 'Pending → Cancelled',
    });
    expect(result.edges.map((edge) => edge.kind)).toEqual(
      expect.arrayContaining([
        KnowledgeEdgeKind.TransitionsTo,
        KnowledgeEdgeKind.Enforces,
      ]),
    );
    const stateEdge = result.edges.find(
      (edge) => edge.kind === KnowledgeEdgeKind.TransitionsTo,
    );
    expect(stateEdge).toMatchObject({
      source: { kind: KnowledgeNodeKind.State, identityKey: pendingIdentity },
      target: {
        kind: KnowledgeNodeKind.State,
        identityKey: cancelledIdentity,
      },
    });
  });

  it('does not create a transitions-to edge when the source state is unknown', () => {
    const result = new StateKnowledgeProjector().project([
      state(cancelledIdentity, 'Cancelled'),
      transition(null),
    ]);

    expect(
      result.edges.some(
        (edge) => edge.kind === KnowledgeEdgeKind.TransitionsTo,
      ),
    ).toBe(false);
    expect(
      result.nodes.some(
        (node) => node.kind === KnowledgeNodeKind.StateTransition,
      ),
    ).toBe(true);
  });

  it('rejects transitions that reference an absent target state', () => {
    expect(() =>
      new StateKnowledgeProjector().project([transition(null)]),
    ).toThrow(StateKnowledgeProjectionError);
  });
});
