import 'reflect-metadata';
import { resolve } from 'node:path';
import { validateEnvironment } from './env.validation';
import gitConfig from './git.config';

describe('Git configuration', () => {
  const variableNames = [
    'GIT_WORKSPACE_ROOT',
    'GIT_LOCAL_REPOSITORIES_ROOT',
    'GIT_COMMAND_TIMEOUT_MS',
    'GIT_MAX_OUTPUT_BYTES',
    'GIT_CLONE_DEPTH',
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

  it('resolves paths and numeric execution limits', () => {
    process.env.GIT_WORKSPACE_ROOT = './runtime/git';
    process.env.GIT_LOCAL_REPOSITORIES_ROOT = './fixtures/git';
    process.env.GIT_COMMAND_TIMEOUT_MS = '45000';
    process.env.GIT_MAX_OUTPUT_BYTES = '2097152';
    process.env.GIT_CLONE_DEPTH = '10';

    expect(gitConfig()).toEqual({
      workspaceRoot: resolve('./runtime/git'),
      localRepositoriesRoot: resolve('./fixtures/git'),
      commandTimeoutMs: 45_000,
      maxOutputBytes: 2_097_152,
      cloneDepth: 10,
    });
  });

  it('rejects unsafe Git execution limits during startup validation', () => {
    expect(() =>
      validateEnvironment({
        DATABASE_HOST: 'localhost',
        DATABASE_USER: 'postgres',
        DATABASE_PASSWORD: 'password',
        DATABASE_NAME: 'codemind',
        JWT_SECRET: 'replace_with_a_secret_at_least_32_characters',
        GIT_COMMAND_TIMEOUT_MS: '999',
        GIT_MAX_OUTPUT_BYTES: '512',
        GIT_CLONE_DEPTH: '-1',
      }),
    ).toThrow('Environment validation failed');
  });
});
