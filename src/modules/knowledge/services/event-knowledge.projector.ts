import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { AnalysisDerivationType } from '../../analysis/enums/analysis-derivation-type.enum';
import { AnalysisEvidenceRole } from '../../analysis/enums/analysis-evidence-role.enum';
import { AnalysisFactKind } from '../../analysis/enums/analysis-fact-kind.enum';
import { EventResolutionStatus } from '../../analysis/enums/event-resolution-status.enum';
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

const PROJECTOR_NAME = 'event-knowledge-projector';
const PROJECTOR_VERSION = '1.0.0';

interface ArchitectureDescriptor {
  identityKey: string;
  confidence: number;
  derivationType: AnalysisDerivationType;
  evidence: AnalysisEvidence;
}

export interface EventKnowledgeProjection {
  nodes: readonly KnowledgeNodeInput[];
  edges: readonly KnowledgeEdgeInput[];
  unresolvedEventReferences: readonly AnalysisFact[];
  diagnostics: readonly AnalysisDiagnostic[];
}

export class EventKnowledgeProjectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = EventKnowledgeProjectionError.name;
  }
}

@Injectable()
export class EventKnowledgeProjector {
  project(outputs: readonly AnalysisOutput[]): EventKnowledgeProjection {
    const diagnostics = outputs.filter(
      (output): output is AnalysisDiagnostic => output.type === 'diagnostic',
    );
    const facts = outputs.filter(
      (output): output is AnalysisFact => output.type === 'fact',
    );
    const unresolvedEventReferences = facts.filter(
      (fact) =>
        fact.kind === AnalysisFactKind.DomainEvent &&
        fact.properties.resolution === EventResolutionStatus.Unresolved,
    );
    const eventGroups = this.groupFacts(
      facts.filter(
        (fact) =>
          fact.kind === AnalysisFactKind.DomainEvent &&
          fact.properties.resolution === EventResolutionStatus.Resolved,
      ),
    );
    const handlerFacts = facts.filter(
      (fact) => fact.kind === AnalysisFactKind.EventHandler,
    );
    const architecture = this.readArchitecture(facts);
    const eventNodes = new Map<string, KnowledgeNodeInput>();
    const handlerNodes = new Map<string, KnowledgeNodeInput>();
    const edges = new Map<string, KnowledgeEdgeInput>();

    for (const group of eventGroups.values()) {
      const node = this.toEventNode(group);
      eventNodes.set(node.identityKey, node);

      for (const fact of group) {
        for (const evidence of fact.evidence.filter(
          (item) => item.role === AnalysisEvidenceRole.CallSite,
        )) {
          const component = this.findContainingComponent(
            evidence,
            architecture,
          );

          if (!component) {
            continue;
          }

          this.mergeEdge(
            edges,
            this.createEdge(
              KnowledgeEdgeKind.Triggers,
              {
                kind: KnowledgeNodeKind.ArchitecturalComponent,
                identityKey: component.identityKey,
              },
              {
                kind: KnowledgeNodeKind.DomainEvent,
                identityKey: node.identityKey,
              },
              [evidence],
              fact.identityKey,
              component.derivationType === AnalysisDerivationType.Deterministic
                ? AnalysisDerivationType.Deterministic
                : AnalysisDerivationType.Heuristic,
              Math.min(component.confidence, fact.confidence),
            ),
          );
        }
      }
    }

    for (const fact of handlerFacts) {
      if (handlerNodes.has(fact.identityKey)) {
        throw new EventKnowledgeProjectionError(
          'Event handler identity is not unique',
        );
      }

      const node = this.toHandlerNode(fact);
      handlerNodes.set(node.identityKey, node);
      const eventIdentity = this.optionalString(
        fact.properties.eventIdentityKey,
      );

      if (!eventIdentity) {
        continue;
      }

      if (!eventNodes.has(eventIdentity)) {
        throw new EventKnowledgeProjectionError(
          'Event handler references an unknown event',
        );
      }

      this.mergeEdge(
        edges,
        this.createEdge(
          KnowledgeEdgeKind.Handles,
          {
            kind: KnowledgeNodeKind.EventHandler,
            identityKey: node.identityKey,
          },
          {
            kind: KnowledgeNodeKind.DomainEvent,
            identityKey: eventIdentity,
          },
          fact.evidence,
          fact.identityKey,
          fact.derivationType,
          fact.confidence,
        ),
      );
    }

    return {
      nodes: [...eventNodes.values(), ...handlerNodes.values()],
      edges: [...edges.values()],
      unresolvedEventReferences,
      diagnostics,
    };
  }

  private toEventNode(facts: readonly AnalysisFact[]): KnowledgeNodeInput {
    const first = facts[0];

    if (!first) {
      throw new EventKnowledgeProjectionError('Event fact group is empty');
    }

    const name = this.requireString(first.properties.name, 'event name');
    const eventKey = this.requireString(first.properties.eventKey, 'event key');
    const referenceKind = this.requireString(
      first.properties.referenceKind,
      'event reference kind',
    );

    for (const fact of facts.slice(1)) {
      if (
        fact.properties.name !== name ||
        fact.properties.eventKey !== eventKey ||
        fact.properties.referenceKind !== referenceKind
      ) {
        throw new EventKnowledgeProjectionError(
          'Domain event identity has conflicting content',
        );
      }
    }

    const evidence = this.uniqueAnalysisEvidence(
      facts.flatMap((fact) => fact.evidence),
    );
    const properties = {
      eventKey,
      occurrences: this.collectStringArrays(facts, 'occurrences'),
      operations: this.collectStringArrays(facts, 'operations'),
      referenceKind,
    };

    return {
      kind: KnowledgeNodeKind.DomainEvent,
      identityKey: first.identityKey,
      name,
      summary: null,
      derivationType: KnowledgeDerivationType.Deterministic,
      confidence: 1,
      analyzerName: first.analyzerName,
      analyzerVersion: first.analyzerVersion,
      contentFingerprint: this.fingerprint({
        evidence,
        identityKey: first.identityKey,
        properties,
      }),
      propertySchemaVersion: 1,
      properties,
      evidence: this.mapEvidenceTuple(evidence),
    };
  }

  private toHandlerNode(fact: AnalysisFact): KnowledgeNodeInput {
    const name = this.requireString(fact.properties.name, 'handler name');

    return {
      kind: KnowledgeNodeKind.EventHandler,
      identityKey: fact.identityKey,
      name,
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
    evidenceInput: readonly [AnalysisEvidence, ...AnalysisEvidence[]],
    sourceFactIdentityKey: string,
    derivationType: AnalysisDerivationType,
    confidence: number,
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
    const confidence = Math.max(existing.confidence, edge.confidence);
    edges.set(edge.identityKey, {
      ...existing,
      confidence,
      evidence,
      contentFingerprint: this.fingerprint({
        confidence,
        derivationType: existing.derivationType,
        evidence,
        identityKey: existing.identityKey,
        kind: existing.kind,
        properties: existing.properties,
      }),
    });
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

  private collectStringArrays(
    facts: readonly AnalysisFact[],
    key: string,
  ): readonly string[] {
    const values = facts.flatMap((fact) => {
      const value = fact.properties[key];
      return Array.isArray(value)
        ? value.filter((item): item is string => typeof item === 'string')
        : [];
    });
    return [...new Set(values)].sort();
  }

  private uniqueAnalysisEvidence(
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
      throw new EventKnowledgeProjectionError(`Event ${field} is invalid`);
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
