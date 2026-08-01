import {
  lstat,
  mkdir,
  mkdtemp,
  realpath,
  rename,
  rm,
  stat,
} from 'node:fs/promises';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { Inject, Injectable } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import gitConfig from '../../../config/git.config';
import {
  GIT_BRANCH_OUTPUT_SEPARATOR,
  GIT_MAX_BRANCH_NAME_LENGTH,
  GIT_MAX_SOURCE_LENGTH,
  GIT_OBJECT_ID_PATTERN,
  GIT_REMOTE_NAME,
  ORGANIZATION_ID_PATTERN,
} from './git.constants';
import { GitCommandService } from './git-command.service';
import {
  GitCommandError,
  GitIntegrationError,
  GitIntegrationErrorCode,
} from './git.errors';
import {
  GitBranchState,
  GitRemoteInspection,
  GitRepositorySource,
  GitRepositoryState,
  GitSourceKind,
} from './git.types';

@Injectable()
export class GitService {
  private readonly synchronizationOperations = new Map<
    string,
    Promise<GitRepositoryState>
  >();

  constructor(
    @Inject(gitConfig.KEY)
    private readonly configuration: ConfigType<typeof gitConfig>,
    private readonly gitCommandService: GitCommandService,
  ) {}

  async resolveSource(value: string): Promise<GitRepositorySource> {
    const source = value.trim();

    if (
      source.length === 0 ||
      source.length > GIT_MAX_SOURCE_LENGTH ||
      /[\0\r\n]/.test(source)
    ) {
      throw new GitIntegrationError(
        'Git source is invalid',
        GitIntegrationErrorCode.InvalidSource,
      );
    }

    if (isAbsolute(source)) {
      return this.resolveLocalSource(source);
    }

    return this.resolveGitHubSource(source);
  }

  async validateRepository(sourceValue: string): Promise<GitRemoteInspection> {
    const source = await this.resolveSource(sourceValue);
    const result = await this.gitCommandService.run(
      [
        ...this.getProtocolArguments(source),
        'ls-remote',
        '--symref',
        source.location,
        'HEAD',
      ],
      { operation: 'validate repository source' },
    );
    const lines = result.stdout
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    const symbolicHead = lines.find((line) =>
      line.startsWith('ref: refs/heads/'),
    );
    const headLine = lines.find((line) =>
      GIT_OBJECT_ID_PATTERN.test(line.split(/\s+/u)[0] ?? ''),
    );

    return {
      source,
      defaultBranch:
        symbolicHead?.match(/^ref: refs\/heads\/(.+)\s+HEAD$/u)?.[1] ?? null,
      headCommitSha: headLine?.split(/\s+/u)[0] ?? null,
    };
  }

  async cloneRepository(
    sourceValue: string,
    organizationId: string,
    repositoryId: number,
  ): Promise<GitRepositoryState> {
    const source = await this.resolveSource(sourceValue);
    const workspacePath = await this.getWorkspacePath(
      organizationId,
      repositoryId,
    );

    if (await this.pathExists(workspacePath)) {
      throw new GitIntegrationError(
        'Repository workspace already exists',
        GitIntegrationErrorCode.WorkspaceExists,
      );
    }

    const workspaceParent = resolve(workspacePath, '..');
    await mkdir(workspaceParent, { recursive: true, mode: 0o700 });
    const temporaryPath = await mkdtemp(
      join(workspaceParent, `.${repositoryId}-clone-`),
    );

    try {
      const cloneArguments = [
        ...this.getProtocolArguments(source),
        'clone',
        '--no-checkout',
        '--no-tags',
        '--no-single-branch',
      ];

      if (source.kind === GitSourceKind.Local) {
        cloneArguments.push('--no-local');
      }

      if (this.configuration.cloneDepth > 0) {
        cloneArguments.push('--depth', String(this.configuration.cloneDepth));
      }

      cloneArguments.push('--', source.location, temporaryPath);

      await this.gitCommandService.run(cloneArguments, {
        operation: 'clone repository',
      });
      await rename(temporaryPath, workspacePath);
    } catch (error: unknown) {
      await this.removeTemporaryWorkspace(temporaryPath, workspaceParent);
      throw error;
    }

    return this.getRepositoryStateByPath(workspacePath);
  }

  async pullLatest(
    organizationId: string,
    repositoryId: number,
  ): Promise<GitRepositoryState> {
    const workspacePath = await this.getRequiredWorkspacePath(
      organizationId,
      repositoryId,
    );
    const source = await this.getWorkspaceSource(workspacePath);
    const fetchArguments = [
      ...this.getProtocolArguments(source),
      '-C',
      workspacePath,
      'fetch',
      '--prune',
      '--no-tags',
    ];

    if (this.configuration.cloneDepth > 0) {
      fetchArguments.push('--depth', String(this.configuration.cloneDepth));
    }

    fetchArguments.push(GIT_REMOTE_NAME, '+refs/heads/*:refs/remotes/origin/*');

    await this.gitCommandService.run(fetchArguments, {
      operation: 'fetch repository updates',
    });

    try {
      await this.gitCommandService.run(
        [
          ...this.getProtocolArguments(source),
          '-C',
          workspacePath,
          'remote',
          'set-head',
          GIT_REMOTE_NAME,
          '--auto',
        ],
        { operation: 'refresh default branch' },
      );
    } catch (error: unknown) {
      if (!this.isMissingGitReference(error)) {
        throw error;
      }
    }

    return this.getRepositoryStateByPath(workspacePath);
  }

  async synchronizeRepository(
    sourceValue: string,
    organizationId: string,
    repositoryId: number,
  ): Promise<GitRepositoryState> {
    const operationKey = `${organizationId}:${repositoryId}`;
    const currentOperation = this.synchronizationOperations.get(operationKey);

    if (currentOperation) {
      return currentOperation;
    }

    const operation = this.synchronizeWorkspace(
      sourceValue,
      organizationId,
      repositoryId,
    );
    this.synchronizationOperations.set(operationKey, operation);

    try {
      return await operation;
    } finally {
      if (this.synchronizationOperations.get(operationKey) === operation) {
        this.synchronizationOperations.delete(operationKey);
      }
    }
  }

  async getRepositoryState(
    organizationId: string,
    repositoryId: number,
  ): Promise<GitRepositoryState> {
    return this.getRepositoryStateByPath(
      await this.getRequiredWorkspacePath(organizationId, repositoryId),
    );
  }

  async listBranches(
    organizationId: string,
    repositoryId: number,
  ): Promise<GitBranchState[]> {
    return (await this.getRepositoryState(organizationId, repositoryId))
      .branches;
  }

  async getWorkspacePath(
    organizationId: string,
    repositoryId: number,
  ): Promise<string> {
    if (
      !ORGANIZATION_ID_PATTERN.test(organizationId) ||
      !Number.isSafeInteger(repositoryId) ||
      repositoryId < 1
    ) {
      throw new GitIntegrationError(
        'Repository workspace identity is invalid',
        GitIntegrationErrorCode.InvalidWorkspaceIdentity,
      );
    }

    await mkdir(this.configuration.workspaceRoot, {
      recursive: true,
      mode: 0o700,
    });
    const workspaceRoot = await realpath(this.configuration.workspaceRoot);
    const organizationPath = resolve(workspaceRoot, organizationId);

    this.assertPathInside(workspaceRoot, organizationPath);
    await mkdir(organizationPath, { recursive: true, mode: 0o700 });

    const canonicalOrganizationPath = await realpath(organizationPath);
    this.assertPathInside(workspaceRoot, canonicalOrganizationPath);

    const workspacePath = resolve(
      canonicalOrganizationPath,
      String(repositoryId),
    );

    this.assertPathInside(workspaceRoot, workspacePath);

    return workspacePath;
  }

  private async resolveLocalSource(
    source: string,
  ): Promise<GitRepositorySource> {
    const configuredRoot = this.configuration.localRepositoriesRoot;

    if (!configuredRoot) {
      throw new GitIntegrationError(
        'Local Git repositories are disabled',
        GitIntegrationErrorCode.LocalSourceDisabled,
      );
    }

    let localRoot: string;
    let repositoryPath: string;

    try {
      [localRoot, repositoryPath] = await Promise.all([
        realpath(configuredRoot),
        realpath(source),
      ]);
    } catch (error: unknown) {
      throw new GitIntegrationError(
        'Local Git repository path is unavailable',
        GitIntegrationErrorCode.InvalidSource,
        { cause: error },
      );
    }

    this.assertPathInside(localRoot, repositoryPath);

    if (!(await stat(repositoryPath)).isDirectory()) {
      throw new GitIntegrationError(
        'Local Git source must be a directory',
        GitIntegrationErrorCode.InvalidSource,
      );
    }

    return {
      kind: GitSourceKind.Local,
      location: repositoryPath,
    };
  }

  private async synchronizeWorkspace(
    sourceValue: string,
    organizationId: string,
    repositoryId: number,
  ): Promise<GitRepositoryState> {
    try {
      return await this.pullLatest(organizationId, repositoryId);
    } catch (error: unknown) {
      if (
        !(error instanceof GitIntegrationError) ||
        error.code !== GitIntegrationErrorCode.WorkspaceNotFound
      ) {
        throw error;
      }
    }

    try {
      return await this.cloneRepository(
        sourceValue,
        organizationId,
        repositoryId,
      );
    } catch (error: unknown) {
      if (
        error instanceof GitIntegrationError &&
        error.code === GitIntegrationErrorCode.WorkspaceExists
      ) {
        return this.pullLatest(organizationId, repositoryId);
      }

      throw error;
    }
  }

  private resolveGitHubSource(source: string): GitRepositorySource {
    let remoteUrl: URL;

    try {
      remoteUrl = new URL(source);
    } catch (error: unknown) {
      throw new GitIntegrationError(
        'Git source must be an allowed local path or GitHub HTTPS URL',
        GitIntegrationErrorCode.InvalidSource,
        { cause: error },
      );
    }

    const repositorySegments = remoteUrl.pathname.split('/').filter(Boolean);

    if (
      remoteUrl.protocol !== 'https:' ||
      remoteUrl.hostname.toLowerCase() !== 'github.com' ||
      remoteUrl.port ||
      remoteUrl.username ||
      remoteUrl.password ||
      remoteUrl.search ||
      remoteUrl.hash ||
      repositorySegments.length < 2
    ) {
      throw new GitIntegrationError(
        'Only credential-free GitHub HTTPS repository URLs are supported',
        GitIntegrationErrorCode.UnsupportedSource,
      );
    }

    remoteUrl.pathname = remoteUrl.pathname.replace(/\/+$/u, '');

    return {
      kind: GitSourceKind.GitHubHttps,
      location: remoteUrl.toString(),
    };
  }

  private async getRequiredWorkspacePath(
    organizationId: string,
    repositoryId: number,
  ): Promise<string> {
    const workspacePath = await this.getWorkspacePath(
      organizationId,
      repositoryId,
    );

    if (
      !(await this.pathExists(workspacePath)) ||
      !(await this.pathExists(join(workspacePath, '.git')))
    ) {
      throw new GitIntegrationError(
        'Repository workspace was not found',
        GitIntegrationErrorCode.WorkspaceNotFound,
      );
    }

    const canonicalWorkspacePath = await realpath(workspacePath);
    this.assertPathInside(resolve(workspacePath, '..'), canonicalWorkspacePath);

    return canonicalWorkspacePath;
  }

  private async getWorkspaceSource(
    workspacePath: string,
  ): Promise<GitRepositorySource> {
    const result = await this.gitCommandService.run(
      ['-C', workspacePath, 'config', '--get', `remote.${GIT_REMOTE_NAME}.url`],
      { operation: 'read repository source' },
    );

    return this.resolveSource(result.stdout);
  }

  private async getRepositoryStateByPath(
    workspacePath: string,
  ): Promise<GitRepositoryState> {
    let defaultBranch: string | null = null;

    try {
      const symbolicHead = await this.gitCommandService.run(
        [
          '-C',
          workspacePath,
          'symbolic-ref',
          '--quiet',
          '--short',
          `refs/remotes/${GIT_REMOTE_NAME}/HEAD`,
        ],
        { operation: 'read default branch' },
      );
      const reference = symbolicHead.stdout.trim();
      const prefix = `${GIT_REMOTE_NAME}/`;
      defaultBranch = reference.startsWith(prefix)
        ? reference.slice(prefix.length)
        : null;
    } catch (error: unknown) {
      if (!this.isMissingGitReference(error)) {
        throw error;
      }
    }

    const branchesResult = await this.gitCommandService.run(
      [
        '-C',
        workspacePath,
        'for-each-ref',
        `--format=%(refname)${GIT_BRANCH_OUTPUT_SEPARATOR}%(objectname)`,
        `refs/remotes/${GIT_REMOTE_NAME}`,
      ],
      { operation: 'list repository branches' },
    );
    const branchPrefix = `refs/remotes/${GIT_REMOTE_NAME}/`;
    const branches = branchesResult.stdout
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line): GitBranchState | null => {
        const [reference, commitSha] = line.split(GIT_BRANCH_OUTPUT_SEPARATOR);

        if (
          !reference?.startsWith(branchPrefix) ||
          reference === `${branchPrefix}HEAD` ||
          !commitSha ||
          !GIT_OBJECT_ID_PATTERN.test(commitSha)
        ) {
          return null;
        }

        const name = reference.slice(branchPrefix.length);

        if (name.length === 0 || name.length > GIT_MAX_BRANCH_NAME_LENGTH) {
          throw new GitIntegrationError(
            'Git branch name cannot be persisted safely',
            GitIntegrationErrorCode.InvalidSource,
          );
        }

        return {
          name,
          commitSha,
          isDefault: name === defaultBranch,
        };
      })
      .filter((branch): branch is GitBranchState => branch !== null)
      .sort((left, right) => left.name.localeCompare(right.name));
    const headCommitSha =
      branches.find((branch) => branch.isDefault)?.commitSha ?? null;
    const sizeBytes = await this.getRepositorySizeBytesByPath(workspacePath);

    return {
      workspacePath,
      defaultBranch,
      headCommitSha,
      sizeBytes,
      branches,
    };
  }

  private async getRepositorySizeBytesByPath(
    workspacePath: string,
  ): Promise<number> {
    const result = await this.gitCommandService.run(
      ['-C', workspacePath, 'count-objects', '-v'],
      { operation: 'measure repository object storage' },
    );
    const values = new Map<string, number>();

    for (const line of result.stdout.split('\n')) {
      const match = line.trim().match(/^([a-z-]+):\s+(\d+)$/u);

      if (!match) {
        continue;
      }

      values.set(match[1], Number.parseInt(match[2], 10));
    }

    const looseObjectKibibytes = values.get('size');
    const packedObjectKibibytes = values.get('size-pack');
    const garbageKibibytes = values.get('size-garbage') ?? 0;

    if (
      looseObjectKibibytes === undefined ||
      packedObjectKibibytes === undefined
    ) {
      throw new GitIntegrationError(
        'Repository object size could not be determined',
        GitIntegrationErrorCode.InvalidWorkspaceState,
      );
    }

    const sizeBytes =
      (looseObjectKibibytes + packedObjectKibibytes + garbageKibibytes) * 1_024;

    if (!Number.isSafeInteger(sizeBytes) || sizeBytes < 0) {
      throw new GitIntegrationError(
        'Repository object size is outside the supported range',
        GitIntegrationErrorCode.InvalidWorkspaceState,
      );
    }

    return sizeBytes;
  }

  private getProtocolArguments(source: GitRepositorySource): string[] {
    const filePolicy = source.kind === GitSourceKind.Local ? 'always' : 'never';

    return [
      '-c',
      `protocol.file.allow=${filePolicy}`,
      '-c',
      'protocol.ext.allow=never',
      '-c',
      'protocol.ssh.allow=never',
      '-c',
      'protocol.git.allow=never',
      '-c',
      'protocol.http.allow=never',
      '-c',
      'protocol.https.allow=always',
    ];
  }

  private assertPathInside(parentPath: string, candidatePath: string): void {
    const relativePath = relative(parentPath, candidatePath);

    if (
      relativePath === '..' ||
      relativePath.startsWith(`..${sep}`) ||
      isAbsolute(relativePath)
    ) {
      throw new GitIntegrationError(
        'Git path is outside the configured root',
        GitIntegrationErrorCode.InvalidSource,
      );
    }
  }

  private async pathExists(path: string): Promise<boolean> {
    try {
      await lstat(path);
      return true;
    } catch (error: unknown) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === 'ENOENT'
      ) {
        return false;
      }

      throw error;
    }
  }

  private async removeTemporaryWorkspace(
    temporaryPath: string,
    expectedParent: string,
  ): Promise<void> {
    this.assertPathInside(expectedParent, temporaryPath);
    await rm(temporaryPath, { recursive: true, force: true });
  }

  private isMissingGitReference(error: unknown): boolean {
    return (
      error instanceof GitCommandError &&
      !error.timedOut &&
      error.exitCode === 1
    );
  }
}
