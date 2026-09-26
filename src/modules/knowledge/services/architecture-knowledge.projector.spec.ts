import { AnalysisDerivationType } from '../../analysis/enums/analysis-derivation-type.enum';
import { AnalysisDiagnosticSeverity } from '../../analysis/enums/analysis-diagnostic-severity.enum';
import { AnalysisEvidenceRole } from '../../analysis/enums/analysis-evidence-role.enum';
import { AnalysisFactKind } from '../../analysis/enums/analysis-fact-kind.enum';
import { ArchitectureRelationType } from '../../analysis/enums/architecture-relation-type.enum';
import { CallResolutionStatus } from '../../analysis/enums/call-resolution-status.enum';
import { AnalysisOutput } from '../../analysis/types/analysis-diagnostic.types';
import { AnalysisFact } from '../../analysis/types/analysis-fact.types';
import { KnowledgeEdgeKind } from '../enums/knowledge-edge-kind.enum';
import { KnowledgeNodeKind } from '../enums/knowledge-node-kind.enum';
import {
  ArchitectureKnowledgeProjectionError,
  ArchitectureKnowledgeProjector,
} from './architecture-knowledge.projector';

describe('ArchitectureKnowledgeProjector', () => {
  const sourceIdentityKey = `architecture_component:${'a'.repeat(64)}`;
  const targetIdentityKey = `architecture_component:${'b'.repeat(64)}`;
  const evidence = {
    indexedFileId: 10,
    fileHashId: 11,
    codeSymbolId: 12,
    role: AnalysisEvidenceRole.Declaration,
    range: {
      start: { line: 1, column: 1, offset: 0 },
      end: { line: 5, column: 2, offset: 80 },
    },
  } as const;

  function fact(
    kind: AnalysisFactKind,
    identityKey: string,
    properties: AnalysisFact['properties'],
    contentFingerprint = 'c'.repeat(64),
  ): AnalysisFact {
    return {
      type: 'fact',
      kind,
      identityKey,
      contentFingerprint,
      analyzerName: 'typescript-architecture',
      analyzerVersion: '1.0.0',
      derivationType: AnalysisDerivationType.Deterministic,
      confidence: 1,
      properties,
      evidence: [evidence],
    };
  }

  function component(
    identityKey: string,
    name: string,
    type: string,
  ): AnalysisFact {
    return fact(AnalysisFactKind.ArchitectureComponent, identityKey, {
      name,
      componentType: type,
      symbolId: name === 'DoctorController' ? 1 : 2,
      path: `src/${name}.ts`,
      qualifiedName: name,
      classificationSignals: [`name_suffix:${type}`],
    });
  }

  function relationship(
    source = sourceIdentityKey,
    target = targetIdentityKey,
  ): AnalysisFact {
    return fact(
      AnalysisFactKind.ArchitectureRelationship,
      `architecture_relationship:${'d'.repeat(64)}`,
      {
        relation: ArchitectureRelationType.Calls,
        sourceIdentityKey: source,
        sourceSymbolId: 1,
        targetIdentityKey: target,
        targetSymbolId: 2,
      },
    );
  }

  it('maps component and relationship facts into one persistence batch', () => {
    const callResolution = fact(
      AnalysisFactKind.CallResolution,
      `call_resolution:${'e'.repeat(64)}`,
      {
        resolution: CallResolutionStatus.Resolved,
        targetSymbolId: 2,
      },
    );
    const diagnostic: AnalysisOutput = {
      type: 'diagnostic',
      analyzerName: 'typescript-architecture',
      analyzerVersion: '1.0.0',
      code: 'unresolved_module_reference',
      severity: AnalysisDiagnosticSeverity.Warning,
      message: 'A module reference was unresolved',
      retryable: false,
      evidence,
    };
    const projector = new ArchitectureKnowledgeProjector();
    const result = projector.project([
      component(sourceIdentityKey, 'DoctorController', 'controller'),
      component(targetIdentityKey, 'DoctorService', 'service'),
      relationship(),
      callResolution,
      diagnostic,
    ]);

    expect(result.nodes).toHaveLength(2);
    expect(result.nodes[0]).toMatchObject({
      kind: KnowledgeNodeKind.ArchitecturalComponent,
      identityKey: sourceIdentityKey,
      name: 'DoctorController',
      propertySchemaVersion: 1,
    });
    expect(result.edges).toHaveLength(1);
    expect(result.edges[0]).toMatchObject({
      kind: KnowledgeEdgeKind.Calls,
      source: {
        kind: KnowledgeNodeKind.ArchitecturalComponent,
        identityKey: sourceIdentityKey,
      },
      target: {
        kind: KnowledgeNodeKind.ArchitecturalComponent,
        identityKey: targetIdentityKey,
      },
    });
    expect(result.edges[0]?.evidence[0]).toEqual({
      indexedFileId: 10,
      fileHashId: 11,
      codeSymbolId: 12,
      role: 'declaration',
      range: {
        startLine: 1,
        startColumn: 1,
        startOffset: 0,
        endLine: 5,
        endColumn: 2,
        endOffset: 80,
      },
    });
    expect(result.callResolutions).toEqual([callResolution]);
    expect(result.diagnostics).toEqual([diagnostic]);
  });

  it('rejects relationships whose components are absent', () => {
    const projector = new ArchitectureKnowledgeProjector();

    expect(() =>
      projector.project([
        component(sourceIdentityKey, 'DoctorController', 'controller'),
        relationship(sourceIdentityKey, 'missing-component'),
      ]),
    ).toThrow(ArchitectureKnowledgeProjectionError);
  });

  it('rejects conflicting duplicate component identities', () => {
    const projector = new ArchitectureKnowledgeProjector();

    expect(() =>
      projector.project([
        component(sourceIdentityKey, 'DoctorController', 'controller'),
        fact(
          AnalysisFactKind.ArchitectureComponent,
          sourceIdentityKey,
          { name: 'DifferentController', componentType: 'controller' },
          'f'.repeat(64),
        ),
      ]),
    ).toThrow('Architecture component identity has conflicting content');
  });
});
