import { Readable } from 'node:stream';
import { CodeDependencyKind } from '../../indexing/enums/code-dependency-kind.enum';
import { CodeSymbolKind } from '../../indexing/enums/code-symbol-kind.enum';
import { SourceLanguage } from '../../indexing/enums/source-language.enum';
import {
  CodeIntelligenceFile,
  CodeIntelligenceReader,
  CodeIntelligenceSymbol,
} from '../../indexing/ports/code-intelligence-reader.port';
import { AnalysisFactFactory } from '../analysis-fact.factory';
import { AnalysisService } from '../analysis.service';
import { AnalysisDerivationType } from '../enums/analysis-derivation-type.enum';
import { AnalysisEvidenceRole } from '../enums/analysis-evidence-role.enum';
import { AnalysisFactKind } from '../enums/analysis-fact-kind.enum';
import { ArchitectureComponentType } from '../enums/architecture-component-type.enum';
import { ArchitectureRelationType } from '../enums/architecture-relation-type.enum';
import { CallResolutionStatus } from '../enums/call-resolution-status.enum';
import { AnalysisOutput } from '../types/analysis-diagnostic.types';
import { AnalysisFact } from '../types/analysis-fact.types';
import {
  ArchitectureAnalysisError,
  ArchitectureAnalysisErrorCode,
} from './architecture-analysis.errors';
import { ArchitectureAnalysisService } from './architecture-analysis.service';

describe('ArchitectureAnalysisService', () => {
  const request = {
    organizationId: '5abf1e5e-e03c-4890-83a5-c4e84ad48d18',
    repositoryId: 2,
    indexJobId: 4,
  };
  const snapshot = {
    ...request,
    branchId: 3,
    targetCommitSha: '8e008e725d9e411c5bff3a713b91afeaf4613f13',
    totalFiles: 4,
    completedAt: new Date('2026-08-07T13:07:59.994Z'),
  };

  function symbol(
    id: number,
    indexedFileId: number,
    fileHashId: number,
    name: string,
    qualifiedName: string,
    kind: CodeSymbolKind,
    startOffset: number,
    endOffset: number,
  ): CodeIntelligenceSymbol {
    return {
      id,
      indexedFileId,
      fileHashId,
      name,
      qualifiedName,
      kind,
      visibility: null,
      exported: true,
      defaultExport: false,
      signature: null,
      startLine: 1,
      startColumn: startOffset + 1,
      startOffset,
      endLine: 1,
      endColumn: endOffset + 1,
      endOffset,
    };
  }

  function createFile(
    id: number,
    path: string,
    symbols: CodeIntelligenceSymbol[],
  ): CodeIntelligenceFile {
    return {
      id,
      path,
      extension: 'ts',
      language: SourceLanguage.TypeScript,
      sizeBytes: 400,
      hash: {
        id: id + 100,
        sha256: String(id).repeat(64).slice(0, 64),
        gitBlobOid: String(id).repeat(40).slice(0, 40),
        sizeBytes: 400,
      },
      symbols,
      dependencies: [],
    };
  }

  function createFixture(): {
    files: CodeIntelligenceFile[];
    facts: AnalysisFact[];
  } {
    const moduleClass = symbol(
      1,
      10,
      110,
      'DoctorModule',
      'DoctorModule',
      CodeSymbolKind.Class,
      0,
      300,
    );
    const controllerClass = symbol(
      2,
      20,
      120,
      'DoctorController',
      'DoctorController',
      CodeSymbolKind.Class,
      0,
      350,
    );
    const controllerConstructor = symbol(
      3,
      20,
      120,
      'constructor',
      'DoctorController.constructor',
      CodeSymbolKind.Method,
      20,
      90,
    );
    const controllerMethod = symbol(
      4,
      20,
      120,
      'schedule',
      'DoctorController.schedule',
      CodeSymbolKind.Method,
      100,
      300,
    );
    const serviceClass = symbol(
      5,
      30,
      130,
      'DoctorService',
      'DoctorService',
      CodeSymbolKind.Class,
      0,
      350,
    );
    const serviceMethod = symbol(
      6,
      30,
      130,
      'schedule',
      'DoctorService.schedule',
      CodeSymbolKind.Method,
      100,
      300,
    );
    const repositoryClass = symbol(
      7,
      40,
      140,
      'DoctorRepository',
      'DoctorRepository',
      CodeSymbolKind.Class,
      0,
      350,
    );
    const repositoryMethod = symbol(
      8,
      40,
      140,
      'save',
      'DoctorRepository.save',
      CodeSymbolKind.Method,
      100,
      300,
    );
    const files = [
      createFile(10, 'src/doctor.module.ts', [moduleClass]),
      createFile(20, 'src/doctor.controller.ts', [
        controllerClass,
        controllerConstructor,
        controllerMethod,
      ]),
      createFile(30, 'src/doctor.service.ts', [serviceClass, serviceMethod]),
      createFile(40, 'src/doctor.repository.ts', [
        repositoryClass,
        repositoryMethod,
      ]),
    ];

    files[0].dependencies = [
      dependency(1, files[0], 'DoctorController', controllerClass),
      dependency(2, files[0], 'DoctorService', serviceClass),
      dependency(3, files[0], 'DoctorRepository', repositoryClass),
    ];
    files[1].dependencies = [
      dependency(4, files[1], 'DoctorService', serviceClass),
    ];
    const facts = [
      decoratorFact(moduleClass, files[0], 'Module', {
        controllers: ['DoctorController'],
        providers: ['DoctorService', 'DoctorRepository'],
        imports: [],
        exports: ['DoctorService'],
      }),
      decoratorFact(controllerClass, files[1], 'Controller'),
      baseFact(
        AnalysisFactKind.Decorator,
        'decorator:route:post',
        {
          arguments: ['doctors'],
          name: 'Post',
          targetKind: 'method',
          targetName: 'schedule',
        },
        evidence(
          controllerMethod,
          files[1],
          AnalysisEvidenceRole.Decorator,
          110,
        ),
      ),
      decoratorFact(serviceClass, files[2], 'Injectable'),
      decoratorFact(repositoryClass, files[3], 'Injectable'),
      injectionFact(
        controllerConstructor,
        files[1],
        'service',
        'DoctorService',
      ),
      callFact(
        controllerMethod,
        files[1],
        'this.service.schedule',
        'this.service',
        'schedule',
        150,
      ),
    ];

    return { files, facts };
  }

  function dependency(
    id: number,
    sourceFile: CodeIntelligenceFile,
    localName: string,
    target: CodeIntelligenceSymbol,
  ) {
    return {
      id,
      sourceIndexedFileId: sourceFile.id,
      sourceFileHashId: sourceFile.hash.id,
      sourceSymbolId: null,
      kind: CodeDependencyKind.Import,
      moduleSpecifier: './target',
      targetName: target.name,
      localName,
      typeOnly: false,
      targetIndexedFileId: target.indexedFileId,
      targetFileHashId: target.fileHashId,
      targetSymbolId: target.id,
      startLine: 1,
      startColumn: 1,
      startOffset: 0,
      endLine: 1,
      endColumn: 10,
      endOffset: 9,
    };
  }

  function evidence(
    sourceSymbol: CodeIntelligenceSymbol,
    file: CodeIntelligenceFile,
    role: AnalysisEvidenceRole,
    startOffset = sourceSymbol.startOffset,
  ) {
    return {
      indexedFileId: file.id,
      fileHashId: file.hash.id,
      codeSymbolId: sourceSymbol.id,
      role,
      range: {
        start: { line: 1, column: startOffset + 1, offset: startOffset },
        end: { line: 1, column: startOffset + 11, offset: startOffset + 10 },
      },
    } as const;
  }

  function baseFact(
    kind: AnalysisFactKind,
    identityKey: string,
    properties: AnalysisFact['properties'],
    sourceEvidence: AnalysisFact['evidence'][0],
  ): AnalysisFact {
    return {
      type: 'fact',
      kind,
      identityKey,
      contentFingerprint: 'f'.repeat(64),
      analyzerName: 'typescript-technical',
      analyzerVersion: '1.0.0',
      derivationType: AnalysisDerivationType.Deterministic,
      confidence: 1,
      properties,
      evidence: [sourceEvidence],
    };
  }

  function decoratorFact(
    sourceSymbol: CodeIntelligenceSymbol,
    file: CodeIntelligenceFile,
    name: string,
    moduleMetadata: Record<string, string[]> | null = null,
  ): AnalysisFact {
    return baseFact(
      AnalysisFactKind.Decorator,
      `decorator:${sourceSymbol.id}:${name}`,
      {
        name,
        targetKind: 'class',
        targetName: sourceSymbol.name,
        moduleMetadata,
      },
      evidence(sourceSymbol, file, AnalysisEvidenceRole.Decorator),
    );
  }

  function injectionFact(
    sourceSymbol: CodeIntelligenceSymbol,
    file: CodeIntelligenceFile,
    parameterName: string,
    typeName: string,
  ): AnalysisFact {
    return baseFact(
      AnalysisFactKind.ConstructorInjection,
      `injection:${sourceSymbol.id}:${parameterName}`,
      {
        parameterName,
        typeName,
        targetName: typeName,
        resolution: 'unresolved',
      },
      evidence(sourceSymbol, file, AnalysisEvidenceRole.Injection),
    );
  }

  function callFact(
    sourceSymbol: CodeIntelligenceSymbol,
    file: CodeIntelligenceFile,
    callee: string | null,
    receiver: string | null,
    member: string | null,
    startOffset: number,
  ): AnalysisFact {
    return baseFact(
      AnalysisFactKind.CallSite,
      `call:${file.hash.id}:${startOffset}`,
      { callee, receiver, member, resolution: 'unresolved' },
      evidence(sourceSymbol, file, AnalysisEvidenceRole.CallSite, startOffset),
    );
  }

  function createService(
    files: CodeIntelligenceFile[],
    facts: AnalysisFact[],
    limits: Partial<{
      maxArchitectureSymbols: number;
      maxArchitectureFiles: number;
      maxArchitectureDependencies: number;
      maxArchitectureOutputs: number;
    }> = {},
  ): ArchitectureAnalysisService {
    const reader: CodeIntelligenceReader = {
      getSnapshot: jest.fn().mockResolvedValue(snapshot),
      streamFiles: jest.fn().mockReturnValue(Readable.from(files)),
    };
    const analysisService = {
      analyzeSnapshot: jest.fn().mockReturnValue(Readable.from(facts)),
    } as unknown as AnalysisService;

    return new ArchitectureAnalysisService(
      {
        maxArchitectureSymbols: 100,
        maxArchitectureFiles: 100,
        maxArchitectureDependencies: 100,
        maxArchitectureOutputs: 100,
        ...limits,
      } as never,
      reader,
      analysisService,
      new AnalysisFactFactory({ maxPropertyBytes: 16_384 } as never),
    );
  }

  async function collect(
    service: ArchitectureAnalysisService,
  ): Promise<AnalysisOutput[]> {
    const outputs: AnalysisOutput[] = [];

    for await (const output of service.analyzeSnapshot(request)) {
      outputs.push(output);
    }

    return outputs;
  }

  it('classifies components and resolves containment, injection, and calls', async () => {
    const fixture = createFixture();
    const outputs = await collect(createService(fixture.files, fixture.facts));
    const facts = outputs.filter(
      (output): output is AnalysisFact => output.type === 'fact',
    );
    const components = facts.filter(
      (fact) => fact.kind === AnalysisFactKind.ArchitectureComponent,
    );
    const relationships = facts.filter(
      (fact) => fact.kind === AnalysisFactKind.ArchitectureRelationship,
    );
    const callResolution = facts.find(
      (fact) => fact.kind === AnalysisFactKind.CallResolution,
    );

    expect(
      components.map((component) => component.properties.componentType),
    ).toEqual(
      expect.arrayContaining([
        ArchitectureComponentType.Module,
        ArchitectureComponentType.Controller,
        ArchitectureComponentType.Service,
        ArchitectureComponentType.Repository,
      ]),
    );
    expect(relationships).toHaveLength(5);
    expect(
      relationships.map((relationship) => relationship.properties.relation),
    ).toEqual(
      expect.arrayContaining([
        ArchitectureRelationType.Contains,
        ArchitectureRelationType.DependsOn,
        ArchitectureRelationType.Calls,
      ]),
    );
    expect(callResolution?.properties).toMatchObject({
      resolution: CallResolutionStatus.Resolved,
      targetSymbolId: 6,
    });
    expect(
      facts.some(
        (fact) =>
          fact.kind === AnalysisFactKind.Decorator &&
          fact.properties.name === 'Post' &&
          fact.properties.targetKind === 'method',
      ),
    ).toBe(true);
    expect(facts.every((fact) => fact.evidence.length > 0)).toBe(true);
  });

  it('forwards domain and rule facts into the repository-wide output', async () => {
    const fixture = createFixture();
    const serviceFile = fixture.files[2];
    const serviceMethod = serviceFile.symbols.find(
      (candidate) => candidate.id === 6,
    )!;
    const concept = baseFact(
      AnalysisFactKind.DomainConcept,
      `domain_concept:${'a'.repeat(64)}`,
      {
        name: 'Doctor',
        normalizedName: 'doctor',
        declarationKind: 'class',
        source: 'service_boundary',
      },
      evidence(serviceMethod, serviceFile, AnalysisEvidenceRole.Declaration),
    );
    const rule = baseFact(
      AnalysisFactKind.BusinessRule,
      `business_rule:${'b'.repeat(64)}`,
      {
        ruleType: 'scheduling',
        containingSymbolId: serviceMethod.id,
        containingSymbolName: serviceMethod.qualifiedName,
      },
      evidence(serviceMethod, serviceFile, AnalysisEvidenceRole.Condition),
    );
    const outputs = await collect(
      createService(fixture.files, [...fixture.facts, concept, rule]),
    );

    expect(outputs).toContain(concept);
    expect(outputs).toContain(rule);
  });

  it('preserves ambiguous and unresolved call targets explicitly', async () => {
    const fixture = createFixture();
    const controllerFile = fixture.files[1];
    const controllerMethod = controllerFile.symbols.find(
      (candidate) => candidate.id === 4,
    )!;
    controllerFile.symbols = [
      ...controllerFile.symbols,
      symbol(20, 20, 120, 'run', 'run', CodeSymbolKind.Function, 310, 320),
      symbol(21, 20, 120, 'run', 'run', CodeSymbolKind.Function, 330, 340),
    ];
    fixture.facts.push(
      callFact(controllerMethod, controllerFile, 'run', null, 'run', 200),
      callFact(controllerMethod, controllerFile, null, null, null, 220),
    );

    const outputs = await collect(createService(fixture.files, fixture.facts));
    const resolutions = outputs.filter(
      (output): output is AnalysisFact =>
        output.type === 'fact' &&
        output.kind === AnalysisFactKind.CallResolution,
    );

    expect(resolutions.map((fact) => fact.properties.resolution)).toEqual(
      expect.arrayContaining([
        CallResolutionStatus.Resolved,
        CallResolutionStatus.Ambiguous,
        CallResolutionStatus.Unresolved,
      ]),
    );
    expect(
      outputs.some(
        (output) =>
          output.type === 'diagnostic' &&
          output.code === 'ambiguous_call_target',
      ),
    ).toBe(true);
  });

  it('classifies entity, generic provider, and configuration components', async () => {
    const entityClass = symbol(
      30,
      50,
      150,
      'DoctorRecord',
      'DoctorRecord',
      CodeSymbolKind.Class,
      0,
      100,
    );
    const providerClass = symbol(
      31,
      60,
      160,
      'DoctorTokenFactory',
      'DoctorTokenFactory',
      CodeSymbolKind.Class,
      0,
      100,
    );
    const configurationFunction = symbol(
      32,
      70,
      170,
      'databaseSettings',
      'databaseSettings',
      CodeSymbolKind.Function,
      0,
      100,
    );
    const files = [
      createFile(50, 'src/doctor-record.ts', [entityClass]),
      createFile(60, 'src/doctor-token.factory.ts', [providerClass]),
      createFile(70, 'src/config/database.config.ts', [configurationFunction]),
    ];
    const outputs = await collect(
      createService(files, [
        decoratorFact(entityClass, files[0], 'Entity'),
        decoratorFact(providerClass, files[1], 'Injectable'),
      ]),
    );
    const componentTypes = outputs.flatMap((output) =>
      output.type === 'fact' &&
      output.kind === AnalysisFactKind.ArchitectureComponent
        ? [output.properties.componentType]
        : [],
    );

    expect(componentTypes).toEqual(
      expect.arrayContaining([
        ArchitectureComponentType.Entity,
        ArchitectureComponentType.Provider,
        ArchitectureComponentType.Configuration,
      ]),
    );
  });

  it('does not guess when direct component decorators conflict', async () => {
    const conflictedClass = symbol(
      40,
      80,
      180,
      'ConflictedType',
      'ConflictedType',
      CodeSymbolKind.Class,
      0,
      100,
    );
    const file = createFile(80, 'src/conflicted.ts', [conflictedClass]);
    const outputs = await collect(
      createService(
        [file],
        [
          decoratorFact(conflictedClass, file, 'Module'),
          decoratorFact(conflictedClass, file, 'Controller'),
        ],
      ),
    );

    expect(
      outputs.some(
        (output) =>
          output.type === 'fact' &&
          output.kind === AnalysisFactKind.ArchitectureComponent,
      ),
    ).toBe(false);
    expect(outputs).toContainEqual(
      expect.objectContaining({
        type: 'diagnostic',
        code: 'ambiguous_architecture_classification',
      }),
    );
  });

  it('stops before unbounded repository symbol accumulation', async () => {
    const fixture = createFixture();

    await expect(
      collect(
        createService(fixture.files, fixture.facts, {
          maxArchitectureSymbols: 1,
        }),
      ),
    ).rejects.toMatchObject<Partial<ArchitectureAnalysisError>>({
      code: ArchitectureAnalysisErrorCode.SymbolLimitExceeded,
    });
  });
});
