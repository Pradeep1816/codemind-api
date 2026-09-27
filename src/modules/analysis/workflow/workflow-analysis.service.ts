import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import analysisConfig from '../../../config/analysis.config';
import type { CodeIntelligenceSnapshotRequest } from '../../indexing/ports/code-intelligence-reader.port';
import { AnalysisFactFactory } from '../analysis-fact.factory';
import { ArchitectureAnalysisService } from '../architecture/architecture-analysis.service';
import { AnalysisDerivationType } from '../enums/analysis-derivation-type.enum';
import { AnalysisFactKind } from '../enums/analysis-fact-kind.enum';
import { CallResolutionStatus } from '../enums/call-resolution-status.enum';
import type { AnalysisOutput } from '../types/analysis-diagnostic.types';
import type {
  AnalysisEvidence,
  AnalysisFact,
  AnalysisPropertyValue,
} from '../types/analysis-fact.types';
import {
  WorkflowAnalysisError,
  WorkflowAnalysisErrorCode,
} from './workflow-analysis.errors';

const ANALYZER_NAME = 'typescript-workflow';
const ANALYZER_VERSION = '1.0.0';
const HTTP_METHODS: Readonly<Record<string, string>> = {
  All: 'ALL',
  Delete: 'DELETE',
  Get: 'GET',
  Head: 'HEAD',
  Options: 'OPTIONS',
  Patch: 'PATCH',
  Post: 'POST',
  Put: 'PUT',
};

interface ComponentDescriptor {
  identityKey: string;
  type: string;
  name: string;
  path: string;
  evidence: AnalysisEvidence;
}

@Injectable()
export class WorkflowAnalysisService {
  constructor(
    @Inject(analysisConfig.KEY)
    private readonly configuration: ConfigType<typeof analysisConfig>,
    private readonly architectureAnalysisService: ArchitectureAnalysisService,
    private readonly factFactory: AnalysisFactFactory,
  ) {}

  /** Builds bounded direct-call workflows from explicit HTTP route methods. */
  async *analyzeSnapshot(
    request: CodeIntelligenceSnapshotRequest,
  ): AsyncIterable<AnalysisOutput> {
    const outputs: AnalysisOutput[] = [];

    for await (const output of this.architectureAnalysisService.analyzeSnapshot(
      request,
    )) {
      outputs.push(output);
    }

    const facts = outputs.filter(
      (output): output is AnalysisFact => output.type === 'fact',
    );
    const routes = facts
      .filter((fact) => this.isRouteDecorator(fact))
      .sort((left, right) => this.startOffset(left) - this.startOffset(right));

    if (routes.length > this.configuration.maxWorkflows) {
      throw new WorkflowAnalysisError(
        'Workflow count exceeds the configured snapshot limit',
        WorkflowAnalysisErrorCode.WorkflowLimitExceeded,
      );
    }

    const callsBySourceSymbol = this.groupCallsBySourceSymbol(
      facts.filter((fact) => fact.kind === AnalysisFactKind.CallResolution),
    );
    const components = this.readComponents(facts);
    const derived: AnalysisFact[] = [];
    let totalSteps = 0;

    for (const route of routes) {
      const sourceSymbolId = route.evidence[0].codeSymbolId;
      const component = this.findContainingComponent(
        route.evidence[0],
        components,
      );

      if (sourceSymbolId === null || component === null) {
        continue;
      }

      const calls = [...(callsBySourceSymbol.get(sourceSymbolId) ?? [])].sort(
        (left, right) => this.startOffset(left) - this.startOffset(right),
      );
      const resolvedCalls = calls.filter(
        (call) =>
          call.properties.resolution === CallResolutionStatus.Resolved &&
          this.readNumber(call.properties.targetSymbolId) !== null,
      );
      const stepCount = resolvedCalls.length + 1;

      if (stepCount > this.configuration.maxWorkflowStepsPerWorkflow) {
        throw new WorkflowAnalysisError(
          'Workflow steps exceed the configured per-workflow limit',
          WorkflowAnalysisErrorCode.StepLimitExceeded,
        );
      }

      totalSteps += stepCount;

      if (totalSteps > this.configuration.maxWorkflowSteps) {
        throw new WorkflowAnalysisError(
          'Workflow steps exceed the configured snapshot limit',
          WorkflowAnalysisErrorCode.StepLimitExceeded,
        );
      }

      const decoratorName = this.readString(route.properties.name)!
        .split('.')
        .at(-1)!;
      const httpMethod = HTTP_METHODS[decoratorName];
      const routePath = this.readRoutePath(route.properties.arguments);
      const handlerName =
        this.readString(route.properties.targetName) ?? '<anonymous-route>';
      const workflowIdentityKey = this.stableIdentity('workflow', [
        component.path,
        component.name,
        handlerName,
        httpMethod,
        routePath ?? '',
      ]);
      const stepFacts = this.createSteps(
        workflowIdentityKey,
        route,
        resolvedCalls,
        component,
        handlerName,
      );
      const unresolvedCalls = calls.filter(
        (call) =>
          call.properties.resolution === CallResolutionStatus.Unresolved,
      ).length;
      const ambiguousCalls = calls.filter(
        (call) => call.properties.resolution === CallResolutionStatus.Ambiguous,
      ).length;

      derived.push(
        this.factFactory.create({
          kind: AnalysisFactKind.Workflow,
          identityKey: workflowIdentityKey,
          analyzerName: ANALYZER_NAME,
          analyzerVersion: ANALYZER_VERSION,
          derivationType: AnalysisDerivationType.Deterministic,
          confidence: 1,
          properties: {
            ambiguousCallCount: ambiguousCalls,
            entryComponentIdentityKey: component.identityKey,
            entrySymbolId: sourceSymbolId,
            handlerName,
            httpMethod,
            name: `${httpMethod} ${routePath ?? '/'} → ${handlerName}`,
            routePath,
            stepIdentityKeys: stepFacts.map((step) => step.identityKey),
            unresolvedCallCount: unresolvedCalls,
          },
          evidence: [route.evidence[0]],
        }),
        ...stepFacts,
      );
    }

    yield* outputs;
    yield* derived;
  }

  private createSteps(
    workflowIdentityKey: string,
    route: AnalysisFact,
    calls: readonly AnalysisFact[],
    component: ComponentDescriptor,
    handlerName: string,
  ): AnalysisFact[] {
    const entryIdentityKey = this.stableIdentity('workflow_step', [
      workflowIdentityKey,
      'entry',
    ]);
    const steps = [
      this.factFactory.create({
        kind: AnalysisFactKind.WorkflowStep,
        identityKey: entryIdentityKey,
        analyzerName: ANALYZER_NAME,
        analyzerVersion: ANALYZER_VERSION,
        derivationType: AnalysisDerivationType.Deterministic,
        confidence: 1,
        properties: {
          componentIdentityKey: component.identityKey,
          name: handlerName,
          order: 0,
          stepType: 'entrypoint',
          targetSymbolId: route.evidence[0].codeSymbolId,
          workflowIdentityKey,
        },
        evidence: [route.evidence[0]],
      }),
    ];

    calls.forEach((call, index) => {
      const name =
        this.readString(call.properties.callee) ??
        `symbol:${String(this.readNumber(call.properties.targetSymbolId))}`;
      steps.push(
        this.factFactory.create({
          kind: AnalysisFactKind.WorkflowStep,
          identityKey: this.stableIdentity('workflow_step', [
            workflowIdentityKey,
            call.identityKey,
          ]),
          analyzerName: ANALYZER_NAME,
          analyzerVersion: ANALYZER_VERSION,
          derivationType: AnalysisDerivationType.Deterministic,
          confidence: 1,
          properties: {
            componentIdentityKey: this.readString(
              call.properties.targetComponentIdentityKey,
            ),
            name,
            order: index + 1,
            stepType: 'resolved_call',
            targetSymbolId: this.readNumber(call.properties.targetSymbolId),
            workflowIdentityKey,
          },
          evidence: [call.evidence[0]],
        }),
      );
    });

    return steps;
  }

  private isRouteDecorator(fact: AnalysisFact): boolean {
    if (
      fact.kind !== AnalysisFactKind.Decorator ||
      fact.properties.targetKind !== 'method'
    ) {
      return false;
    }

    const name = this.readString(fact.properties.name)?.split('.').at(-1);
    return name !== undefined && HTTP_METHODS[name] !== undefined;
  }

  private groupCallsBySourceSymbol(
    calls: readonly AnalysisFact[],
  ): ReadonlyMap<number, readonly AnalysisFact[]> {
    const grouped = new Map<number, AnalysisFact[]>();

    for (const call of calls) {
      const sourceSymbolId = this.readNumber(call.properties.sourceSymbolId);

      if (sourceSymbolId === null) {
        continue;
      }

      const group = grouped.get(sourceSymbolId) ?? [];
      group.push(call);
      grouped.set(sourceSymbolId, group);
    }

    return grouped;
  }

  private readComponents(
    facts: readonly AnalysisFact[],
  ): readonly ComponentDescriptor[] {
    return facts.flatMap((fact) => {
      if (fact.kind !== AnalysisFactKind.ArchitectureComponent) {
        return [];
      }

      const name = this.readString(fact.properties.name);
      const path = this.readString(fact.properties.path);
      const type = this.readString(fact.properties.componentType);

      return name && path && type
        ? [
            {
              identityKey: fact.identityKey,
              type,
              name,
              path,
              evidence: fact.evidence[0],
            },
          ]
        : [];
    });
  }

  private findContainingComponent(
    evidence: AnalysisEvidence,
    components: readonly ComponentDescriptor[],
  ): ComponentDescriptor | null {
    if (!evidence.range) {
      return null;
    }

    return (
      components
        .filter(
          (component) =>
            component.type === 'controller' &&
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

  private readRoutePath(
    value: AnalysisPropertyValue | undefined,
  ): string | null {
    if (!Array.isArray(value)) {
      return null;
    }

    const first: unknown = value[0];
    return typeof first === 'string' && first.length <= 512 ? first : null;
  }

  private startOffset(fact: AnalysisFact): number {
    return fact.evidence[0].range?.start.offset ?? Number.MAX_SAFE_INTEGER;
  }

  private readString(value: AnalysisPropertyValue | undefined): string | null {
    return typeof value === 'string' && value.trim().length > 0 ? value : null;
  }

  private readNumber(value: AnalysisPropertyValue | undefined): number | null {
    return typeof value === 'number' && Number.isSafeInteger(value)
      ? value
      : null;
  }

  private stableIdentity(prefix: string, parts: readonly string[]): string {
    return `${prefix}:${createHash('sha256')
      .update(JSON.stringify(parts))
      .digest('hex')}`;
  }
}
