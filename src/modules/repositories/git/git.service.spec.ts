import {
  mkdir,
  mkdtemp,
  realpath,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GitCommandService } from './git-command.service';
import { GitIntegrationError, GitIntegrationErrorCode } from './git.errors';
import { GitService } from './git.service';
import { GitRepositoryState, GitSourceKind } from './git.types';

describe('GitService', () => {
  const organizationId = '5abf1e5e-e03c-4890-83a5-c4e84ad48d18';
  let testRoot: string;
  let localRepositoriesRoot: string;
  let sourceRepositoryPath: string;
  let workspaceRoot: string;
  let commandService: GitCommandService;
  let service: GitService;

  beforeEach(async () => {
    testRoot = await realpath(
      await mkdtemp(join(tmpdir(), 'codemind-git-service-')),
    );
    localRepositoriesRoot = join(testRoot, 'allowed-sources');
    sourceRepositoryPath = join(localRepositoriesRoot, 'sample');
    workspaceRoot = join(testRoot, 'workspaces');
    await mkdir(sourceRepositoryPath, { recursive: true });

    const configuration = {
      workspaceRoot,
      localRepositoriesRoot,
      commandTimeoutMs: 5_000,
      maxOutputBytes: 1_048_576,
      cloneDepth: 1,
    };
    commandService = new GitCommandService(configuration);
    service = new GitService(configuration, commandService);

    await runGit(['init', '--initial-branch=main', sourceRepositoryPath]);
    await runGit([
      '-C',
      sourceRepositoryPath,
      'config',
      'user.email',
      'codemind-test@example.com',
    ]);
    await runGit([
      '-C',
      sourceRepositoryPath,
      'config',
      'user.name',
      'CodeMind Test',
    ]);
    await writeFile(
      join(sourceRepositoryPath, 'README.md'),
      '# Git fixture\n',
      'utf8',
    );
    await runGit(['-C', sourceRepositoryPath, 'add', '--', 'README.md']);
    await runGit([
      '-C',
      sourceRepositoryPath,
      'commit',
      '-m',
      'initial fixture',
    ]);
  });

  afterEach(async () => {
    await rm(testRoot, { recursive: true, force: true });
  });

  function runGit(arguments_: readonly string[]): Promise<unknown> {
    return commandService.run(arguments_, { operation: 'prepare Git fixture' });
  }

  it('accepts only credential-free GitHub HTTPS remotes', async () => {
    await expect(
      service.resolveSource('https://github.com/codemind/codemind-api.git/'),
    ).resolves.toEqual({
      kind: GitSourceKind.GitHubHttps,
      location: 'https://github.com/codemind/codemind-api.git',
    });
    await expect(
      service.resolveSource(
        'https://token@github.com/codemind/codemind-api.git',
      ),
    ).rejects.toMatchObject<Partial<GitIntegrationError>>({
      code: GitIntegrationErrorCode.UnsupportedSource,
    });
    await expect(
      service.resolveSource('https://gitlab.com/codemind/codemind-api.git'),
    ).rejects.toMatchObject<Partial<GitIntegrationError>>({
      code: GitIntegrationErrorCode.UnsupportedSource,
    });
    await expect(
      service.resolveSource(
        'https://github.com/codemind/codemind-api.git\n--upload-pack=evil',
      ),
    ).rejects.toMatchObject<Partial<GitIntegrationError>>({
      code: GitIntegrationErrorCode.InvalidSource,
    });
  });

  it('allows local repositories only inside the configured root', async () => {
    const outsideRepository = join(testRoot, 'outside');
    const escapeLink = join(localRepositoriesRoot, 'escape');
    await mkdir(outsideRepository);
    await symlink(outsideRepository, escapeLink);

    await expect(service.resolveSource(sourceRepositoryPath)).resolves.toEqual({
      kind: GitSourceKind.Local,
      location: sourceRepositoryPath,
    });
    await expect(
      service.resolveSource(outsideRepository),
    ).rejects.toMatchObject<Partial<GitIntegrationError>>({
      code: GitIntegrationErrorCode.InvalidSource,
    });
    await expect(service.resolveSource(escapeLink)).rejects.toMatchObject<
      Partial<GitIntegrationError>
    >({
      code: GitIntegrationErrorCode.InvalidSource,
    });
  });

  it('rejects local repositories when local support is disabled', async () => {
    const configuration = {
      workspaceRoot,
      localRepositoriesRoot: undefined,
      commandTimeoutMs: 5_000,
      maxOutputBytes: 1_048_576,
      cloneDepth: 1,
    };
    const disabledService = new GitService(
      configuration,
      new GitCommandService(configuration),
    );

    await expect(
      disabledService.resolveSource(sourceRepositoryPath),
    ).rejects.toMatchObject<Partial<GitIntegrationError>>({
      code: GitIntegrationErrorCode.LocalSourceDisabled,
    });
  });

  it('validates a repository and resolves its default branch and commit', async () => {
    const inspection = await service.validateRepository(sourceRepositoryPath);

    expect(inspection.source.kind).toBe(GitSourceKind.Local);
    expect(inspection.defaultBranch).toBe('main');
    expect(inspection.headCommitSha).toMatch(/^[0-9a-f]{40}$/u);
  });

  it('clones without a checkout and lists the remote branches', async () => {
    const state = await service.cloneRepository(
      sourceRepositoryPath,
      organizationId,
      101,
    );

    expect(state.workspacePath).toBe(
      join(workspaceRoot, organizationId, '101'),
    );
    expect(state.defaultBranch).toBe('main');
    expect(state.headCommitSha).toMatch(/^[0-9a-f]{40}$/u);
    expect(state.branches).toEqual([
      expect.objectContaining({ name: 'main', isDefault: true }),
    ]);
    await expect(
      service.cloneRepository(sourceRepositoryPath, organizationId, 101),
    ).rejects.toMatchObject<Partial<GitIntegrationError>>({
      code: GitIntegrationErrorCode.WorkspaceExists,
    });
  });

  it('fetches new branches and reports the refreshed repository state', async () => {
    await service.cloneRepository(sourceRepositoryPath, organizationId, 101);
    await runGit([
      '-C',
      sourceRepositoryPath,
      'checkout',
      '-b',
      'feature/search',
    ]);
    await writeFile(
      join(sourceRepositoryPath, 'search.ts'),
      'export const search = true;\n',
      'utf8',
    );
    await runGit(['-C', sourceRepositoryPath, 'add', '--', 'search.ts']);
    await runGit([
      '-C',
      sourceRepositoryPath,
      'commit',
      '-m',
      'add search branch',
    ]);
    await runGit(['-C', sourceRepositoryPath, 'checkout', 'main']);

    const state = await service.pullLatest(organizationId, 101);

    expect(state.defaultBranch).toBe('main');
    expect(state.branches.map((branch) => branch.name)).toEqual([
      'feature/search',
      'main',
    ]);
  });

  it('clones on the first synchronization and fetches on later synchronizations', async () => {
    const initialState = await service.synchronizeRepository(
      sourceRepositoryPath,
      organizationId,
      102,
    );

    await runGit([
      '-C',
      sourceRepositoryPath,
      'checkout',
      '-b',
      'feature/analysis',
    ]);
    await writeFile(
      join(sourceRepositoryPath, 'analysis.ts'),
      'export const analysis = true;\n',
      'utf8',
    );
    await runGit(['-C', sourceRepositoryPath, 'add', '--', 'analysis.ts']);
    await runGit([
      '-C',
      sourceRepositoryPath,
      'commit',
      '-m',
      'add analysis branch',
    ]);

    const refreshedState = await service.synchronizeRepository(
      sourceRepositoryPath,
      organizationId,
      102,
    );

    expect(initialState.branches.map((branch) => branch.name)).toEqual([
      'main',
    ]);
    expect(refreshedState.branches.map((branch) => branch.name)).toEqual([
      'feature/analysis',
      'main',
    ]);
  });

  it('coalesces concurrent synchronization requests for one workspace', async () => {
    const state = {
      workspacePath: join(workspaceRoot, organizationId, '103'),
      defaultBranch: 'main',
      headCommitSha: 'a'.repeat(40),
      branches: [],
    } satisfies GitRepositoryState;
    let resolveClone!: (value: GitRepositoryState) => void;
    let markCloneStarted!: () => void;
    const cloneStarted = new Promise<void>((resolve) => {
      markCloneStarted = resolve;
    });
    const pullLatest = jest
      .spyOn(service, 'pullLatest')
      .mockRejectedValue(
        new GitIntegrationError(
          'Repository workspace was not found',
          GitIntegrationErrorCode.WorkspaceNotFound,
        ),
      );
    const cloneRepository = jest
      .spyOn(service, 'cloneRepository')
      .mockImplementation(() => {
        markCloneStarted();

        return new Promise((resolve) => {
          resolveClone = resolve;
        });
      });

    const first = service.synchronizeRepository(
      sourceRepositoryPath,
      organizationId,
      103,
    );
    const second = service.synchronizeRepository(
      sourceRepositoryPath,
      organizationId,
      103,
    );

    await cloneStarted;
    resolveClone(state);

    await expect(Promise.all([first, second])).resolves.toEqual([state, state]);
    expect(pullLatest).toHaveBeenCalledTimes(1);
    expect(cloneRepository).toHaveBeenCalledTimes(1);
  });

  it('rejects untrusted workspace identity components', async () => {
    await expect(
      service.getWorkspacePath('../../outside', 101),
    ).rejects.toMatchObject<Partial<GitIntegrationError>>({
      code: GitIntegrationErrorCode.InvalidWorkspaceIdentity,
    });
    await expect(
      service.getWorkspacePath(organizationId, 0),
    ).rejects.toMatchObject<Partial<GitIntegrationError>>({
      code: GitIntegrationErrorCode.InvalidWorkspaceIdentity,
    });
  });

  it('rejects a workspace organization symlink that escapes the root', async () => {
    const outsideWorkspace = join(testRoot, 'outside-workspace');
    await mkdir(workspaceRoot, { recursive: true });
    await mkdir(outsideWorkspace);
    await symlink(outsideWorkspace, join(workspaceRoot, organizationId));

    await expect(
      service.getWorkspacePath(organizationId, 101),
    ).rejects.toMatchObject<Partial<GitIntegrationError>>({
      code: GitIntegrationErrorCode.InvalidSource,
    });
  });
});
