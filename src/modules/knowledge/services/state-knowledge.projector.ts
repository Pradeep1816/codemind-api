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
} from '../persistence/knowledge-persistence.types';

const PROJECTOR_NAME = 'state-knowledge-projector';
const PROJECTOR_VERSION = '1.0.0';

interface ArchitectureDescriptor {
  identityKey: string;
  confidence: number;
  derivationType: AnalysisDerivationType;
  evidence: AnalysisEvidence;
}

export interface StateKnowledgeProjection {
  nodes: readonly KnowledgeNodeInput[];
  edges: readonly KnowledgeEdgeInput[];
  diagnostics: readonly AnalysisDiagnostic[];
}

export class StateKnowledgeProjectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = StateKnowledgeProjectionError.name;
  }
}

@Injectable()
export class StateKnowledgeProjector {
  project(outputs: readonly AnalysisOutput[]): StateKnowledgeProjection {
    const diagnostics = outputs.filter(
      (output): output is AnalysisDiagnostic => output.type === 'diagnostic',
    );
    const facts = outputs.filter(
      (output): output is AnalysisFact => output.type === 'fact',
    );
    const architecture = this.readArchitecture(facts);
    const stateGroups = this.groupFacts(
      facts.filter((fact) => fact.kind === AnalysisFactKind.State),
    );
    const transitionFacts = facts.filter(
      (fact) => fact.kind === AnalysisFactKind.StateTransition,
    );
    const stateNodes = new Map<string, KnowledgeNodeInput>();
    const transitionNodes = new Map<string, KnowledgeNodeInput>();
    const edges = new Map<string, KnowledgeEdgeInput>();

    for (const group of stateGroups.values()) {
      const node = this.toStateNode(group);
      stateNodes.set(node.identityKey, node);
    }

    for (const fact of transitionFacts) {
      if (transitionNodes.has(fact.identityKey)) {
        throw new StateKnowledgeProjectionError(
          'State transition identity is not unique',
        );
      }

      const node = this.toTransitionNode(fact);
      transitionNodes.set(node.identityKey, node);
      const fromIdentity = this.optionalString(
        fact.properties.fromStateIdentityKey,
      );
      const toIdentity = this.requireString(
        fact.properties.toStateIdentityKey,
        'transition target state',
      );

      if (!stateNodes.has(toIdentity)) {
        throw new StateKnowledgeProjectionError(
          'State transition references an unknown target state',
        );
      }

      if (fromIdentity) {
        if (!stateNodes.has(fromIdentity)) {
          throw new StateKnowledgeProjectionError(
            'State transition references an unknown source state',
          );
        }

        const edge = this.createEdge(
          KnowledgeEdgeKind.TransitionsTo,
          { kind: KnowledgeNodeKind.State, identityKey: fromIdentity },
          { kind: KnowledgeNodeKind.State, identityKey: toIdentity },
          fact,
          fact.derivationType,
          fact.confidence,
        );
        edges.set(edge.identityKey, edge);
      }

      const component = this.findContainingComponent(
        fact.evidence[0],
        architecture,
      );

      if (component) {
        const derivationType =
          component.derivationType === AnalysisDerivationType.Deterministic &&
          fact.derivationType === AnalysisDerivationType.Deterministic
            ? AnalysisDerivationType.Deterministic
            : AnalysisDerivationType.Heuristic;
        const edge = this.createEdge(
          KnowledgeEdgeKind.Enforces,
          {
            kind: KnowledgeNodeKind.ArchitecturalComponent,
            identityKey: component.identityKey,
          },
          {
            kind: KnowledgeNodeKind.StateTransition,
            identityKey: node.identityKey,
          },
          fact,
          derivationType,
          Math.min(component.confidence, fact.confidence),
        );
        edges.set(edge.identityKey, edge);
      }
    }

    return {
      nodes: [...stateNodes.values(), ...transitionNodes.values()],
      edges: [...edges.values()],
      diagnostics,
    };
  }

  private toStateNode(facts: readonly AnalysisFact[]): KnowledgeNodeInput {
    const first = facts[0];

    if (!first) {
      throw new StateKnowledgeProjectionError('State fact group is empty');
    }

    const name = this.requireString(first.properties.name, 'state name');
    const stateSet = this.requireString(first.properties.stateSet, 'state set');

    for (const fact of facts.slice(1)) {
      if (
        fact.properties.name !== name ||
        fact.properties.stateSet !== stateSet
      ) {
        throw new StateKnowledgeProjectionError(
          'State identity has conflicting content',
        );
      }
    }

    const evidence = this.uniqueEvidence(
      facts.flatMap((fact) => fact.evidence),
    );
    const sources = [
      ...new Set(
        facts
          .map((fact) => fact.properties.source)
          .filter((value): value is string => typeof value === 'string'),
      ),
    ].sort();
    const confidence = Math.max(...facts.map((fact) => fact.confidence));
    const derivationType = facts.some(
      (fact) => fact.derivationType === AnalysisDerivationType.Deterministic,
    )
      ? KnowledgeDerivationType.Deterministic
      : KnowledgeDerivationType.Heuristic;
    const properties = { sources, stateSet };

    return {
      kind: KnowledgeNodeKind.State,
      identityKey: first.identityKey,
      name: `${stateSet}.${name}`,
      summary: null,
      derivationType,
      confidence,
      analyzerName: first.analyzerName,
      analyzerVersion: first.analyzerVersion,
      contentFingerprint: this.fingerprint({
        confidence,
        derivationType,
        evidence,
        identityKey: first.identityKey,
        properties,
      }),
      propertySchemaVersion: 1,
      properties,
      evidence: this.mapEvidenceTuple(evidence),
    };
  }

  private toTransitionNode(fact: AnalysisFact): KnowledgeNodeInput {
    const fromName = this.optionalString(fact.properties.fromStateName);
    const toName = this.requireString(
      fact.properties.toStateName,
      'transition target name',
    );

    return {
      kind: KnowledgeNodeKind.StateTransition,
      identityKey: fact.identityKey,
      name: fromName ? `${fromName} → ${toName}` : `→ ${toName}`,
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

  private createEdge(
    kind: KnowledgeEdgeKind,
    source: KnowledgeEdgeInput['source'],
    target: KnowledgeEdgeInput['target'],
    fact: AnalysisFact,
    derivationType: AnalysisDerivationType,
    confidence: number,
  ): KnowledgeEdgeInput {
    const identityKey = this.stableIdentity('knowledge_edge', [
      source.identityKey,
      target.identityKey,
      kind,
    ]);
    const evidence = this.mapEvidenceTuple(fact.evidence);
    const properties = { sourceFactIdentityKey: fact.identityKey };

    return {
      identityKey,
      kind,
      source,
      target,
      derivationType: this.mapDerivation(derivationType),
      confidence,
      analyzerName: PROJECTOR_NAME,
      analyzerVersion: PROJECTOR_VERSION,
      contentFingerprint: this.fingerprint({
        confidence,
        derivationType,
        evidence,
        identityKey,
        kind,
        properties,
      }),
      propertySchemaVersion: 1,
      properties,
      evidence,
    };
  }

  private readArchitecture(
    facts: readonly AnalysisFact[],
  ): readonly ArchitectureDescriptor[] {
    return facts
      .filter((fact) => fact.kind === AnalysisFactKind.ArchitectureComponent)
      .map((fact) => ({
        identityKey: fact.identityKey,
        confidence: fact.confidence,
        derivationType: fact.derivationType,
        evidence: fact.evidence[0],
      }));
  }

  private findContainingComponent(
    evidence: AnalysisEvidence,
    architecture: readonly ArchitectureDescriptor[],
  ): ArchitectureDescriptor | null {
    if (!evidence.range) {
      return null;
    }

    return (
      architecture
        .filter(
          (component) =>
            component.evidence.indexedFileId === evidence.indexedFileId &&
            component.evidence.range !== null &&
            component.evidence.range.start.offset <=
              evidence.range!.start.offset &&
            component.evidence.range.end.offset >= evidence.range!.end.offset,
        )
        .sort((left, right) => {
          const leftRange = left.evidence.range!;
          const rightRange = right.evidence.range!;
          return (
            leftRange.end.offset -
              leftRange.start.offset -
              (rightRange.end.offset - rightRange.start.offset) ||
            left.identityKey.localeCompare(right.identityKey)
          );
        })[0] ?? null
    );
  }

  private groupFacts(
    facts: readonly AnalysisFact[],
  ): ReadonlyMap<string, readonly AnalysisFact[]> {
    const groups = new Map<string, AnalysisFact[]>();

    for (const fact of facts) {
      const group = groups.get(fact.identityKey) ?? [];
      group.push(fact);
      groups.set(fact.identityKey, group);
    }

    return groups;
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

  private requireString(
    value: AnalysisPropertyValue | undefined,
    field: string,
  ): string {
    if (typeof value !== 'string' || value.trim().length === 0) {
      throw new StateKnowledgeProjectionError(`State ${field} is invalid`);
    }

    return value;
  }

  private optionalString(
    value: AnalysisPropertyValue | undefined,
  ): string | null {
    return typeof value === 'string' && value.trim().length > 0 ? value : null;
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
