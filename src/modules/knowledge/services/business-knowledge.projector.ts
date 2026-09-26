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

const PROJECTOR_NAME = 'business-knowledge-projector';
const PROJECTOR_VERSION = '1.0.0';

interface ArchitectureDescriptor {
  identityKey: string;
  derivationType: AnalysisDerivationType;
  confidence: number;
  evidence: AnalysisEvidence;
}

export interface BusinessKnowledgeProjection {
  nodes: readonly KnowledgeNodeInput[];
  edges: readonly KnowledgeEdgeInput[];
  diagnostics: readonly AnalysisDiagnostic[];
}

export class BusinessKnowledgeProjectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = BusinessKnowledgeProjectionError.name;
  }
}

@Injectable()
export class BusinessKnowledgeProjector {
  /** Projects domain and rule facts while retaining every declaration source. */
  project(outputs: readonly AnalysisOutput[]): BusinessKnowledgeProjection {
    const diagnostics = outputs.filter(
      (output): output is AnalysisDiagnostic => output.type === 'diagnostic',
    );
    const facts = outputs.filter(
      (output): output is AnalysisFact => output.type === 'fact',
    );
    const architecture = this.readArchitecture(facts);
    const conceptGroups = this.groupFacts(
      facts.filter((fact) => fact.kind === AnalysisFactKind.DomainConcept),
    );
    const ruleGroups = this.groupFacts(
      facts.filter((fact) => fact.kind === AnalysisFactKind.BusinessRule),
    );
    const nodes: KnowledgeNodeInput[] = [];
    const edges = new Map<string, KnowledgeEdgeInput>();

    for (const group of conceptGroups.values()) {
      const node = this.toConceptNode(group);
      nodes.push(node);

      for (const fact of group) {
        const component = this.findContainingComponent(
          fact.evidence[0],
          architecture,
        );

        if (component) {
          this.mergeEdge(
            edges,
            this.createEdge(
              component,
              node,
              KnowledgeEdgeKind.Represents,
              fact,
            ),
          );
        }
      }
    }

    for (const group of ruleGroups.values()) {
      if (group.length !== 1) {
        throw new BusinessKnowledgeProjectionError(
          'Business rule identity is not unique',
        );
      }

      const fact = group[0];

      if (!fact) {
        continue;
      }

      const node = this.toRuleNode(fact);
      nodes.push(node);
      const component = this.findContainingComponent(
        fact.evidence[0],
        architecture,
      );

      if (component) {
        this.mergeEdge(
          edges,
          this.createEdge(component, node, KnowledgeEdgeKind.Enforces, fact),
        );
      }
    }

    return { nodes, edges: [...edges.values()], diagnostics };
  }

  private readArchitecture(
    facts: readonly AnalysisFact[],
  ): readonly ArchitectureDescriptor[] {
    return facts
      .filter((fact) => fact.kind === AnalysisFactKind.ArchitectureComponent)
      .map((fact) => ({
        identityKey: fact.identityKey,
        derivationType: fact.derivationType,
        confidence: fact.confidence,
        evidence: fact.evidence[0],
      }));
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

  private toConceptNode(facts: readonly AnalysisFact[]): KnowledgeNodeInput {
    const first = facts[0];

    if (!first) {
      throw new BusinessKnowledgeProjectionError(
        'Domain concept group is empty',
      );
    }

    const name = this.requireString(first.properties.name, 'concept name');
    const normalizedName = this.requireString(
      first.properties.normalizedName,
      'normalized concept name',
    );

    for (const fact of facts.slice(1)) {
      if (
        fact.properties.name !== name ||
        fact.properties.normalizedName !== normalizedName
      ) {
        throw new BusinessKnowledgeProjectionError(
          'Domain concept identity has conflicting names',
        );
      }
    }

    const evidence = this.uniqueEvidence(
      facts.flatMap((fact) => fact.evidence),
    );
    const properties = {
      declarationKinds: this.uniqueStrings(
        facts.map((fact) => fact.properties.declarationKind),
      ),
      normalizedName,
      sources: this.uniqueStrings(facts.map((fact) => fact.properties.source)),
    };
    const confidence = Math.max(...facts.map((fact) => fact.confidence));
    const derivationType = facts.some(
      (fact) => fact.derivationType === AnalysisDerivationType.Deterministic,
    )
      ? KnowledgeDerivationType.Deterministic
      : this.mapDerivation(first.derivationType);

    return {
      kind: KnowledgeNodeKind.DomainConcept,
      identityKey: first.identityKey,
      name,
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
        kind: KnowledgeNodeKind.DomainConcept,
        properties,
      }),
      propertySchemaVersion: 1,
      properties,
      evidence: this.mapEvidenceTuple(evidence),
    };
  }

  private toRuleNode(fact: AnalysisFact): KnowledgeNodeInput {
    const ruleType = this.requireString(
      fact.properties.ruleType,
      'business rule type',
    );
    const containingSymbolName = this.optionalString(
      fact.properties.containingSymbolName,
    );

    return {
      kind: KnowledgeNodeKind.BusinessRule,
      identityKey: fact.identityKey,
      name: containingSymbolName
        ? `${ruleType} rule in ${containingSymbolName}`
        : `${ruleType} rule`,
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

  private createEdge(
    component: ArchitectureDescriptor,
    target: KnowledgeNodeInput,
    kind: KnowledgeEdgeKind,
    fact: AnalysisFact,
  ): KnowledgeEdgeInput {
    const identityKey = this.stableIdentity('knowledge_edge', [
      component.identityKey,
      target.identityKey,
      kind,
    ]);
    const evidence = this.mapEvidenceTuple(fact.evidence);
    const derivationType =
      component.derivationType === AnalysisDerivationType.Deterministic &&
      fact.derivationType === AnalysisDerivationType.Deterministic
        ? KnowledgeDerivationType.Deterministic
        : KnowledgeDerivationType.Heuristic;
    const properties = { sourceFactIdentityKey: fact.identityKey };
    const confidence = Math.min(component.confidence, fact.confidence);

    return {
      identityKey,
      kind,
      source: {
        kind: KnowledgeNodeKind.ArchitecturalComponent,
        identityKey: component.identityKey,
      },
      target: {
        kind: target.kind,
        identityKey: target.identityKey,
      },
      derivationType,
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

  private mergeEdge(
    edges: Map<string, KnowledgeEdgeInput>,
    edge: KnowledgeEdgeInput,
  ): void {
    const existing = edges.get(edge.identityKey);

    if (!existing) {
      edges.set(edge.identityKey, edge);
      return;
    }

    const evidence = this.uniqueKnowledgeEvidence([
      ...existing.evidence,
      ...edge.evidence,
    ]);
    const merged = {
      ...existing,
      confidence: Math.max(existing.confidence, edge.confidence),
      evidence,
    };

    edges.set(edge.identityKey, {
      ...merged,
      contentFingerprint: this.fingerprint({
        confidence: merged.confidence,
        derivationType: merged.derivationType,
        evidence: merged.evidence,
        identityKey: merged.identityKey,
        kind: merged.kind,
        properties: merged.properties,
      }),
    });
  }

  private uniqueStrings(
    values: readonly (AnalysisPropertyValue | undefined)[],
  ): readonly string[] {
    return [
      ...new Set(
        values.filter(
          (value): value is string =>
            typeof value === 'string' && value.trim().length > 0,
        ),
      ),
    ].sort();
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

  private uniqueKnowledgeEvidence(
    evidence: readonly KnowledgeEvidenceInput[],
  ): readonly [KnowledgeEvidenceInput, ...KnowledgeEvidenceInput[]] {
    const values = new Map<string, KnowledgeEvidenceInput>();

    for (const item of evidence) {
      values.set(JSON.stringify(item), item);
    }

    return [...values.values()] as [
      KnowledgeEvidenceInput,
      ...KnowledgeEvidenceInput[],
    ];
  }

  private mapEvidenceTuple(
    evidence: readonly [AnalysisEvidence, ...AnalysisEvidence[]],
  ): readonly [KnowledgeEvidenceInput, ...KnowledgeEvidenceInput[]] {
    return evidence.map((item) => this.mapEvidence(item)) as [
      KnowledgeEvidenceInput,
      ...KnowledgeEvidenceInput[],
    ];
  }

  private mapEvidence(input: AnalysisEvidence): KnowledgeEvidenceInput {
    return {
      indexedFileId: input.indexedFileId,
      fileHashId: input.fileHashId,
      codeSymbolId: input.codeSymbolId,
      role: this.mapEvidenceRole(input.role),
      range: input.range
        ? {
            startLine: input.range.start.line,
            startColumn: input.range.start.column,
            startOffset: input.range.start.offset,
            endLine: input.range.end.line,
            endColumn: input.range.end.column,
            endOffset: input.range.end.offset,
          }
        : null,
    };
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
      throw new BusinessKnowledgeProjectionError(
        `Business ${field} is invalid`,
      );
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
