import { Injectable } from '@nestjs/common';
import { AnalysisDerivationType } from '../../analysis/enums/analysis-derivation-type.enum';
import { AnalysisEvidenceRole } from '../../analysis/enums/analysis-evidence-role.enum';
import { AnalysisFactKind } from '../../analysis/enums/analysis-fact-kind.enum';
import { ArchitectureRelationType } from '../../analysis/enums/architecture-relation-type.enum';
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

export interface ArchitectureKnowledgeProjection {
  nodes: readonly KnowledgeNodeInput[];
  edges: readonly KnowledgeEdgeInput[];
  callResolutions: readonly AnalysisFact[];
  diagnostics: readonly AnalysisDiagnostic[];
}

export class ArchitectureKnowledgeProjectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = ArchitectureKnowledgeProjectionError.name;
  }
}

@Injectable()
export class ArchitectureKnowledgeProjector {
  /** Converts ORM-independent architecture facts into one persistence batch. */
  project(outputs: readonly AnalysisOutput[]): ArchitectureKnowledgeProjection {
    const nodes = new Map<string, KnowledgeNodeInput>();
    const relationshipFacts: AnalysisFact[] = [];
    const callResolutions: AnalysisFact[] = [];
    const diagnostics: AnalysisDiagnostic[] = [];

    for (const output of outputs) {
      if (output.type === 'diagnostic') {
        diagnostics.push(output);
        continue;
      }

      if (output.kind === AnalysisFactKind.ArchitectureComponent) {
        const node = this.toNode(output);
        const existing = nodes.get(node.identityKey);

        if (
          existing &&
          existing.contentFingerprint !== node.contentFingerprint
        ) {
          throw new ArchitectureKnowledgeProjectionError(
            'Architecture component identity has conflicting content',
          );
        }

        nodes.set(node.identityKey, node);
      } else if (output.kind === AnalysisFactKind.ArchitectureRelationship) {
        relationshipFacts.push(output);
      } else if (output.kind === AnalysisFactKind.CallResolution) {
        callResolutions.push(output);
      }
    }

    const edges = relationshipFacts.map((fact) => this.toEdge(fact, nodes));

    return {
      nodes: [...nodes.values()],
      edges,
      callResolutions,
      diagnostics,
    };
  }

  private toNode(fact: AnalysisFact): KnowledgeNodeInput {
    const name = this.requireString(fact.properties.name, 'component name');

    return {
      kind: KnowledgeNodeKind.ArchitecturalComponent,
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

  private toEdge(
    fact: AnalysisFact,
    nodes: ReadonlyMap<string, KnowledgeNodeInput>,
  ): KnowledgeEdgeInput {
    const sourceIdentityKey = this.requireString(
      fact.properties.sourceIdentityKey,
      'relationship source',
    );
    const targetIdentityKey = this.requireString(
      fact.properties.targetIdentityKey,
      'relationship target',
    );

    if (!nodes.has(sourceIdentityKey) || !nodes.has(targetIdentityKey)) {
      throw new ArchitectureKnowledgeProjectionError(
        'Architecture relationship references an unknown component',
      );
    }

    return {
      identityKey: fact.identityKey,
      kind: this.mapRelationship(
        this.requireString(fact.properties.relation, 'relationship type'),
      ),
      source: {
        kind: KnowledgeNodeKind.ArchitecturalComponent,
        identityKey: sourceIdentityKey,
      },
      target: {
        kind: KnowledgeNodeKind.ArchitecturalComponent,
        identityKey: targetIdentityKey,
      },
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

  private mapEvidenceTuple(
    evidence: AnalysisFact['evidence'],
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

  private mapRelationship(relation: string): KnowledgeEdgeKind {
    const mappings: Readonly<Record<string, KnowledgeEdgeKind>> = {
      [ArchitectureRelationType.Contains]: KnowledgeEdgeKind.Contains,
      [ArchitectureRelationType.DependsOn]: KnowledgeEdgeKind.DependsOn,
      [ArchitectureRelationType.Calls]: KnowledgeEdgeKind.Calls,
    };
    const mapped = mappings[relation];

    if (!mapped) {
      throw new ArchitectureKnowledgeProjectionError(
        `Unsupported architecture relationship: ${relation}`,
      );
    }

    return mapped;
  }

  private requireString(
    value: AnalysisPropertyValue | undefined,
    field: string,
  ): string {
    if (typeof value !== 'string' || value.trim().length === 0) {
      throw new ArchitectureKnowledgeProjectionError(
        `Architecture ${field} is invalid`,
      );
    }

    return value;
  }
}
