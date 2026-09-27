import { Readable } from 'node:stream';
import { AnalysisFactFactory } from '../analysis-fact.factory';
import { ArchitectureAnalysisService } from '../architecture/architecture-analysis.service';
import { AnalysisDerivationType } from '../enums/analysis-derivation-type.enum';
import { AnalysisEvidenceRole } from '../enums/analysis-evidence-role.enum';
import { AnalysisFactKind } from '../enums/analysis-fact-kind.enum';
import { CallResolutionStatus } from '../enums/call-resolution-status.enum';
import type { AnalysisOutput } from '../types/analysis-diagnostic.types';
import type { AnalysisFact } from '../types/analysis-fact.types';
import {
  WorkflowAnalysisError,
  WorkflowAnalysisErrorCode,
} from './workflow-analysis.errors';
import { WorkflowAnalysisService } from './workflow-analysis.service';

describe('WorkflowAnalysisService', () => {
  const request = {
    organizationId: '5abf1e5e-e03c-4890-83a5-c4e84ad48d18',
    repositoryId: 2,
    indexJobId: 4,
  };
  const controllerIdentity = `architecture_component:${'a'.repeat(64)}`;
  const serviceIdentity = `architecture_component:${'b'.repeat(64)}`;

  function evidence(
    startOffset: number,
    endOffset: number,
    codeSymbolId: number,
    role: AnalysisEvidenceRole,
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
    factEvidence: AnalysisFact['evidence'][0],
  ): AnalysisFact {
    return {
      type: 'fact',
      kind,
      identityKey,
      contentFingerprint: 'c'.repeat(64),
      analyzerName: 'fixture',
      analyzerVersion: '1.0.0',
      derivationType: AnalysisDerivationType.Deterministic,
      confidence: 1,
      properties,
      evidence: [factEvidence],
    };
  }

  function component(
    identityKey: string,
    name: string,
    componentType: string,
    startOffset: number,
    endOffset: number,
  ): AnalysisFact {
    return fact(
      AnalysisFactKind.ArchitectureComponent,
      identityKey,
      {
        componentType,
        name,
        path: `src/${name}.ts`,
        symbolId: name === 'AppointmentController' ? 1 : 20,
      },
      evidence(
        startOffset,
        endOffset,
        name === 'AppointmentController' ? 1 : 20,
        AnalysisEvidenceRole.Declaration,
      ),
    );
  }

  function route(): AnalysisFact {
    return fact(
      AnalysisFactKind.Decorator,
      'decorator:route',
      {
        arguments: ['appointments'],
        name: 'Post',
        targetKind: 'method',
        targetName: 'create',
      },
      evidence(50, 70, 2, AnalysisEvidenceRole.Decorator),
    );
  }

  function call(
    identityKey: string,
    offset: number,
    resolution: CallResolutionStatus,
    callee: string,
    targetSymbolId: number | null,
  ): AnalysisFact {
    return fact(
      AnalysisFactKind.CallResolution,
      identityKey,
      {
        callee,
        candidateSymbolIds: targetSymbolId ? [targetSymbolId] : [],
        resolution,
        sourceComponentIdentityKey: controllerIdentity,
        sourceSymbolId: 2,
        targetComponentIdentityKey: targetSymbolId ? serviceIdentity : null,
        targetSymbolId,
      },
      evidence(offset, offset + 10, 2, AnalysisEvidenceRole.CallSite),
    );
  }

  function fixture(): AnalysisFact[] {
    return [
      component(
        controllerIdentity,
        'AppointmentController',
        'controller',
        0,
        500,
      ),
      component(serviceIdentity, 'AppointmentService', 'service', 0, 500),
      route(),
      call(
        'call:save',
        200,
        CallResolutionStatus.Resolved,
        'this.service.save',
        22,
      ),
      call(
        'call:validate',
        100,
        CallResolutionStatus.Resolved,
        'this.service.validate',
        21,
      ),
      call(
        'call:unknown',
        150,
        CallResolutionStatus.Unresolved,
        'runtime.execute',
        null,
      ),
      call(
        'call:ambiguous',
        175,
        CallResolutionStatus.Ambiguous,
        'handler.run',
        null,
      ),
    ];
  }

  function createService(
    outputs = fixture(),
    limits: Partial<{
      maxWorkflows: number;
      maxWorkflowSteps: number;
      maxWorkflowStepsPerWorkflow: number;
    }> = {},
  ) {
    const architecture = {
      analyzeSnapshot: jest.fn().mockReturnValue(Readable.from(outputs)),
    } as unknown as ArchitectureAnalysisService;
    return new WorkflowAnalysisService(
      {
        maxWorkflows: 100,
        maxWorkflowSteps: 1_000,
        maxWorkflowStepsPerWorkflow: 100,
        ...limits,
      } as never,
      architecture,
      new AnalysisFactFactory({ maxPropertyBytes: 16_384 } as never),
    );
  }

  async function collect(service: WorkflowAnalysisService) {
    const outputs: AnalysisOutput[] = [];

    for await (const output of service.analyzeSnapshot(request)) {
      outputs.push(output);
    }

    return outputs;
  }

  it('creates one route workflow with ordered resolved-call steps', async () => {
    const outputs = await collect(createService());
    const workflow = outputs.find(
      (output) =>
        output.type === 'fact' && output.kind === AnalysisFactKind.Workflow,
    );
    const steps = outputs.filter(
      (output): output is AnalysisFact =>
        output.type === 'fact' && output.kind === AnalysisFactKind.WorkflowStep,
    );

    expect(
      workflow?.type === 'fact' ? workflow.properties : null,
    ).toMatchObject({
      name: 'POST appointments → create',
      httpMethod: 'POST',
      routePath: 'appointments',
      entryComponentIdentityKey: controllerIdentity,
      unresolvedCallCount: 1,
      ambiguousCallCount: 1,
    });
    expect(steps.map((step) => step.properties.name)).toEqual([
      'create',
      'this.service.validate',
      'this.service.save',
    ]);
    expect(steps.map((step) => step.properties.order)).toEqual([0, 1, 2]);
    expect(steps.every((step) => step.evidence[0].codeSymbolId === 2)).toBe(
      true,
    );
  });

  it('ignores non-route decorators', async () => {
    const nonRoute = {
      ...route(),
      properties: { ...route().properties, name: 'UseGuards' },
    };
    const outputs = await collect(createService([nonRoute]));

    expect(
      outputs.some(
        (output) =>
          output.type === 'fact' && output.kind === AnalysisFactKind.Workflow,
      ),
    ).toBe(false);
  });

  it('ignores route decorators outside a classified controller', async () => {
    const outputs = await collect(createService([route()]));

    expect(
      outputs.some(
        (output) =>
          output.type === 'fact' && output.kind === AnalysisFactKind.Workflow,
      ),
    ).toBe(false);
  });

  it('enforces per-workflow and repository workflow limits', async () => {
    await expect(
      collect(createService(fixture(), { maxWorkflowStepsPerWorkflow: 2 })),
    ).rejects.toMatchObject<Partial<WorkflowAnalysisError>>({
      code: WorkflowAnalysisErrorCode.StepLimitExceeded,
    });

    await expect(
      collect(createService(fixture(), { maxWorkflows: 0 })),
    ).rejects.toMatchObject<Partial<WorkflowAnalysisError>>({
      code: WorkflowAnalysisErrorCode.WorkflowLimitExceeded,
    });
  });
});
