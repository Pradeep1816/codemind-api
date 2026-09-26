import 'reflect-metadata';
import analysisConfig from './analysis.config';
import { validateEnvironment } from './env.validation';

describe('Analysis configuration', () => {
  const variableNames = [
    'ANALYSIS_MAX_TOTAL_SOURCE_BYTES',
    'ANALYSIS_MAX_FACTS_PER_FILE',
    'ANALYSIS_MAX_DIAGNOSTICS_PER_FILE',
    'ANALYSIS_MAX_AST_NODES_PER_FILE',
    'ANALYSIS_MAX_PROPERTY_BYTES',
  ] as const;
  const originalValues = new Map(
    variableNames.map((name) => [name, process.env[name]]),
  );

  afterEach(() => {
    for (const name of variableNames) {
      const originalValue = originalValues.get(name);

      if (originalValue === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = originalValue;
      }
    }
  });

  it('loads numeric analysis resource limits', () => {
    process.env.ANALYSIS_MAX_TOTAL_SOURCE_BYTES = '1048576';
    process.env.ANALYSIS_MAX_FACTS_PER_FILE = '500';
    process.env.ANALYSIS_MAX_DIAGNOSTICS_PER_FILE = '50';
    process.env.ANALYSIS_MAX_AST_NODES_PER_FILE = '10000';
    process.env.ANALYSIS_MAX_PROPERTY_BYTES = '4096';

    expect(analysisConfig()).toEqual({
      maxTotalSourceBytes: 1_048_576,
      maxFactsPerFile: 500,
      maxDiagnosticsPerFile: 50,
      maxAstNodesPerFile: 10_000,
      maxPropertyBytes: 4_096,
    });
  });

  it('rejects unsafe analysis limits during startup validation', () => {
    expect(() =>
      validateEnvironment({
        DATABASE_HOST: 'localhost',
        DATABASE_USER: 'postgres',
        DATABASE_PASSWORD: 'password',
        DATABASE_NAME: 'codemind',
        JWT_SECRET: 'replace_with_a_secret_at_least_32_characters',
        ANALYSIS_MAX_TOTAL_SOURCE_BYTES: '100',
        ANALYSIS_MAX_FACTS_PER_FILE: '0',
        ANALYSIS_MAX_DIAGNOSTICS_PER_FILE: '0',
        ANALYSIS_MAX_AST_NODES_PER_FILE: '99',
        ANALYSIS_MAX_PROPERTY_BYTES: '100',
      }),
    ).toThrow('Environment validation failed');
  });
});
