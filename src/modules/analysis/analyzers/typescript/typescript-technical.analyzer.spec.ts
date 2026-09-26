import { SourceLanguage } from '../../../indexing/enums/source-language.enum';
import { AnalysisFactFactory } from '../../analysis-fact.factory';
import { AnalysisFactKind } from '../../enums/analysis-fact-kind.enum';
import { AnalysisFileContext } from '../../types/analysis-context.types';
import { AnalysisOutput } from '../../types/analysis-diagnostic.types';
import {
  TypeScriptTechnicalAnalyzerError,
  TypeScriptTechnicalAnalyzerErrorCode,
} from './typescript-technical-analyzer.errors';
import { TypeScriptTechnicalAnalyzer } from './typescript-technical.analyzer';

describe('TypeScriptTechnicalAnalyzer', () => {
  const snapshot = {
    organizationId: '5abf1e5e-e03c-4890-83a5-c4e84ad48d18',
    repositoryId: 2,
    branchId: 3,
    indexJobId: 4,
    targetCommitSha: '8e008e725d9e411c5bff3a713b91afeaf4613f13',
    totalFiles: 1,
    completedAt: new Date('2026-08-07T13:07:59.994Z'),
  };

  function createAnalyzer(
    maxAstNodesPerFile = 10_000,
  ): TypeScriptTechnicalAnalyzer {
    return new TypeScriptTechnicalAnalyzer(
      new AnalysisFactFactory({ maxPropertyBytes: 16_384 } as never),
      { maxAstNodesPerFile } as never,
    );
  }

  function createContext(
    content: string,
    language: SourceLanguage,
    extension: string,
  ): AnalysisFileContext {
    const sizeBytes = Buffer.byteLength(content, 'utf8');

    return {
      snapshot,
      file: {
        id: 7,
        path: `src/fixture.${extension}`,
        extension,
        language,
        sizeBytes,
        hash: {
          id: 8,
          sha256: 'c'.repeat(64),
          gitBlobOid: 'a'.repeat(40),
          sizeBytes,
        },
        symbols: [],
        dependencies: [],
      },
      source: {
        indexedFileId: 7,
        fileHashId: 8,
        path: `src/fixture.${extension}`,
        gitBlobOid: 'a'.repeat(40),
        sizeBytes,
        content,
      },
    };
  }

  function collect(
    analyzer: TypeScriptTechnicalAnalyzer,
    context: AnalysisFileContext,
  ): AnalysisOutput[] {
    const results: AnalysisOutput[] = [];

    for (const result of analyzer.analyze(context)) {
      results.push(result);
    }

    return results;
  }

  function captureAnalyzerError(
    action: () => void,
  ): TypeScriptTechnicalAnalyzerError {
    try {
      action();
    } catch (error: unknown) {
      if (error instanceof TypeScriptTechnicalAnalyzerError) {
        return error;
      }

      throw error;
    }

    throw new Error('Expected TypeScriptTechnicalAnalyzerError');
  }

  it('extracts decorator, constructor injection, and call-site facts', () => {
    const content = `
@Controller('doctors')
export class DoctorController {
  constructor(
    @Inject(DOCTOR_SERVICE)
    private readonly service: DoctorService,
  ) {}

  @Get(':id')
  findDoctor() {
    return this.service.findById(1);
  }
}
`;
    const outputs = collect(
      createAnalyzer(),
      createContext(content, SourceLanguage.TypeScript, 'ts'),
    );
    const facts = outputs.filter((output) => output.type === 'fact');
    const decorators = facts.filter(
      (fact) => fact.kind === AnalysisFactKind.Decorator,
    );
    const injection = facts.find(
      (fact) => fact.kind === AnalysisFactKind.ConstructorInjection,
    );
    const call = facts.find(
      (fact) =>
        fact.kind === AnalysisFactKind.CallSite &&
        fact.properties.callee === 'this.service.findById',
    );

    expect(decorators.map((fact) => fact.properties.name)).toEqual(
      expect.arrayContaining(['Controller', 'Inject', 'Get']),
    );
    expect(injection?.properties).toMatchObject({
      parameterName: 'service',
      targetName: 'DOCTOR_SERVICE',
      token: 'DOCTOR_SERVICE',
      typeName: 'DoctorService',
      resolution: 'unresolved',
    });
    expect(call?.properties).toMatchObject({
      argumentCount: 1,
      receiver: 'this.service',
      member: 'findById',
      resolution: 'unresolved',
    });
    expect(facts.every((fact) => fact.evidence.length > 0)).toBe(true);
    expect(
      facts.every((fact) => /^[0-9a-f]{64}$/u.test(fact.contentFingerprint)),
    ).toBe(true);
  });

  it('extracts JavaScript calls without requiring TypeScript types', () => {
    const outputs = collect(
      createAnalyzer(),
      createContext(
        'export function run(service) { return service.execute(); }',
        SourceLanguage.JavaScript,
        'js',
      ),
    );

    const call = outputs.find(
      (output) =>
        output.type === 'fact' && output.kind === AnalysisFactKind.CallSite,
    );

    expect(call?.type).toBe('fact');
    expect(call?.type === 'fact' ? call.properties.callee : null).toBe(
      'service.execute',
    );
  });

  it('extracts bounded Nest module references for repository-wide resolution', () => {
    const outputs = collect(
      createAnalyzer(),
      createContext(
        `
@Module({
  imports: [SharedModule, forwardRef(() => DeferredModule)],
  controllers: [DoctorController],
  providers: [DoctorService, { provide: TOKEN, useClass: DoctorRepository }],
  exports: [DoctorService],
})
export class DoctorModule {}
`,
        SourceLanguage.TypeScript,
        'ts',
      ),
    );
    const moduleDecorator = outputs.find(
      (output) =>
        output.type === 'fact' &&
        output.kind === AnalysisFactKind.Decorator &&
        output.properties.name === 'Module',
    );

    expect(
      moduleDecorator?.type === 'fact'
        ? moduleDecorator.properties.moduleMetadata
        : null,
    ).toEqual({
      imports: ['SharedModule'],
      controllers: ['DoctorController'],
      providers: ['DoctorService'],
      exports: ['DoctorService'],
    });
  });

  it('preserves computed calls as unresolved and emits a diagnostic', () => {
    const outputs = collect(
      createAnalyzer(),
      createContext(
        'export function run(handlers, name) { handlers[name](); }',
        SourceLanguage.JavaScript,
        'js',
      ),
    );

    const call = outputs.find(
      (output) =>
        output.type === 'fact' && output.kind === AnalysisFactKind.CallSite,
    );
    const diagnostic = outputs.find((output) => output.type === 'diagnostic');

    expect(call?.type === 'fact' ? call.properties : null).toMatchObject({
      callee: null,
      dynamic: true,
      resolution: 'unresolved',
    });
    expect(diagnostic?.type === 'diagnostic' ? diagnostic.code : null).toBe(
      'unsupported_computed_call_target',
    );
  });

  it('stops analysis when a file exceeds the AST node limit', () => {
    expect(
      captureAnalyzerError(() =>
        collect(
          createAnalyzer(5),
          createContext(
            'export function run() { return service.execute(); }',
            SourceLanguage.TypeScript,
            'ts',
          ),
        ),
      ).code,
    ).toBe(TypeScriptTechnicalAnalyzerErrorCode.AstNodeLimitExceeded);
  });
});
