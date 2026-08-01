import { lstat, mkdir, realpath, rm } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { Inject, Injectable } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import indexingConfig from '../../../config/indexing.config';
import {
  GIT_OBJECT_ID_PATTERN,
  ORGANIZATION_ID_PATTERN,
} from '../../repositories/git/git.constants';
import { GitService } from '../../repositories/git/git.service';
import {
  IndexingWorkspaceError,
  IndexingWorkspaceErrorCode,
} from './indexing-workspace.errors';
import {
  IndexingWorkspace,
  IndexingWorkspaceIdentity,
} from './indexing-workspace.types';

@Injectable()
export class IndexingWorkspaceService {
  constructor(
    @Inject(indexingConfig.KEY)
    private readonly configuration: ConfigType<typeof indexingConfig>,
    private readonly gitService: GitService,
  ) {}

  /**
   * Prepares an isolated, service-owned directory tree for one immutable index
   * job. This method verifies that the target commit exists but intentionally
   * leaves source materialization to the file-discovery milestone.
   */
  async prepare(
    identity: IndexingWorkspaceIdentity,
  ): Promise<IndexingWorkspace> {
    this.validateIdentity(identity);

    const gitSnapshot = await this.gitService.requireCommit(
      identity.organizationId,
      identity.repositoryId,
      identity.targetCommitSha,
    );
    const workspaceRoot = await this.getCanonicalWorkspaceRoot();
    this.assertPathsDoNotOverlap(workspaceRoot, gitSnapshot.workspacePath);
    const jobPath = await this.createJobPath(workspaceRoot, identity);

    const sourcePath = await this.createOwnedDirectory(jobPath, 'source');
    const metadataPath = await this.createOwnedDirectory(jobPath, 'metadata');
    const cachePath = await this.createOwnedDirectory(jobPath, 'cache');

    return {
      rootPath: jobPath,
      sourcePath,
      metadataPath,
      cachePath,
      gitObjectCachePath: gitSnapshot.workspacePath,
      targetCommitSha: gitSnapshot.commitSha,
    };
  }

  /** Removes only the validated job directory from the indexing root. */
  async clean(identity: IndexingWorkspaceIdentity): Promise<void> {
    this.validateIdentity(identity);

    if (!(await this.pathExists(this.configuration.workspaceRoot))) {
      return;
    }

    const workspaceRoot = await realpath(this.configuration.workspaceRoot);
    const jobPath = this.resolveJobPath(workspaceRoot, identity);

    if (!(await this.pathExists(jobPath))) {
      return;
    }

    const jobState = await lstat(jobPath);

    if (!jobState.isDirectory() || jobState.isSymbolicLink()) {
      throw new IndexingWorkspaceError(
        'Indexing workspace is not a service-owned directory',
        IndexingWorkspaceErrorCode.InvalidWorkspaceState,
      );
    }

    const canonicalJobPath = await realpath(jobPath);
    this.assertPathInside(workspaceRoot, canonicalJobPath);
    await rm(canonicalJobPath, { recursive: true, force: true });
  }

  /** Clears stale attempt data and creates a new empty workspace tree. */
  async reset(identity: IndexingWorkspaceIdentity): Promise<IndexingWorkspace> {
    await this.clean(identity);

    return this.prepare(identity);
  }

  private validateIdentity(identity: IndexingWorkspaceIdentity): void {
    if (
      !ORGANIZATION_ID_PATTERN.test(identity.organizationId) ||
      !Number.isSafeInteger(identity.repositoryId) ||
      identity.repositoryId < 1 ||
      !Number.isSafeInteger(identity.jobId) ||
      identity.jobId < 1 ||
      !GIT_OBJECT_ID_PATTERN.test(identity.targetCommitSha)
    ) {
      throw new IndexingWorkspaceError(
        'Indexing workspace identity is invalid',
        IndexingWorkspaceErrorCode.InvalidIdentity,
      );
    }
  }

  private async getCanonicalWorkspaceRoot(): Promise<string> {
    await mkdir(this.configuration.workspaceRoot, {
      recursive: true,
      mode: 0o700,
    });

    return realpath(this.configuration.workspaceRoot);
  }

  private async createJobPath(
    workspaceRoot: string,
    identity: IndexingWorkspaceIdentity,
  ): Promise<string> {
    let parentPath = workspaceRoot;

    for (const component of [
      identity.organizationId,
      String(identity.repositoryId),
      String(identity.jobId),
    ]) {
      const candidatePath = resolve(parentPath, component);
      this.assertPathInside(workspaceRoot, candidatePath);
      await mkdir(candidatePath, { recursive: true, mode: 0o700 });

      const candidateState = await lstat(candidatePath);

      if (!candidateState.isDirectory() || candidateState.isSymbolicLink()) {
        throw new IndexingWorkspaceError(
          'Indexing workspace path is not a service-owned directory',
          IndexingWorkspaceErrorCode.InvalidWorkspaceState,
        );
      }

      parentPath = await realpath(candidatePath);
      this.assertPathInside(workspaceRoot, parentPath);
    }

    return parentPath;
  }

  private async createOwnedDirectory(
    jobPath: string,
    name: 'source' | 'metadata' | 'cache',
  ): Promise<string> {
    const directoryPath = resolve(jobPath, name);
    this.assertPathInside(jobPath, directoryPath);
    await mkdir(directoryPath, { recursive: true, mode: 0o700 });

    const directoryState = await lstat(directoryPath);

    if (!directoryState.isDirectory() || directoryState.isSymbolicLink()) {
      throw new IndexingWorkspaceError(
        'Indexing workspace child is not a service-owned directory',
        IndexingWorkspaceErrorCode.InvalidWorkspaceState,
      );
    }

    const canonicalPath = await realpath(directoryPath);
    this.assertPathInside(jobPath, canonicalPath);

    return canonicalPath;
  }

  private resolveJobPath(
    workspaceRoot: string,
    identity: IndexingWorkspaceIdentity,
  ): string {
    const jobPath = resolve(
      workspaceRoot,
      identity.organizationId,
      String(identity.repositoryId),
      String(identity.jobId),
    );
    this.assertPathInside(workspaceRoot, jobPath);

    return jobPath;
  }

  private assertPathsDoNotOverlap(
    jobPath: string,
    gitObjectCachePath: string,
  ): void {
    if (
      this.isPathInsideOrEqual(jobPath, gitObjectCachePath) ||
      this.isPathInsideOrEqual(gitObjectCachePath, jobPath)
    ) {
      throw new IndexingWorkspaceError(
        'Indexing and Git workspace paths must not overlap',
        IndexingWorkspaceErrorCode.UnsafePath,
      );
    }
  }

  private assertPathInside(parentPath: string, candidatePath: string): void {
    if (!this.isPathInside(parentPath, candidatePath)) {
      throw new IndexingWorkspaceError(
        'Indexing workspace path escapes its configured root',
        IndexingWorkspaceErrorCode.UnsafePath,
      );
    }
  }

  private isPathInside(parentPath: string, candidatePath: string): boolean {
    const relativePath = relative(parentPath, candidatePath);

    return (
      relativePath.length > 0 &&
      relativePath !== '..' &&
      !relativePath.startsWith(`..${sep}`) &&
      !isAbsolute(relativePath)
    );
  }

  private isPathInsideOrEqual(
    parentPath: string,
    candidatePath: string,
  ): boolean {
    return (
      resolve(parentPath) === resolve(candidatePath) ||
      this.isPathInside(parentPath, candidatePath)
    );
  }

  private async pathExists(path: string): Promise<boolean> {
    try {
      await lstat(path);
      return true;
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return false;
      }

      throw error;
    }
  }
}
