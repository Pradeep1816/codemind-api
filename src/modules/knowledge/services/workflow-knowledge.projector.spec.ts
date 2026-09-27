import { AnalysisDerivationType } from '../../analysis/enums/analysis-derivation-type.enum';
import { AnalysisEvidenceRole } from '../../analysis/enums/analysis-evidence-role.enum';
import { AnalysisFactKind } from '../../analysis/enums/analysis-fact-kind.enum';
import type { AnalysisFact } from '../../analysis/types/analysis-fact.types';
import { KnowledgeEdgeKind } from '../enums/knowledge-edge-kind.enum';
import { KnowledgeNodeKind } from '../enums/knowledge-node-kind.enum';
import {
  WorkflowKnowledgeProjectionError,
  WorkflowKnowledgeProjector,
} from './workflow-knowledge.projector';

describe('WorkflowKnowledgeProjector', () => {
  const controllerIdentity = `architecture_component:${'a'.repeat(64)}`;
  const serviceIdentity = `architecture_component:${'b'.repeat(64)}`;
  const workflowIdentity = `workflow:${'c'.repeat(64)}`;
  const entryStepIdentity = `workflow_step:${'d'.repeat(64)}`;
  const callStepIdentity = `workflow_step:${'e'.repeat(64)}`;

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
    factEvidence = evidence(0, 50, AnalysisEvidenceRole.Declaration),
  ): AnalysisFact {
    return {
      type: 'fact',
      kind,
      identityKey,
      contentFingerprint: 'f'.repeat(64),
      analyzerName: 'typescript-workflow',
      analyzerVersion: '1.0.0',
      derivationType: AnalysisDerivationType.Deterministic,
      confidence: 1,
      properties,
      evidence: [factEvidence],
    };
  }

  function component(identityKey: string, name: string): AnalysisFact {
    return fact(AnalysisFactKind.ArchitectureComponent, identityKey, {
      name,
      componentType: name.endsWith('Controller') ? 'controller' : 'service',
    });
  }

  function workflow(
    stepIdentityKeys = [entryStepIdentity, callStepIdentity],
    entryComponentIdentityKey: string | null = controllerIdentity,
  ): AnalysisFact {
    return fact(
      AnalysisFactKind.Workflow,
      workflowIdentity,
      {
        name: 'POST appointments → create',
        httpMethod: 'POST',
        routePath: 'appointments',
        handlerName: 'create',
        entryComponentIdentityKey,
        entrySymbolId: 12,
        stepIdentityKeys,
        unresolvedCallCount: 0,
        ambiguousCallCount: 0,
      },
      evidence(10, 25, AnalysisEvidenceRole.Decorator),
    );
  }

  function step(
    identityKey: string,
    order: number,
    name: string,
    stepType: string,
    componentIdentityKey: string | null,
  ): AnalysisFact {
    return fact(
      AnalysisFactKind.WorkflowStep,
      identityKey,
      {
        workflowIdentityKey: workflowIdentity,
        order,
        name,
        stepType,
        componentIdentityKey,
        targetSymbolId: order + 12,
      },
      evidence(30 + order * 20, 40 + order * 20, AnalysisEvidenceRole.CallSite),
    );
  }

  function fixture(): AnalysisFact[] {
    return [
      component(controllerIdentity, 'AppointmentController'),
      component(serviceIdentity, 'AppointmentService'),
      workflow(),
      step(entryStepIdentity, 0, 'create', 'entrypoint', controllerIdentity),
      step(
        callStepIdentity,
        1,
        'this.service.create',
        'resolved_call',
        serviceIdentity,
      ),
    ];
  }

  it('projects ordered workflow nodes and graph relationships', () => {
    const result = new WorkflowKnowledgeProjector().project(fixture());

    expect(result.nodes).toHaveLength(3);
    expect(result.nodes.map((node) => node.kind)).toEqual([
      KnowledgeNodeKind.Workflow,
      KnowledgeNodeKind.WorkflowStep,
      KnowledgeNodeKind.WorkflowStep,
    ]);
    expect(result.edges.map((edge) => edge.kind)).toEqual(
      expect.arrayContaining([
        KnowledgeEdgeKind.Contains,
        KnowledgeEdgeKind.Precedes,
        KnowledgeEdgeKind.Calls,
      ]),
    );
    expect(
      result.edges.filter((edge) => edge.kind === KnowledgeEdgeKind.Contains),
    ).toHaveLength(3);
    expect(
      result.edges.find((edge) => edge.kind === KnowledgeEdgeKind.Precedes),
    ).toMatchObject({
      source: {
        kind: KnowledgeNodeKind.WorkflowStep,
        identityKey: entryStepIdentity,
      },
      target: {
        kind: KnowledgeNodeKind.WorkflowStep,
        identityKey: callStepIdentity,
      },
    });
    expect(
      result.edges.find((edge) => edge.kind === KnowledgeEdgeKind.Calls),
    ).toMatchObject({
      source: {
        kind: KnowledgeNodeKind.WorkflowStep,
        identityKey: callStepIdentity,
      },
      target: {
        kind: KnowledgeNodeKind.ArchitecturalComponent,
        identityKey: serviceIdentity,
      },
    });
  });

  it('rejects missing or incorrectly ordered workflow steps', () => {
    expect(() =>
      new WorkflowKnowledgeProjector().project([
        workflow([callStepIdentity, entryStepIdentity]),
        step(entryStepIdentity, 0, 'create', 'entrypoint', null),
        step(callStepIdentity, 1, 'call', 'resolved_call', null),
      ]),
    ).toThrow(WorkflowKnowledgeProjectionError);
  });

  it('rejects architecture references absent from the analysis output', () => {
    expect(() =>
      new WorkflowKnowledgeProjector().project([
        workflow(undefined, controllerIdentity),
        step(entryStepIdentity, 0, 'create', 'entrypoint', null),
        step(callStepIdentity, 1, 'call', 'resolved_call', null),
      ]),
    ).toThrow('Workflow references an unknown architecture component');
  });
});
