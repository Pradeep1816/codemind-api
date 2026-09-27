import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { AnalysisDerivationType } from '../../analysis/enums/analysis-derivation-type.enum';
import { AnalysisEvidenceRole } from '../../analysis/enums/analysis-evidence-role.enum';
import { AnalysisFactKind } from '../../analysis/enums/analysis-fact-kind.enum';
import type {
  AnalysisDiagnostic,
  AnalysisOutput,
} from '../../analysis/types/analysis-diagnostic.types';
import type {
  AnalysisEvidence,
  AnalysisFact,
  AnalysisPropertyValue,
} from '../../analysis/types/analysis-fact.types';
import { KnowledgeDerivationType } from '../enums/knowledge-derivation-type.enum';
import { KnowledgeEdgeKind } from '../enums/knowledge-edge-kind.enum';
import { KnowledgeEvidenceRole } from '../enums/knowledge-evidence-role.enum';
import { KnowledgeNodeKind } from '../enums/knowledge-node-kind.enum';
import type {
  KnowledgeEdgeInput,
  KnowledgeEvidenceInput,
  KnowledgeNodeInput,
  KnowledgeNodeReference,
} from '../persistence/knowledge-persistence.types';

const PROJECTOR_NAME = 'workflow-knowledge-projector';
const PROJECTOR_VERSION = '1.0.0';

export interface WorkflowKnowledgeProjection {
  nodes: readonly KnowledgeNodeInput[];
  edges: readonly KnowledgeEdgeInput[];
  diagnostics: readonly AnalysisDiagnostic[];
}

export class WorkflowKnowledgeProjectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = WorkflowKnowledgeProjectionError.name;
  }
}

@Injectable()
export class WorkflowKnowledgeProjector {
  project(outputs: readonly AnalysisOutput[]): WorkflowKnowledgeProjection {
    const diagnostics = outputs.filter(
      (output): output is AnalysisDiagnostic => output.type === 'diagnostic',
    );
    const facts = outputs.filter(
      (output): output is AnalysisFact => output.type === 'fact',
    );
    const components = new Set(
      facts
        .filter((fact) => fact.kind === AnalysisFactKind.ArchitectureComponent)
        .map((fact) => fact.identityKey),
    );
    const workflows = facts.filter(
      (fact) => fact.kind === AnalysisFactKind.Workflow,
    );
    const stepsByWorkflow = this.groupSteps(
      facts.filter((fact) => fact.kind === AnalysisFactKind.WorkflowStep),
    );
    const nodes: KnowledgeNodeInput[] = [];
    const edges: KnowledgeEdgeInput[] = [];
    const identities = new Set<string>();

    for (const workflow of workflows) {
      if (identities.has(workflow.identityKey)) {
        throw new WorkflowKnowledgeProjectionError(
          'Workflow identity is not unique',
        );
      }

      identities.add(workflow.identityKey);
      const workflowNode = this.toNode(workflow, KnowledgeNodeKind.Workflow);
      nodes.push(workflowNode);
      const steps = [...(stepsByWorkflow.get(workflow.identityKey) ?? [])].sort(
        (left, right) =>
          this.requireNumber(left.properties.order, 'step order') -
          this.requireNumber(right.properties.order, 'step order'),
      );
      this.assertWorkflowSteps(workflow, steps);
      const stepNodes = steps.map((step) =>
        this.toNode(step, KnowledgeNodeKind.WorkflowStep),
      );
      nodes.push(...stepNodes);

      const entryComponent = this.optionalString(
        workflow.properties.entryComponentIdentityKey,
      );

      if (entryComponent) {
        this.assertComponent(entryComponent, components);
        edges.push(
          this.createEdge(
            KnowledgeEdgeKind.Contains,
            {
              kind: KnowledgeNodeKind.ArchitecturalComponent,
              identityKey: entryComponent,
            },
            {
              kind: KnowledgeNodeKind.Workflow,
              identityKey: workflow.identityKey,
            },
            workflow.evidence,
            workflow.identityKey,
          ),
        );
      }

      steps.forEach((step, index) => {
        edges.push(
          this.createEdge(
            KnowledgeEdgeKind.Contains,
            {
              kind: KnowledgeNodeKind.Workflow,
              identityKey: workflow.identityKey,
            },
            {
              kind: KnowledgeNodeKind.WorkflowStep,
              identityKey: step.identityKey,
            },
            step.evidence,
            step.identityKey,
          ),
        );

        const componentIdentity = this.optionalString(
          step.properties.componentIdentityKey,
        );

        if (step.properties.stepType === 'resolved_call' && componentIdentity) {
          this.assertComponent(componentIdentity, components);
          edges.push(
            this.createEdge(
              KnowledgeEdgeKind.Calls,
              {
                kind: KnowledgeNodeKind.WorkflowStep,
                identityKey: step.identityKey,
              },
              {
                kind: KnowledgeNodeKind.ArchitecturalComponent,
                identityKey: componentIdentity,
              },
              step.evidence,
              step.identityKey,
            ),
          );
        }

        const next = steps[index + 1];

        if (next) {
          edges.push(
            this.createEdge(
              KnowledgeEdgeKind.Precedes,
              {
                kind: KnowledgeNodeKind.WorkflowStep,
                identityKey: step.identityKey,
              },
              {
                kind: KnowledgeNodeKind.WorkflowStep,
                identityKey: next.identityKey,
              },
              this.uniqueEvidence([...step.evidence, ...next.evidence]),
              `${step.identityKey}:${next.identityKey}`,
            ),
          );
        }
      });
    }

    const orphanWorkflowIdentities = [...stepsByWorkflow.keys()].filter(
      (identity) => !identities.has(identity),
    );

    if (orphanWorkflowIdentities.length > 0) {
      throw new WorkflowKnowledgeProjectionError(
        'Workflow step references an unknown workflow',
      );
    }

    return { nodes, edges, diagnostics };
  }

  private toNode(
    fact: AnalysisFact,
    kind: KnowledgeNodeKind.Workflow | KnowledgeNodeKind.WorkflowStep,
  ): KnowledgeNodeInput {
    return {
      kind,
      identityKey: fact.identityKey,
      name: this.requireString(fact.properties.name, 'node name'),
      summary: null,
      derivationType: this.mapDerivation(fact.derivationType),
      confidence: fact.confidence,
      analyzerName: fact.analyzerName,
      analyzerVersion: fact.analyzerVersion,
      contentFingerprint: fact.contentFingerprint,
      propertySchemaVersion: 1,
      properties: { ...fact.properties },
      evidence: this.mapEvidenceTuple(fact.evidence),
    };
  }

  private assertWorkflowSteps(
    workflow: AnalysisFact,
    steps: readonly AnalysisFact[],
  ): void {
    const expected = this.readStringArray(workflow.properties.stepIdentityKeys);
    const actual = steps.map((step) => step.identityKey);

    if (
      expected.length === 0 ||
      expected.length !== actual.length ||
      expected.some((identity, index) => identity !== actual[index]) ||
      steps.some(
        (step, index) =>
          this.requireNumber(step.properties.order, 'step order') !== index,
      )
    ) {
      throw new WorkflowKnowledgeProjectionError(
        'Workflow step order or membership is invalid',
      );
    }
  }

  private groupSteps(
    steps: readonly AnalysisFact[],
  ): ReadonlyMap<string, readonly AnalysisFact[]> {
    const grouped = new Map<string, AnalysisFact[]>();

    for (const step of steps) {
      const workflowIdentity = this.requireString(
        step.properties.workflowIdentityKey,
        'step workflow identity',
      );
      const group = grouped.get(workflowIdentity) ?? [];
      group.push(step);
      grouped.set(workflowIdentity, group);
    }

    return grouped;
  }

  private createEdge(
    kind: KnowledgeEdgeKind,
    source: KnowledgeNodeReference,
    target: KnowledgeNodeReference,
    evidenceInput: readonly [AnalysisEvidence, ...AnalysisEvidence[]],
    sourceFactIdentityKey: string,
  ): KnowledgeEdgeInput {
    const identityKey = this.stableIdentity('knowledge_edge', [
      source.identityKey,
      target.identityKey,
      kind,
    ]);
    const evidence = this.mapEvidenceTuple(evidenceInput);
    const properties = { sourceFactIdentityKey };

    return {
      identityKey,
      kind,
      source,
      target,
      derivationType: KnowledgeDerivationType.Deterministic,
      confidence: 1,
      analyzerName: PROJECTOR_NAME,
      analyzerVersion: PROJECTOR_VERSION,
      contentFingerprint: this.fingerprint({
        evidence,
        identityKey,
        kind,
        properties,
        source,
        target,
      }),
      propertySchemaVersion: 1,
      properties,
      evidence,
    };
  }

  private assertComponent(
    identityKey: string,
    components: ReadonlySet<string>,
  ): void {
    if (!components.has(identityKey)) {
      throw new WorkflowKnowledgeProjectionError(
        'Workflow references an unknown architecture component',
      );
    }
  }

  private uniqueEvidence(
    evidence: readonly AnalysisEvidence[],
  ): readonly [AnalysisEvidence, ...AnalysisEvidence[]] {
    const values = new Map<string, AnalysisEvidence>();

    for (const item of evidence) {
      values.set(JSON.stringify(item), item);
    }

    return [...values.values()] as [AnalysisEvidence, ...AnalysisEvidence[]];
  }

  private mapEvidenceTuple(
    evidence: readonly [AnalysisEvidence, ...AnalysisEvidence[]],
  ): readonly [KnowledgeEvidenceInput, ...KnowledgeEvidenceInput[]] {
    return evidence.map((item) => ({
      indexedFileId: item.indexedFileId,
      fileHashId: item.fileHashId,
      codeSymbolId: item.codeSymbolId,
      role: this.mapEvidenceRole(item.role),
      range: item.range
        ? {
            startLine: item.range.start.line,
            startColumn: item.range.start.column,
            startOffset: item.range.start.offset,
            endLine: item.range.end.line,
            endColumn: item.range.end.column,
            endOffset: item.range.end.offset,
          }
        : null,
    })) as [KnowledgeEvidenceInput, ...KnowledgeEvidenceInput[]];
  }

  private mapDerivation(
    derivation: AnalysisDerivationType,
  ): KnowledgeDerivationType {
    switch (derivation) {
      case AnalysisDerivationType.Deterministic:
        return KnowledgeDerivationType.Deterministic;
      case AnalysisDerivationType.Heuristic:
        return KnowledgeDerivationType.Heuristic;
      case AnalysisDerivationType.AiAssisted:
        return KnowledgeDerivationType.AiAssisted;
      case AnalysisDerivationType.HumanConfirmed:
        return KnowledgeDerivationType.HumanConfirmed;
    }
  }

  private mapEvidenceRole(role: AnalysisEvidenceRole): KnowledgeEvidenceRole {
    switch (role) {
      case AnalysisEvidenceRole.Declaration:
        return KnowledgeEvidenceRole.Declaration;
      case AnalysisEvidenceRole.CallSite:
        return KnowledgeEvidenceRole.CallSite;
      case AnalysisEvidenceRole.Decorator:
        return KnowledgeEvidenceRole.Decorator;
      case AnalysisEvidenceRole.Injection:
        return KnowledgeEvidenceRole.Injection;
      case AnalysisEvidenceRole.Condition:
        return KnowledgeEvidenceRole.Condition;
      case AnalysisEvidenceRole.Assignment:
        return KnowledgeEvidenceRole.Assignment;
      case AnalysisEvidenceRole.Configuration:
        return KnowledgeEvidenceRole.Configuration;
    }
  }

  private readStringArray(
    value: AnalysisPropertyValue | undefined,
  ): readonly string[] {
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === 'string')
      : [];
  }

  private requireString(
    value: AnalysisPropertyValue | undefined,
    field: string,
  ): string {
    if (typeof value !== 'string' || value.trim().length === 0) {
      throw new WorkflowKnowledgeProjectionError(
        `Workflow ${field} is invalid`,
      );
    }

    return value;
  }

  private optionalString(
    value: AnalysisPropertyValue | undefined,
  ): string | null {
    return typeof value === 'string' && value.trim().length > 0 ? value : null;
  }

  private requireNumber(
    value: AnalysisPropertyValue | undefined,
    field: string,
  ): number {
    if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
      throw new WorkflowKnowledgeProjectionError(
        `Workflow ${field} is invalid`,
      );
    }

    return value;
  }

  private stableIdentity(prefix: string, parts: readonly string[]): string {
    return `${prefix}:${createHash('sha256')
      .update(JSON.stringify(parts))
      .digest('hex')}`;
  }

  private fingerprint(value: unknown): string {
    return createHash('sha256').update(JSON.stringify(value)).digest('hex');
  }
}
