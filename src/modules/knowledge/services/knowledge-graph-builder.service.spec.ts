import { WorkflowAnalysisService } from '../../analysis/workflow/workflow-analysis.service';
import { KnowledgeDerivationType } from '../enums/knowledge-derivation-type.enum';
import { KnowledgeEvidenceRole } from '../enums/knowledge-evidence-role.enum';
import { KnowledgeNodeKind } from '../enums/knowledge-node-kind.enum';
import { KnowledgeNodeInput } from '../persistence/knowledge-persistence.types';
import { ArchitectureKnowledgeProjector } from './architecture-knowledge.projector';
import { BusinessKnowledgeProjector } from './business-knowledge.projector';
import { EventKnowledgeProjector } from './event-knowledge.projector';
import {
  KnowledgeGraphBuilderError,
  KnowledgeGraphBuilderService,
} from './knowledge-graph-builder.service';
import { StateKnowledgeProjector } from './state-knowledge.projector';
import { WorkflowKnowledgeProjector } from './workflow-knowledge.projector';

describe('KnowledgeGraphBuilderService', () => {
  function node(contentFingerprint = 'a'.repeat(64)): KnowledgeNodeInput {
    return {
      identityKey: 'architecture_component:doctor-service',
      kind: KnowledgeNodeKind.ArchitecturalComponent,
      name: 'DoctorService',
      summary: null,
      derivationType: KnowledgeDerivationType.Deterministic,
      confidence: 1,
      analyzerName: 'fixture',
      analyzerVersion: '1.0.0',
      contentFingerprint,
      propertySchemaVersion: 1,
      properties: { componentType: 'service' },
      evidence: [
        {
          indexedFileId: 1,
          fileHashId: 2,
          codeSymbolId: 3,
          role: KnowledgeEvidenceRole.Declaration,
          range: null,
        },
      ],
    };
  }

  function createService(projections: { nodes: KnowledgeNodeInput[] }[]) {
    const workflowAnalysisService = {
      analyzeSnapshot: jest.fn().mockImplementation(async function* () {
        await Promise.resolve();
        yield {
          type: 'diagnostic',
          analyzerName: 'fixture',
          analyzerVersion: '1.0.0',
          code: 'fixture_warning',
          severity: 'warning',
          message: 'Fixture warning',
          retryable: false,
          evidence: null,
        };
      }),
    } as unknown as WorkflowAnalysisService;
    const projectors = projections.map((projection) => ({
      project: jest.fn().mockReturnValue({ ...projection, edges: [] }),
    }));

    return new KnowledgeGraphBuilderService(
      workflowAnalysisService,
      projectors[0] as unknown as ArchitectureKnowledgeProjector,
      projectors[1] as unknown as BusinessKnowledgeProjector,
      projectors[2] as unknown as StateKnowledgeProjector,
      projectors[3] as unknown as EventKnowledgeProjector,
      projectors[4] as unknown as WorkflowKnowledgeProjector,
    );
  }

  it('runs every projector and merges identical graph identities', async () => {
    const shared = node();
    const service = createService([
      { nodes: [shared] },
      { nodes: [shared] },
      { nodes: [] },
      { nodes: [] },
      { nodes: [] },
    ]);

    await expect(
      service.build({
        organizationId: '5abf1e5e-e03c-4890-83a5-c4e84ad48d18',
        repositoryId: 2,
        indexJobId: 4,
      }),
    ).resolves.toMatchObject({
      nodes: [shared],
      edges: [],
      diagnostics: [{ code: 'fixture_warning' }],
    });
  });

  it('rejects conflicting content for one projected identity', async () => {
    const service = createService([
      { nodes: [node('a'.repeat(64))] },
      { nodes: [node('b'.repeat(64))] },
      { nodes: [] },
      { nodes: [] },
      { nodes: [] },
    ]);

    await expect(
      service.build({
        organizationId: '5abf1e5e-e03c-4890-83a5-c4e84ad48d18',
        repositoryId: 2,
        indexJobId: 4,
      }),
    ).rejects.toThrow(KnowledgeGraphBuilderError);
  });
});
