import { AnalysisDerivationType } from '../../analysis/enums/analysis-derivation-type.enum';
import { AnalysisEvidenceRole } from '../../analysis/enums/analysis-evidence-role.enum';
import { AnalysisFactKind } from '../../analysis/enums/analysis-fact-kind.enum';
import type { AnalysisFact } from '../../analysis/types/analysis-fact.types';
import { KnowledgeEdgeKind } from '../enums/knowledge-edge-kind.enum';
import { KnowledgeNodeKind } from '../enums/knowledge-node-kind.enum';
import {
  BusinessKnowledgeProjectionError,
  BusinessKnowledgeProjector,
} from './business-knowledge.projector';

describe('BusinessKnowledgeProjector', () => {
  const componentIdentity = `architecture_component:${'a'.repeat(64)}`;
  const conceptIdentity = `domain_concept:${'b'.repeat(64)}`;
  const ruleIdentity = `business_rule:${'c'.repeat(64)}`;

  function evidence(
    startOffset: number,
    endOffset: number,
    codeSymbolId: number,
    role = AnalysisEvidenceRole.Declaration,
  ) {
    return {
      indexedFileId: 10,
      fileHashId: 11,
      codeSymbolId,
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
    factEvidence = evidence(0, 200, 12),
    derivationType = AnalysisDerivationType.Deterministic,
    confidence = 1,
  ): AnalysisFact {
    return {
      type: 'fact',
      kind,
      identityKey,
      contentFingerprint: 'd'.repeat(64),
      analyzerName: 'typescript-business',
      analyzerVersion: '1.0.0',
      derivationType,
      confidence,
      properties,
      evidence: [factEvidence],
    };
  }

  function architecture(): AnalysisFact {
    return fact(
      AnalysisFactKind.ArchitectureComponent,
      componentIdentity,
      {
        name: 'AppointmentService',
        componentType: 'service',
        indexedFileId: 10,
        symbolId: 12,
      },
      evidence(0, 500, 12),
    );
  }

  function concept(
    factEvidence = evidence(20, 80, 13),
    source = 'entity_decorator',
    confidence = 1,
  ): AnalysisFact {
    return fact(
      AnalysisFactKind.DomainConcept,
      conceptIdentity,
      {
        name: 'Appointment',
        normalizedName: 'appointment',
        declarationKind: 'class',
        source,
      },
      factEvidence,
      confidence === 1
        ? AnalysisDerivationType.Deterministic
        : AnalysisDerivationType.Heuristic,
      confidence,
    );
  }

  function rule(): AnalysisFact {
    return fact(
      AnalysisFactKind.BusinessRule,
      ruleIdentity,
      {
        ruleType: 'scheduling',
        containingSymbolId: 14,
        containingSymbolName: 'AppointmentService.book',
        condition: {
          kind: 'prefix_unary_expression',
          identifiers: ['available', 'slot'],
          operation: '!',
          target: 'slot.available',
        },
        outcome: {
          kind: 'throw',
          identifiers: ['SlotUnavailableException'],
          operation: null,
          target: null,
        },
        sourcePath: 'src/appointments/appointment.service.ts',
        subjectConceptIdentityKeys: [conceptIdentity],
        subjectConceptNames: ['Appointment'],
      },
      evidence(120, 180, 14, AnalysisEvidenceRole.Condition),
      AnalysisDerivationType.Deterministic,
      0.95,
    );
  }

  it('projects merged concepts, rules, and component relationships', () => {
    const projector = new BusinessKnowledgeProjector();
    const result = projector.project([
      architecture(),
      concept(),
      concept(evidence(220, 280, 15), 'domain_type', 0.8),
      rule(),
    ]);

    expect(result.nodes).toHaveLength(2);
    const conceptNode = result.nodes.find(
      (node) => node.kind === KnowledgeNodeKind.DomainConcept,
    );
    const ruleNode = result.nodes.find(
      (node) => node.kind === KnowledgeNodeKind.BusinessRule,
    );

    expect(conceptNode).toMatchObject({
      kind: KnowledgeNodeKind.DomainConcept,
      identityKey: conceptIdentity,
      name: 'Appointment',
      confidence: 1,
      properties: {
        declarationKinds: ['class'],
        normalizedName: 'appointment',
        sources: ['domain_type', 'entity_decorator'],
      },
    });
    expect(
      new Set(conceptNode?.evidence.map((item) => item.codeSymbolId)),
    ).toEqual(new Set([13, 15]));
    expect(ruleNode).toMatchObject({
      kind: KnowledgeNodeKind.BusinessRule,
      name: 'Reject with SlotUnavailableException when not slot.available in AppointmentService.book',
      summary:
        'When not slot.available, the code rejects execution with SlotUnavailableException in AppointmentService.book.',
    });
    expect(result.edges.map((edge) => edge.kind)).toEqual(
      expect.arrayContaining([
        KnowledgeEdgeKind.Represents,
        KnowledgeEdgeKind.Enforces,
      ]),
    );
    expect(
      result.edges.every(
        (edge) => edge.source.identityKey === componentIdentity,
      ),
    ).toBe(true);
  });

  it('rejects conflicting concept names for one stable identity', () => {
    const projector = new BusinessKnowledgeProjector();

    expect(() =>
      projector.project([
        concept(),
        fact(AnalysisFactKind.DomainConcept, conceptIdentity, {
          name: 'Different Concept',
          normalizedName: 'different concept',
          declarationKind: 'class',
          source: 'domain_type',
        }),
      ]),
    ).toThrow(BusinessKnowledgeProjectionError);
  });

  it('merges duplicate business-rule identities and their evidence', () => {
    const projector = new BusinessKnowledgeProjector();
    const duplicate = rule();
    duplicate.identityKey = `business_rule:${'e'.repeat(64)}`;
    duplicate.evidence = [
      evidence(181, 220, 14, AnalysisEvidenceRole.Condition),
    ];
    const result = projector.project([rule(), duplicate]);
    const ruleNode = result.nodes.find(
      (node) => node.kind === KnowledgeNodeKind.BusinessRule,
    );

    expect(result.nodes).toHaveLength(2);
    expect(ruleNode?.evidence).toHaveLength(2);
    expect(ruleNode?.identityKey).not.toBe(ruleIdentity);
    expect(result.edges).toHaveLength(1);
    expect(result.edges[0]?.evidence).toHaveLength(2);
  });

  it('anchors an unclassified rule to its containing source context', () => {
    const projector = new BusinessKnowledgeProjector();
    const result = projector.project([rule()]);
    const component = result.nodes.find(
      (node) => node.kind === KnowledgeNodeKind.ArchitecturalComponent,
    );
    const ruleNode = result.nodes.find(
      (node) => node.kind === KnowledgeNodeKind.BusinessRule,
    );

    expect(component).toMatchObject({
      name: 'AppointmentService.book',
      derivationType: 'heuristic',
      properties: {
        componentType: 'code_symbol',
        path: 'src/appointments/appointment.service.ts',
        qualifiedName: 'AppointmentService.book',
      },
    });
    expect(result.edges).toEqual([
      expect.objectContaining({
        kind: KnowledgeEdgeKind.Enforces,
        source: {
          kind: KnowledgeNodeKind.ArchitecturalComponent,
          identityKey: component?.identityKey,
        },
        target: {
          kind: KnowledgeNodeKind.BusinessRule,
          identityKey: ruleNode?.identityKey,
        },
      }),
    ]);
  });
});
