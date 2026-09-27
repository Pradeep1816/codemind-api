import { Injectable } from '@nestjs/common';
import { WorkflowAnalysisService } from '../../analysis/workflow/workflow-analysis.service';
import type {
  AnalysisDiagnostic,
  AnalysisOutput,
} from '../../analysis/types/analysis-diagnostic.types';
import type { CodeIntelligenceSnapshotRequest } from '../../indexing/ports/code-intelligence-reader.port';
import type {
  KnowledgeEdgeInput,
  KnowledgeNodeInput,
} from '../persistence/knowledge-persistence.types';
import { ArchitectureKnowledgeProjector } from './architecture-knowledge.projector';
import { BusinessKnowledgeProjector } from './business-knowledge.projector';
import { EventKnowledgeProjector } from './event-knowledge.projector';
import { StateKnowledgeProjector } from './state-knowledge.projector';
import { WorkflowKnowledgeProjector } from './workflow-knowledge.projector';

export interface BuiltKnowledgeGraph {
  nodes: readonly KnowledgeNodeInput[];
  edges: readonly KnowledgeEdgeInput[];
  diagnostics: readonly AnalysisDiagnostic[];
}

export class KnowledgeGraphBuilderError extends Error {
  readonly code = 'knowledge_projection_conflict';

  constructor(message: string) {
    super(message);
    this.name = KnowledgeGraphBuilderError.name;
  }
}

@Injectable()
export class KnowledgeGraphBuilderService {
  constructor(
    private readonly workflowAnalysisService: WorkflowAnalysisService,
    private readonly architectureProjector: ArchitectureKnowledgeProjector,
    private readonly businessProjector: BusinessKnowledgeProjector,
    private readonly stateProjector: StateKnowledgeProjector,
    private readonly eventProjector: EventKnowledgeProjector,
    private readonly workflowProjector: WorkflowKnowledgeProjector,
  ) {}

  /** Runs the complete bounded analysis pass and assembles one graph. */
  async build(
    request: CodeIntelligenceSnapshotRequest,
  ): Promise<BuiltKnowledgeGraph> {
    const outputs: AnalysisOutput[] = [];

    for await (const output of this.workflowAnalysisService.analyzeSnapshot(
      request,
    )) {
      outputs.push(output);
    }

    const projections = [
      this.architectureProjector.project(outputs),
      this.businessProjector.project(outputs),
      this.stateProjector.project(outputs),
      this.eventProjector.project(outputs),
      this.workflowProjector.project(outputs),
    ];
    const nodes = new Map<string, KnowledgeNodeInput>();
    const edges = new Map<string, KnowledgeEdgeInput>();

    for (const projection of projections) {
      for (const node of projection.nodes) {
        this.mergeNode(nodes, node);
      }

      for (const edge of projection.edges) {
        this.mergeEdge(edges, edge);
      }
    }

    return {
      nodes: [...nodes.values()],
      edges: [...edges.values()],
      diagnostics: outputs.filter(
        (output): output is AnalysisDiagnostic => output.type === 'diagnostic',
      ),
    };
  }

  private mergeNode(
    nodes: Map<string, KnowledgeNodeInput>,
    node: KnowledgeNodeInput,
  ): void {
    const key = `${node.kind}\0${node.identityKey}`;
    const existing = nodes.get(key);

    if (existing && existing.contentFingerprint !== node.contentFingerprint) {
      throw new KnowledgeGraphBuilderError(
        'Knowledge node identity has conflicting projected content',
      );
    }

    nodes.set(key, node);
  }

  private mergeEdge(
    edges: Map<string, KnowledgeEdgeInput>,
    edge: KnowledgeEdgeInput,
  ): void {
    const key = `${edge.kind}\0${edge.identityKey}`;
    const existing = edges.get(key);

    if (existing && existing.contentFingerprint !== edge.contentFingerprint) {
      throw new KnowledgeGraphBuilderError(
        'Knowledge edge identity has conflicting projected content',
      );
    }

    edges.set(key, edge);
  }
}
