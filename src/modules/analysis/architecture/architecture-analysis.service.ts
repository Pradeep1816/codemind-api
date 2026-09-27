import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import analysisConfig from '../../../config/analysis.config';
import { CodeDependencyKind } from '../../indexing/enums/code-dependency-kind.enum';
import { CodeSymbolKind } from '../../indexing/enums/code-symbol-kind.enum';
import { CODE_INTELLIGENCE_READER } from '../../indexing/ports/code-intelligence-reader.port';
import type {
  CodeIntelligenceDependency,
  CodeIntelligenceFile,
  CodeIntelligenceReader,
  CodeIntelligenceSnapshotRequest,
  CodeIntelligenceSymbol,
} from '../../indexing/ports/code-intelligence-reader.port';
import { AnalysisFactFactory } from '../analysis-fact.factory';
import { AnalysisService } from '../analysis.service';
import { AnalysisDerivationType } from '../enums/analysis-derivation-type.enum';
import { AnalysisDiagnosticSeverity } from '../enums/analysis-diagnostic-severity.enum';
import { AnalysisEvidenceRole } from '../enums/analysis-evidence-role.enum';
import { AnalysisFactKind } from '../enums/analysis-fact-kind.enum';
import { ArchitectureComponentType } from '../enums/architecture-component-type.enum';
import { ArchitectureRelationType } from '../enums/architecture-relation-type.enum';
import { CallResolutionStatus } from '../enums/call-resolution-status.enum';
import type {
  AnalysisDiagnostic,
  AnalysisOutput,
} from '../types/analysis-diagnostic.types';
import type {
  AnalysisEvidence,
  AnalysisFact,
  AnalysisPropertyValue,
} from '../types/analysis-fact.types';
import {
  ArchitectureAnalysisError,
  ArchitectureAnalysisErrorCode,
} from './architecture-analysis.errors';

const ANALYZER_NAME = 'typescript-architecture';
const ANALYZER_VERSION = '1.0.0';
const MAX_REPORTED_CANDIDATES = 50;

interface ArchitectureIndex {
  files: readonly CodeIntelligenceFile[];
  fileById: ReadonlyMap<number, CodeIntelligenceFile>;
  symbolById: ReadonlyMap<number, CodeIntelligenceSymbol>;
  symbolsByFileId: ReadonlyMap<number, readonly CodeIntelligenceSymbol[]>;
  dependenciesByFileId: ReadonlyMap<
    number,
    readonly CodeIntelligenceDependency[]
  >;
}

interface ComponentDescriptor {
  identityKey: string;
  type: ArchitectureComponentType;
  symbol: CodeIntelligenceSymbol;
  file: CodeIntelligenceFile;
  fact: AnalysisFact;
}

interface ComponentResolution {
  candidates: readonly ComponentDescriptor[];
  deterministic: boolean;
}

interface Classification {
  type: ArchitectureComponentType;
  derivationType: AnalysisDerivationType;
  confidence: number;
  signals: readonly string[];
}

@Injectable()
export class ArchitectureAnalysisService {
  constructor(
    @Inject(analysisConfig.KEY)
    private readonly configuration: ConfigType<typeof analysisConfig>,
    @Inject(CODE_INTELLIGENCE_READER)
    private readonly codeIntelligenceReader: CodeIntelligenceReader,
    private readonly analysisService: AnalysisService,
    private readonly factFactory: AnalysisFactFactory,
  ) {}

  /**
   * Resolves repository-wide architecture without executing source code. The
   * method buffers bounded Phase 3 metadata, never source bodies or AST nodes.
   */
  async *analyzeSnapshot(
    request: CodeIntelligenceSnapshotRequest,
  ): AsyncIterable<AnalysisOutput> {
    const index = await this.createIndex(request);
    const decorators: AnalysisFact[] = [];
    const injections: AnalysisFact[] = [];
    const calls: AnalysisFact[] = [];
    const outputs: AnalysisOutput[] = [];

    for await (const output of this.analysisService.analyzeSnapshot(request)) {
      if (output.type === 'diagnostic') {
        this.appendOutput(outputs, output);
        continue;
      }

      switch (output.kind) {
        case AnalysisFactKind.Decorator:
          decorators.push(output);
          break;
        case AnalysisFactKind.ConstructorInjection:
          injections.push(output);
          break;
        case AnalysisFactKind.CallSite:
          calls.push(output);
          break;
        case AnalysisFactKind.DomainConcept:
        case AnalysisFactKind.BusinessRule:
        case AnalysisFactKind.State:
        case AnalysisFactKind.StateTransition:
        case AnalysisFactKind.DomainEvent:
        case AnalysisFactKind.EventHandler:
          this.appendOutput(outputs, output);
          break;
        default:
          break;
      }

      if (
        decorators.length + injections.length + calls.length >
        this.configuration.maxArchitectureOutputs
      ) {
        throw new ArchitectureAnalysisError(
          'Architecture input facts exceed the configured limit',
          ArchitectureAnalysisErrorCode.OutputLimitExceeded,
        );
      }
    }

    const decoratorBySymbolId = this.groupFactsByEvidenceSymbol(decorators);
    const components = this.classifyComponents(
      index,
      decoratorBySymbolId,
      outputs,
    );
    const componentBySymbolId = new Map(
      components.map((component) => [component.symbol.id, component]),
    );
    const injectionTargets = this.resolveInjections(
      injections,
      index,
      components,
      componentBySymbolId,
      outputs,
    );

    this.resolveModuleRelationships(
      decorators,
      index,
      components,
      componentBySymbolId,
      outputs,
    );
    this.resolveCalls(
      calls,
      index,
      components,
      componentBySymbolId,
      injectionTargets,
      outputs,
    );

    for (const component of components) {
      this.appendOutput(outputs, component.fact);
    }

    for (const output of outputs) {
      yield output;
    }
  }

  private async createIndex(
    request: CodeIntelligenceSnapshotRequest,
  ): Promise<ArchitectureIndex> {
    await this.codeIntelligenceReader.getSnapshot(request);
    const files: CodeIntelligenceFile[] = [];
    const fileById = new Map<number, CodeIntelligenceFile>();
    const symbolById = new Map<number, CodeIntelligenceSymbol>();
    const symbolsByFileId = new Map<
      number,
      readonly CodeIntelligenceSymbol[]
    >();
    const dependenciesByFileId = new Map<
      number,
      readonly CodeIntelligenceDependency[]
    >();
    let symbolCount = 0;
    let dependencyCount = 0;

    for await (const file of this.codeIntelligenceReader.streamFiles(request)) {
      if (files.length >= this.configuration.maxArchitectureFiles) {
        throw new ArchitectureAnalysisError(
          'Architecture files exceed the configured snapshot limit',
          ArchitectureAnalysisErrorCode.FileLimitExceeded,
        );
      }

      symbolCount += file.symbols.length;
      dependencyCount += file.dependencies.length;

      if (symbolCount > this.configuration.maxArchitectureSymbols) {
        throw new ArchitectureAnalysisError(
          'Architecture symbols exceed the configured snapshot limit',
          ArchitectureAnalysisErrorCode.SymbolLimitExceeded,
        );
      }

      if (dependencyCount > this.configuration.maxArchitectureDependencies) {
        throw new ArchitectureAnalysisError(
          'Architecture dependencies exceed the configured snapshot limit',
          ArchitectureAnalysisErrorCode.DependencyLimitExceeded,
        );
      }

      files.push(file);
      fileById.set(file.id, file);
      symbolsByFileId.set(file.id, file.symbols);
      dependenciesByFileId.set(file.id, file.dependencies);

      for (const symbol of file.symbols) {
        symbolById.set(symbol.id, symbol);
      }
    }

    return {
      files,
      fileById,
      symbolById,
      symbolsByFileId,
      dependenciesByFileId,
    };
  }

  private classifyComponents(
    index: ArchitectureIndex,
    decoratorBySymbolId: ReadonlyMap<number, readonly AnalysisFact[]>,
    outputs: AnalysisOutput[],
  ): ComponentDescriptor[] {
    const components: ComponentDescriptor[] = [];

    for (const file of index.files) {
      for (const symbol of file.symbols) {
        if (
          symbol.kind !== CodeSymbolKind.Class &&
          symbol.kind !== CodeSymbolKind.Function
        ) {
          continue;
        }

        const decorators = decoratorBySymbolId.get(symbol.id) ?? [];
        const classification = this.classifyComponent(
          file,
          symbol,
          decorators,
          outputs,
        );

        if (!classification) {
          continue;
        }

        const identityKey = this.stableIdentity('architecture_component', [
          file.path,
          symbol.qualifiedName,
        ]);
        const fact = this.factFactory.create({
          kind: AnalysisFactKind.ArchitectureComponent,
          identityKey,
          analyzerName: ANALYZER_NAME,
          analyzerVersion: ANALYZER_VERSION,
          derivationType: classification.derivationType,
          confidence: classification.confidence,
          properties: {
            classificationSignals: classification.signals,
            componentType: classification.type,
            indexedFileId: file.id,
            name: symbol.name,
            path: file.path,
            qualifiedName: symbol.qualifiedName,
            symbolId: symbol.id,
          },
          evidence: [
            this.symbolEvidence(file, symbol, AnalysisEvidenceRole.Declaration),
          ],
        });

        components.push({
          identityKey,
          type: classification.type,
          symbol,
          file,
          fact,
        });
      }
    }

    return components;
  }

  private classifyComponent(
    file: CodeIntelligenceFile,
    symbol: CodeIntelligenceSymbol,
    decorators: readonly AnalysisFact[],
    outputs: AnalysisOutput[],
  ): Classification | null {
    const decoratorNames = decorators.flatMap((fact) => {
      const name = this.readString(fact.properties.name);
      return name ? [name.split('.').at(-1) ?? name] : [];
    });
    const directTypes = new Set<ArchitectureComponentType>();

    for (const name of decoratorNames) {
      if (name === 'Module') {
        directTypes.add(ArchitectureComponentType.Module);
      } else if (name === 'Controller') {
        directTypes.add(ArchitectureComponentType.Controller);
      } else if (name === 'Entity' || name === 'ChildEntity') {
        directTypes.add(ArchitectureComponentType.Entity);
      }
    }

    if (directTypes.size > 1) {
      this.appendOutput(
        outputs,
        this.diagnostic(
          'ambiguous_architecture_classification',
          `Symbol ${symbol.qualifiedName} has conflicting architecture decorators`,
          decorators[0]?.evidence[0] ??
            this.symbolEvidence(file, symbol, AnalysisEvidenceRole.Declaration),
        ),
      );
      return null;
    }

    const signals = decoratorNames.map((name) => `decorator:${name}`);
    const directType = [...directTypes][0];

    if (directType) {
      return {
        type: directType,
        derivationType: AnalysisDerivationType.Deterministic,
        confidence: 1,
        signals,
      };
    }

    const suffixType = this.classifyName(symbol.name);
    const injectable = decoratorNames.includes('Injectable');

    if (injectable && suffixType) {
      return {
        type: suffixType,
        derivationType: AnalysisDerivationType.Heuristic,
        confidence: 0.95,
        signals: [...signals, `name_suffix:${suffixType}`],
      };
    }

    if (injectable) {
      return {
        type: ArchitectureComponentType.Provider,
        derivationType: AnalysisDerivationType.Deterministic,
        confidence: 1,
        signals,
      };
    }

    if (suffixType) {
      return {
        type: suffixType,
        derivationType: AnalysisDerivationType.Heuristic,
        confidence: 0.8,
        signals: [`name_suffix:${suffixType}`],
      };
    }

    if (this.isConfigurationFile(file.path)) {
      return {
        type: ArchitectureComponentType.Configuration,
        derivationType: AnalysisDerivationType.Heuristic,
        confidence: 0.85,
        signals: ['file_pattern:configuration'],
      };
    }

    return null;
  }

  private classifyName(name: string): ArchitectureComponentType | null {
    const mappings: readonly [RegExp, ArchitectureComponentType][] = [
      [/(?:^|)Controller$/u, ArchitectureComponentType.Controller],
      [/(?:^|)Service$/u, ArchitectureComponentType.Service],
      [/(?:^|)Repository$/u, ArchitectureComponentType.Repository],
      [/(?:^|)Module$/u, ArchitectureComponentType.Module],
      [/(?:^|)Entity$/u, ArchitectureComponentType.Entity],
      [/(?:^|)Provider$/u, ArchitectureComponentType.Provider],
      [/(?:Config|Configuration)$/u, ArchitectureComponentType.Configuration],
    ];

    return mappings.find(([pattern]) => pattern.test(name))?.[1] ?? null;
  }

  private resolveInjections(
    injections: readonly AnalysisFact[],
    index: ArchitectureIndex,
    components: readonly ComponentDescriptor[],
    componentBySymbolId: ReadonlyMap<number, ComponentDescriptor>,
    outputs: AnalysisOutput[],
  ): ReadonlyMap<string, readonly ComponentDescriptor[]> {
    const targets = new Map<string, readonly ComponentDescriptor[]>();

    for (const injection of injections) {
      const evidence = injection.evidence[0];
      const source = this.componentForEvidence(
        evidence,
        index,
        componentBySymbolId,
      );
      const parameterName = this.readString(injection.properties.parameterName);
      const targetName =
        this.readString(injection.properties.typeName) ??
        this.readString(injection.properties.targetName);

      if (!source || !parameterName || !targetName) {
        continue;
      }

      const resolution = this.resolveComponentsByName(
        source.file,
        targetName,
        index,
        components,
        componentBySymbolId,
      );
      targets.set(
        this.injectionKey(source.symbol.id, parameterName),
        resolution.candidates,
      );

      if (resolution.candidates.length === 1) {
        const target = resolution.candidates[0];

        if (target) {
          this.appendOutput(
            outputs,
            this.relationshipFact(
              ArchitectureRelationType.DependsOn,
              source,
              target,
              injection.identityKey,
              evidence,
              resolution.deterministic
                ? AnalysisDerivationType.Deterministic
                : AnalysisDerivationType.Heuristic,
              resolution.deterministic ? 1 : 0.75,
            ),
          );
        }
      } else if (resolution.candidates.length > 1) {
        this.appendOutput(
          outputs,
          this.diagnostic(
            'ambiguous_injection_target',
            `Injection target ${targetName} resolves to multiple components`,
            evidence,
          ),
        );
      }
    }

    return targets;
  }

  private resolveModuleRelationships(
    decorators: readonly AnalysisFact[],
    index: ArchitectureIndex,
    components: readonly ComponentDescriptor[],
    componentBySymbolId: ReadonlyMap<number, ComponentDescriptor>,
    outputs: AnalysisOutput[],
  ): void {
    for (const decorator of decorators) {
      const name = this.readString(decorator.properties.name);
      const evidence = decorator.evidence[0];

      if (name?.split('.').at(-1) !== 'Module') {
        continue;
      }

      const source = this.componentForEvidence(
        evidence,
        index,
        componentBySymbolId,
      );
      const metadata = this.readObject(decorator.properties.moduleMetadata);

      if (!source || !metadata) {
        continue;
      }

      for (const [field, relation] of [
        ['controllers', ArchitectureRelationType.Contains],
        ['providers', ArchitectureRelationType.Contains],
        ['imports', ArchitectureRelationType.DependsOn],
      ] as const) {
        for (const reference of this.readStringArray(metadata[field])) {
          const resolution = this.resolveComponentsByName(
            source.file,
            reference,
            index,
            components,
            componentBySymbolId,
          );

          if (resolution.candidates.length === 1) {
            const target = resolution.candidates[0];

            if (target) {
              this.appendOutput(
                outputs,
                this.relationshipFact(
                  relation,
                  source,
                  target,
                  `${decorator.identityKey}:${field}:${reference}`,
                  evidence,
                  resolution.deterministic
                    ? AnalysisDerivationType.Deterministic
                    : AnalysisDerivationType.Heuristic,
                  resolution.deterministic ? 1 : 0.75,
                ),
              );
            }
          } else {
            this.appendOutput(
              outputs,
              this.diagnostic(
                resolution.candidates.length > 1
                  ? 'ambiguous_module_reference'
                  : 'unresolved_module_reference',
                `Module reference ${reference} could not be resolved unambiguously`,
                evidence,
              ),
            );
          }
        }
      }
    }
  }

  private resolveCalls(
    calls: readonly AnalysisFact[],
    index: ArchitectureIndex,
    components: readonly ComponentDescriptor[],
    componentBySymbolId: ReadonlyMap<number, ComponentDescriptor>,
    injectionTargets: ReadonlyMap<string, readonly ComponentDescriptor[]>,
    outputs: AnalysisOutput[],
  ): void {
    for (const call of calls) {
      const evidence = call.evidence[0];
      const source = this.componentForEvidence(
        evidence,
        index,
        componentBySymbolId,
      );
      const candidates = this.resolveCallCandidates(
        call,
        source,
        index,
        components,
        componentBySymbolId,
        injectionTargets,
      );
      const status =
        candidates.length === 1
          ? CallResolutionStatus.Resolved
          : candidates.length > 1
            ? CallResolutionStatus.Ambiguous
            : CallResolutionStatus.Unresolved;
      const targetSymbol = candidates.length === 1 ? candidates[0] : undefined;
      const targetComponent = targetSymbol
        ? this.componentForSymbol(targetSymbol, index, componentBySymbolId)
        : null;

      this.appendOutput(
        outputs,
        this.factFactory.create({
          kind: AnalysisFactKind.CallResolution,
          identityKey: this.stableIdentity('call_resolution', [
            call.identityKey,
          ]),
          analyzerName: ANALYZER_NAME,
          analyzerVersion: ANALYZER_VERSION,
          derivationType: AnalysisDerivationType.Deterministic,
          confidence: status === CallResolutionStatus.Resolved ? 1 : 0,
          properties: {
            callee: this.readString(call.properties.callee),
            candidateSymbolIds: candidates
              .slice(0, MAX_REPORTED_CANDIDATES)
              .map((candidate) => candidate.id),
            resolution: status,
            sourceComponentIdentityKey: source?.identityKey ?? null,
            sourceSymbolId: evidence.codeSymbolId,
            targetComponentIdentityKey: targetComponent?.identityKey ?? null,
            targetSymbolId: targetSymbol?.id ?? null,
          },
          evidence: [evidence],
        }),
      );

      if (status === CallResolutionStatus.Ambiguous) {
        this.appendOutput(
          outputs,
          this.diagnostic(
            'ambiguous_call_target',
            'Call target resolves to multiple symbols',
            evidence,
          ),
        );
      }

      if (source && targetComponent && targetSymbol) {
        this.appendOutput(
          outputs,
          this.relationshipFact(
            ArchitectureRelationType.Calls,
            source,
            targetComponent,
            call.identityKey,
            evidence,
            AnalysisDerivationType.Deterministic,
            1,
            targetSymbol.id,
          ),
        );
      }
    }
  }

  private resolveCallCandidates(
    call: AnalysisFact,
    source: ComponentDescriptor | null,
    index: ArchitectureIndex,
    components: readonly ComponentDescriptor[],
    componentBySymbolId: ReadonlyMap<number, ComponentDescriptor>,
    injectionTargets: ReadonlyMap<string, readonly ComponentDescriptor[]>,
  ): CodeIntelligenceSymbol[] {
    const evidence = call.evidence[0];
    const file = index.fileById.get(evidence.indexedFileId);
    const receiver = this.readString(call.properties.receiver);
    const member = this.readString(call.properties.member);

    if (!file || !member) {
      return [];
    }

    let candidates: CodeIntelligenceSymbol[] = [];

    if (source && receiver === 'this') {
      candidates = this.findComponentMembers(source, member, index);
    } else if (source && receiver?.startsWith('this.')) {
      const propertyName = receiver.slice('this.'.length);
      const targets = injectionTargets.get(
        this.injectionKey(source.symbol.id, propertyName),
      );
      candidates = (targets ?? []).flatMap((target) =>
        this.findComponentMembers(target, member, index),
      );
    } else if (source && receiver === 'super') {
      const dependencies = index.dependenciesByFileId.get(file.id) ?? [];
      const parentComponents = dependencies.flatMap((dependency) => {
        if (
          dependency.kind !== CodeDependencyKind.Extends ||
          dependency.sourceSymbolId !== source.symbol.id ||
          dependency.targetSymbolId === null
        ) {
          return [];
        }

        const target = componentBySymbolId.get(dependency.targetSymbolId);
        return target ? [target] : [];
      });
      candidates = parentComponents.flatMap((target) =>
        this.findComponentMembers(target, member, index),
      );
    } else if (receiver && !receiver.includes('.')) {
      const resolution = this.resolveComponentsByName(
        file,
        receiver,
        index,
        components,
        componentBySymbolId,
      );
      candidates = resolution.candidates.flatMap((target) =>
        this.findComponentMembers(target, member, index),
      );

      if (candidates.length === 0) {
        const namespaceTargets = (index.dependenciesByFileId.get(file.id) ?? [])
          .filter(
            (dependency) =>
              dependency.kind === CodeDependencyKind.Import &&
              dependency.localName === receiver &&
              dependency.targetIndexedFileId !== null,
          )
          .flatMap((dependency) =>
            (
              index.symbolsByFileId.get(dependency.targetIndexedFileId ?? -1) ??
              []
            ).filter((symbol) => symbol.name === member),
          );
        candidates.push(...namespaceTargets);
      }
    } else if (receiver === null) {
      const importedTargets = (index.dependenciesByFileId.get(file.id) ?? [])
        .filter(
          (dependency) =>
            dependency.kind === CodeDependencyKind.Import &&
            dependency.localName === member &&
            dependency.targetSymbolId !== null,
        )
        .flatMap((dependency) => {
          const target = index.symbolById.get(dependency.targetSymbolId ?? -1);
          return target ? [target] : [];
        });
      const localFunctions = (index.symbolsByFileId.get(file.id) ?? []).filter(
        (symbol) =>
          symbol.kind === CodeSymbolKind.Function && symbol.name === member,
      );
      candidates.push(...importedTargets, ...localFunctions);
    }

    return this.uniqueSymbols(candidates);
  }

  private resolveComponentsByName(
    sourceFile: CodeIntelligenceFile,
    name: string,
    index: ArchitectureIndex,
    components: readonly ComponentDescriptor[],
    componentBySymbolId: ReadonlyMap<number, ComponentDescriptor>,
  ): ComponentResolution {
    const rootName = name.split('.')[0] ?? name;
    const imported = (index.dependenciesByFileId.get(sourceFile.id) ?? [])
      .filter(
        (dependency) =>
          dependency.kind === CodeDependencyKind.Import &&
          dependency.localName === rootName &&
          dependency.targetSymbolId !== null,
      )
      .flatMap((dependency) => {
        const component = componentBySymbolId.get(
          dependency.targetSymbolId ?? -1,
        );
        return component ? [component] : [];
      });

    if (imported.length > 0) {
      return {
        candidates: this.uniqueComponents(imported),
        deterministic: true,
      };
    }

    const local = components.filter(
      (component) =>
        component.file.id === sourceFile.id &&
        (component.symbol.name === name ||
          component.symbol.qualifiedName === name),
    );

    if (local.length > 0) {
      return { candidates: this.uniqueComponents(local), deterministic: true };
    }

    return {
      candidates: this.uniqueComponents(
        components.filter(
          (component) =>
            component.symbol.name === name ||
            component.symbol.qualifiedName === name,
        ),
      ),
      deterministic: false,
    };
  }

  private componentForEvidence(
    evidence: AnalysisEvidence,
    index: ArchitectureIndex,
    componentBySymbolId: ReadonlyMap<number, ComponentDescriptor>,
  ): ComponentDescriptor | null {
    const symbol =
      evidence.codeSymbolId === null
        ? null
        : index.symbolById.get(evidence.codeSymbolId);
    return symbol
      ? this.componentForSymbol(symbol, index, componentBySymbolId)
      : null;
  }

  private componentForSymbol(
    symbol: CodeIntelligenceSymbol,
    index: ArchitectureIndex,
    componentBySymbolId: ReadonlyMap<number, ComponentDescriptor>,
  ): ComponentDescriptor | null {
    const direct = componentBySymbolId.get(symbol.id);

    if (direct) {
      return direct;
    }

    const containing = [...componentBySymbolId.values()]
      .filter(
        (component) =>
          component.file.id === symbol.indexedFileId &&
          component.symbol.kind === CodeSymbolKind.Class &&
          component.symbol.startOffset <= symbol.startOffset &&
          component.symbol.endOffset >= symbol.endOffset,
      )
      .sort(
        (left, right) =>
          left.symbol.endOffset -
            left.symbol.startOffset -
            (right.symbol.endOffset - right.symbol.startOffset) ||
          left.symbol.id - right.symbol.id,
      );

    return containing[0] ?? null;
  }

  private findComponentMembers(
    component: ComponentDescriptor,
    member: string,
    index: ArchitectureIndex,
  ): CodeIntelligenceSymbol[] {
    return (index.symbolsByFileId.get(component.file.id) ?? []).filter(
      (symbol) =>
        symbol.kind === CodeSymbolKind.Method &&
        symbol.name === member &&
        component.symbol.startOffset <= symbol.startOffset &&
        component.symbol.endOffset >= symbol.endOffset &&
        symbol.qualifiedName.startsWith(`${component.symbol.qualifiedName}.`),
    );
  }

  private relationshipFact(
    relation: ArchitectureRelationType,
    source: ComponentDescriptor,
    target: ComponentDescriptor,
    discriminator: string,
    evidence: AnalysisEvidence,
    derivationType: AnalysisDerivationType,
    confidence: number,
    targetSymbolId: number = target.symbol.id,
  ): AnalysisFact {
    return this.factFactory.create({
      kind: AnalysisFactKind.ArchitectureRelationship,
      identityKey: this.stableIdentity('architecture_relationship', [
        relation,
        source.identityKey,
        target.identityKey,
        discriminator,
      ]),
      analyzerName: ANALYZER_NAME,
      analyzerVersion: ANALYZER_VERSION,
      derivationType,
      confidence,
      properties: {
        relation,
        sourceIdentityKey: source.identityKey,
        sourceSymbolId: source.symbol.id,
        targetIdentityKey: target.identityKey,
        targetSymbolId,
      },
      evidence: [evidence],
    });
  }

  private symbolEvidence(
    file: CodeIntelligenceFile,
    symbol: CodeIntelligenceSymbol,
    role: AnalysisEvidenceRole,
  ): AnalysisEvidence {
    return {
      indexedFileId: file.id,
      fileHashId: file.hash.id,
      codeSymbolId: symbol.id,
      role,
      range: {
        start: {
          line: symbol.startLine,
          column: symbol.startColumn,
          offset: symbol.startOffset,
        },
        end: {
          line: symbol.endLine,
          column: symbol.endColumn,
          offset: symbol.endOffset,
        },
      },
    };
  }

  private diagnostic(
    code: string,
    message: string,
    evidence: AnalysisEvidence,
  ): AnalysisDiagnostic {
    return {
      type: 'diagnostic',
      analyzerName: ANALYZER_NAME,
      analyzerVersion: ANALYZER_VERSION,
      code,
      severity: AnalysisDiagnosticSeverity.Warning,
      message,
      retryable: false,
      evidence,
    };
  }

  private groupFactsByEvidenceSymbol(
    facts: readonly AnalysisFact[],
  ): ReadonlyMap<number, readonly AnalysisFact[]> {
    const grouped = new Map<number, AnalysisFact[]>();

    for (const fact of facts) {
      const symbolId = fact.evidence[0].codeSymbolId;

      if (symbolId === null) {
        continue;
      }

      const existing = grouped.get(symbolId);
      if (existing) {
        existing.push(fact);
      } else {
        grouped.set(symbolId, [fact]);
      }
    }

    return grouped;
  }

  private appendOutput(
    outputs: AnalysisOutput[],
    output: AnalysisOutput,
  ): void {
    if (outputs.length >= this.configuration.maxArchitectureOutputs) {
      throw new ArchitectureAnalysisError(
        'Architecture outputs exceed the configured snapshot limit',
        ArchitectureAnalysisErrorCode.OutputLimitExceeded,
      );
    }

    outputs.push(output);
  }

  private uniqueSymbols(
    symbols: readonly CodeIntelligenceSymbol[],
  ): CodeIntelligenceSymbol[] {
    return [...new Map(symbols.map((symbol) => [symbol.id, symbol])).values()];
  }

  private uniqueComponents(
    components: readonly ComponentDescriptor[],
  ): ComponentDescriptor[] {
    return [
      ...new Map(
        components.map((component) => [component.symbol.id, component]),
      ).values(),
    ];
  }

  private injectionKey(symbolId: number, parameterName: string): string {
    return `${symbolId}\0${parameterName}`;
  }

  private isConfigurationFile(path: string): boolean {
    return /(?:^|\/)(?:config\/.*|[^/]+\.config)\.[cm]?[jt]sx?$/u.test(path);
  }

  private stableIdentity(prefix: string, values: readonly string[]): string {
    const digest = createHash('sha256')
      .update(JSON.stringify(values))
      .digest('hex');
    return `${prefix}:${digest}`;
  }

  private readString(value: AnalysisPropertyValue | undefined): string | null {
    return typeof value === 'string' ? value : null;
  }

  private readObject(
    value: AnalysisPropertyValue | undefined,
  ): Readonly<Record<string, AnalysisPropertyValue>> | null {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
      ? (value as Readonly<Record<string, AnalysisPropertyValue>>)
      : null;
  }

  private readStringArray(
    value: AnalysisPropertyValue | undefined,
  ): readonly string[] {
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === 'string')
      : [];
  }
}
