import { GitCommandService } from './git-command.service';
import { GitCommandError } from './git.errors';

describe('GitCommandService', () => {
  function createService(timeout = 5_000): GitCommandService {
    return new GitCommandService({
      workspaceRoot: '/tmp/codemind-git-command-test',
      localRepositoriesRoot: undefined,
      commandTimeoutMs: timeout,
      maxOutputBytes: 1_048_576,
      cloneDepth: 1,
    });
  }

  it('executes Git directly and captures its output', async () => {
    const result = await createService().run(['--version'], {
      operation: 'read Git version',
    });

    expect(result.stdout).toMatch(/^git version /u);
  });

  it('terminates Git operations that exceed the configured timeout', async () => {
    const service = createService(20);

    await expect(
      service.run(['-c', 'alias.codemind-wait=!sleep 1', 'codemind-wait'], {
        operation: 'test timeout enforcement',
      }),
    ).rejects.toMatchObject<Partial<GitCommandError>>({
      timedOut: true,
    });
  });

  it('rejects null bytes before starting a child process', () => {
    const service = createService();

    expect(() =>
      service.run(['status\0--porcelain'], {
        operation: 'test argument validation',
      }),
    ).toThrow(GitCommandError);
  });

  it('does not inherit Git configuration injection variables', async () => {
    const originalCount = process.env.GIT_CONFIG_COUNT;
    const originalKey = process.env.GIT_CONFIG_KEY_0;
    const originalValue = process.env.GIT_CONFIG_VALUE_0;
    process.env.GIT_CONFIG_COUNT = '1';
    process.env.GIT_CONFIG_KEY_0 = 'alias.codemind-injected';
    process.env.GIT_CONFIG_VALUE_0 = '!echo inherited-alias-ran';

    try {
      await expect(
        createService().run(['codemind-injected'], {
          operation: 'test environment isolation',
        }),
      ).rejects.toBeInstanceOf(GitCommandError);
    } finally {
      restoreEnvironment('GIT_CONFIG_COUNT', originalCount);
      restoreEnvironment('GIT_CONFIG_KEY_0', originalKey);
      restoreEnvironment('GIT_CONFIG_VALUE_0', originalValue);
    }
  });

  function restoreEnvironment(name: string, value: string | undefined): void {
    if (value === undefined) {
      delete process.env[name];
      return;
    }

    process.env[name] = value;
  }
});
