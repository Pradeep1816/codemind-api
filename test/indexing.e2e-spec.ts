import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import type { App } from 'supertest/types';
import { IndexingProcessor } from '../src/modules/indexing/queue/indexing.processor';
import { IndexingQueue } from '../src/modules/indexing/queue/indexing.queue';
import { GitCommandError } from '../src/modules/repositories/git/git.errors';
import {
  GitBlobContent,
  GitCommitSnapshot,
  GitRepositoryState,
  GitTreeFileEntry,
} from '../src/modules/repositories/git/git.types';
import {
  E2eIdentity,
  inviteAcceptAndLogin,
  registerAndLoginOwner,
} from './support/auth';
import { resetE2eDatabase } from './support/database';
import { createE2eApplication, E2eGitService } from './support/e2e-application';

interface RepositoryResponseBody {
  id: number;
}

interface BranchesResponseBody {
  branches: Array<{
    id: number;
    name: string;
    commitSha: string;
  }>;
}

interface IndexJobResponseBody {
  id: number;
  status: string;
  phase: string;
  targetCommitSha: string;
  attemptCount: number;
  failure: { code: string | null; message: string | null } | null;
  progress: {
    percentage: number;
    totalFiles: number;
    processedFiles: number;
    skippedFiles: number;
    failedFiles: number;
    processedSymbols: number;
    processedDependencies: number;
    currentFile: string | null;
  };
}

interface FixtureSnapshot {
  entries: GitTreeFileEntry[];
  sizeBytes: number;
}

describe('Indexing pipeline (e2e)', () => {
  const initialCommit = '1'.repeat(40);
  const modifiedCommit = '2'.repeat(40);
  const failingCommit = '3'.repeat(40);
  const deletedCommit = '4'.repeat(40);
  const snapshots = new Map<string, FixtureSnapshot>();
  const blobContent = new Map<string, Buffer>();
  const failingBlobIds = new Set<string>();
  let currentCommit = initialCommit;
  let testRoot: string;
  let gitWorkspace: string;
  let app: INestApplication;
  let dataSource: DataSource;
  let httpServer: App;
  let queue: IndexingQueue;
  let processor: IndexingProcessor;
  let owner: E2eIdentity;
  let viewer: E2eIdentity;
  let repositoryId: number;
  let branchId: number;

  beforeAll(async () => {
    testRoot = await mkdtemp(join(tmpdir(), 'codemind-indexing-e2e-'));
    gitWorkspace = join(testRoot, 'git-cache');
    await mkdir(gitWorkspace, { recursive: true });
    process.env.INDEXING_WORKSPACE_ROOT = join(testRoot, 'indexing-workspaces');

    addSnapshot(initialCommit, {
      'src/doctor.repository.ts': `
        export class DoctorRepository {
          findAll(): string[] { return []; }
        }
      `,
      'src/doctor.service.ts': `
        import { DoctorRepository } from './doctor.repository';
        export class DoctorService {
          schedule(): DoctorRepository { return new DoctorRepository(); }
        }
      `,
      'README.md': '# Doctor fixture\n',
      'node_modules/ignored.js': 'throw new Error("must not be indexed");\n',
    });
    addSnapshot(modifiedCommit, {
      'src/doctor.repository.ts': `
        export class DoctorRepository {
          findAll(): string[] { return []; }
        }
      `,
      'src/doctor.service.ts': `
        import { DoctorRepository } from './doctor.repository';
        export class DoctorService {
          schedule(): DoctorRepository { return new DoctorRepository(); }
          cancel(): boolean { return true; }
        }
      `,
      'README.md': '# Doctor fixture\n',
      'node_modules/ignored.js': 'throw new Error("must not be indexed");\n',
    });
    addSnapshot(deletedCommit, {
      'src/doctor.service.ts': `
        export class DoctorService {
          schedule(): boolean { return true; }
          cancel(): boolean { return true; }
        }
      `,
      'README.md': '# Doctor fixture\n',
      'node_modules/ignored.js': 'throw new Error("must not be indexed");\n',
    });
    const failingSource = 'export const unavailable = true;\n';
    addSnapshot(failingCommit, {
      'src/doctor.repository.ts': `
        export class DoctorRepository {
          findAll(): string[] { return []; }
        }
      `,
      'src/doctor.service.ts': `
        import { DoctorRepository } from './doctor.repository';
        export class DoctorService {
          schedule(): DoctorRepository { return new DoctorRepository(); }
          cancel(): boolean { return true; }
        }
      `,
      'src/unavailable.ts': failingSource,
      'README.md': '# Doctor fixture\n',
    });
    failingBlobIds.add(objectId(Buffer.from(failingSource)));

    const gitService: E2eGitService = {
      synchronizeRepository: jest.fn((): Promise<GitRepositoryState> =>
        Promise.resolve({
          workspacePath: gitWorkspace,
          defaultBranch: 'main',
          headCommitSha: currentCommit,
          sizeBytes: snapshots.get(currentCommit)?.sizeBytes ?? 0,
          branches: [
            { name: 'main', commitSha: currentCommit, isDefault: true },
          ],
        }),
      ),
      requireCommit: jest.fn(
        (
          _organizationId: string,
          _repositoryId: number,
          commitSha: string,
        ): Promise<GitCommitSnapshot> => {
          if (!snapshots.has(commitSha)) {
            return Promise.reject(new Error('Unknown fixture commit'));
          }

          return Promise.resolve({ workspacePath: gitWorkspace, commitSha });
        },
      ),
      listCommitFiles: jest.fn(
        (
          _organizationId: string,
          _repositoryId: number,
          commitSha: string,
        ): Promise<GitTreeFileEntry[]> => {
          const snapshot = snapshots.get(commitSha);

          if (!snapshot) {
            return Promise.reject(new Error('Unknown fixture commit'));
          }

          return Promise.resolve(snapshot.entries);
        },
      ),
      readBlob: jest.fn(
        (
          _organizationId: string,
          _repositoryId: number,
          _commitSha: string,
          blobId: string,
        ): Promise<GitBlobContent> => {
          if (failingBlobIds.has(blobId)) {
            return Promise.reject(
              new GitCommandError('read fixture blob', 128, null, false),
            );
          }

          const content = blobContent.get(blobId);

          if (!content) {
            return Promise.reject(new Error('Unknown fixture blob'));
          }

          return Promise.resolve({ objectId: blobId, content });
        },
      ),
    };

    ({ app, dataSource, httpServer } = await createE2eApplication(gitService));
    await resetE2eDatabase(dataSource);
    queue = app.get(IndexingQueue);
    processor = app.get(IndexingProcessor);

    const identity = Date.now().toString(36);
    owner = await registerAndLoginOwner(httpServer, `index-${identity}`);
    viewer = await inviteAcceptAndLogin(
      httpServer,
      owner.accessToken,
      `index-viewer-${identity}`,
      'VIEWER',
    );
    const repositoryResponse = await request(httpServer)
      .post('/api/v1/repositories')
      .set(authorization(owner.accessToken))
      .send({
        name: 'Indexing E2E Repository',
        remoteUrl: 'https://github.com/codemind-e2e/indexing.git',
        defaultBranch: 'main',
      })
      .expect(201);
    repositoryId = (repositoryResponse.body as RepositoryResponseBody).id;
    branchId = await synchronizeAndReadMainBranch();
  });

  afterAll(async () => {
    try {
      if (dataSource?.isInitialized) {
        await resetE2eDatabase(dataSource);
      }
    } finally {
      if (app) {
        await app.close();
      }

      if (testRoot) {
        await rm(testRoot, { recursive: true, force: true });
      }
    }
  });

  it('enforces indexing authorization without exposing another capability', async () => {
    await request(httpServer)
      .post(`/api/v1/repositories/${repositoryId}/index-jobs`)
      .set(authorization(viewer.accessToken))
      .send({ branchId, mode: 'incremental' })
      .expect(403);
  });

  it('indexes an initial commit, skips unchanged content, and processes one modified file', async () => {
    const initial = await queueJob('incremental');
    const heapUsedBefore = process.memoryUsage().heapUsed;
    const startedAt = performance.now();
    await processExpectedJob(initial.id, 'initial-worker');
    const elapsedMilliseconds = performance.now() - startedAt;
    const heapGrowthBytes = Math.max(
      0,
      process.memoryUsage().heapUsed - heapUsedBefore,
    );
    const initialResult = await readJob(initial.id);
    const filesPerSecond =
      initialResult.progress.totalFiles / (elapsedMilliseconds / 1_000);

    expect(initialResult).toMatchObject({
      status: 'succeeded',
      phase: 'finished',
      targetCommitSha: initialCommit,
      attemptCount: 1,
      failure: null,
      progress: {
        percentage: 100,
        totalFiles: 3,
        processedFiles: 2,
        skippedFiles: 1,
        failedFiles: 0,
        currentFile: null,
      },
    });
    expect(initialResult.progress.processedSymbols).toBeGreaterThanOrEqual(4);
    expect(initialResult.progress.processedDependencies).toBeGreaterThanOrEqual(
      1,
    );
    expect(elapsedMilliseconds).toBeLessThan(10_000);
    expect(filesPerSecond).toBeGreaterThan(0);
    expect(heapGrowthBytes).toBeLessThan(256 * 1024 * 1024);
    await expectCurrentMetadataCounts(4, 3);

    const unchanged = await queueJob('incremental');
    await processExpectedJob(unchanged.id, 'unchanged-worker');
    await expect(readJob(unchanged.id)).resolves.toMatchObject({
      status: 'succeeded',
      targetCommitSha: initialCommit,
      progress: {
        totalFiles: 3,
        processedFiles: 0,
        skippedFiles: 3,
        failedFiles: 0,
        processedSymbols: 0,
        processedDependencies: 0,
      },
    });

    currentCommit = modifiedCommit;
    await synchronizeAndReadMainBranch();
    const modified = await queueJob('incremental');
    await processExpectedJob(modified.id, 'modified-worker');
    await expect(readJob(modified.id)).resolves.toMatchObject({
      status: 'succeeded',
      targetCommitSha: modifiedCommit,
      progress: {
        totalFiles: 3,
        processedFiles: 1,
        skippedFiles: 2,
        failedFiles: 0,
        processedSymbols: 3,
        processedDependencies: 2,
      },
    });
    await expectCurrentMetadataCounts(5, 3);

    currentCommit = deletedCommit;
    await synchronizeAndReadMainBranch();
    const deleted = await queueJob('incremental');
    await processExpectedJob(deleted.id, 'deleted-worker');
    await expect(readJob(deleted.id)).resolves.toMatchObject({
      status: 'succeeded',
      targetCommitSha: deletedCommit,
      progress: {
        totalFiles: 2,
        processedFiles: 1,
        skippedFiles: 1,
        failedFiles: 0,
      },
    });
    const deletedRows = await dataSource.query<Array<{ status: string }>>(
      `SELECT status
       FROM indexed_files
       WHERE repository_id = $1
         AND branch_id = $2
         AND path = 'src/doctor.repository.ts'`,
      [repositoryId, branchId],
    );
    expect(deletedRows[0]?.status).toBe('deleted');

    const full = await queueJob('full');
    await processExpectedJob(full.id, 'full-worker');
    await expect(readJob(full.id)).resolves.toMatchObject({
      status: 'succeeded',
      targetCommitSha: deletedCommit,
      progress: {
        totalFiles: 2,
        processedFiles: 1,
        skippedFiles: 1,
        failedFiles: 0,
      },
    });
  });

  it('allows only one concurrent worker claim and cooperatively cancels it', async () => {
    const queued = await queueJob('incremental');
    const claims = await Promise.all([
      queue.take('concurrent-worker-a'),
      queue.take('concurrent-worker-b'),
    ]);
    const claimed = claims.find((candidate) => candidate !== null);

    expect(claims.filter((candidate) => candidate !== null)).toHaveLength(1);
    expect(claimed?.job.id).toBe(queued.id);

    await request(httpServer)
      .post(
        `/api/v1/repositories/${repositoryId}/index-jobs/${queued.id}/cancel`,
      )
      .set(authorization(owner.accessToken))
      .expect(200);
    await processor.process(claimed!, () => false);
    await expect(readJob(queued.id)).resolves.toMatchObject({
      status: 'cancelled',
      phase: 'finished',
      progress: { currentFile: null },
    });
  });

  it('recovers an expired worker lease and completes the next attempt', async () => {
    const queued = await queueJob('incremental');
    const claimed = await queue.take('crashed-worker');
    expect(claimed?.job.id).toBe(queued.id);
    await dataSource.query(
      `UPDATE index_jobs
       SET lease_expires_at = NOW() - INTERVAL '1 second'
       WHERE id = $1`,
      [queued.id],
    );

    const recovered = await queue.recoverExpired();
    expect(recovered.map((job) => job.id)).toContain(queued.id);
    await expect(readJob(queued.id)).resolves.toMatchObject({
      status: 'queued',
      attemptCount: 1,
      failure: {
        code: 'lease_expired',
      },
    });

    await processExpectedJob(queued.id, 'recovery-worker');
    await expect(readJob(queued.id)).resolves.toMatchObject({
      status: 'succeeded',
      attemptCount: 2,
    });
  });

  it('retries a transient Git failure up to the configured attempt limit', async () => {
    currentCommit = failingCommit;
    await synchronizeAndReadMainBranch();
    const queued = await queueJob('incremental');
    const consoleError = jest.spyOn(console, 'error').mockImplementation();

    try {
      for (let attempt = 1; attempt <= 3; attempt += 1) {
        await processExpectedJob(queued.id, `retry-worker-${attempt}`);
      }
    } finally {
      consoleError.mockRestore();
    }

    const result = await readJob(queued.id);
    expect(result).toMatchObject({
      status: 'failed',
      phase: 'finished',
      attemptCount: 3,
      failure: {
        code: 'git_command_failed',
        message: 'Git operation failed: read fixture blob',
      },
    });
    const errorRows = await dataSource.query<Array<{ count: string }>>(
      'SELECT COUNT(*) AS count FROM indexing_errors WHERE index_job_id = $1',
      [queued.id],
    );
    expect(Number(errorRows[0]?.count)).toBe(3);
  });

  function addSnapshot(
    commitSha: string,
    files: Readonly<Record<string, string>>,
  ): void {
    let sizeBytes = 0;
    const entries = Object.entries(files).map(([path, source]) => {
      const content = Buffer.from(source);
      const blobId = objectId(content);
      blobContent.set(blobId, content);
      sizeBytes += content.length;

      return {
        mode: '100644',
        objectId: blobId,
        sizeBytes: content.length,
        path,
      };
    });
    snapshots.set(commitSha, { entries, sizeBytes });
  }

  async function synchronizeAndReadMainBranch(): Promise<number> {
    const response = await request(httpServer)
      .post(`/api/v1/repositories/${repositoryId}/branches/sync`)
      .set(authorization(owner.accessToken))
      .expect(201);
    const body = response.body as BranchesResponseBody;
    const main = body.branches.find((branch) => branch.name === 'main');

    if (!main) {
      throw new Error('Main fixture branch was not synchronized');
    }

    expect(main.commitSha).toBe(currentCommit);
    return main.id;
  }

  async function queueJob(mode: 'incremental' | 'full') {
    const response = await request(httpServer)
      .post(`/api/v1/repositories/${repositoryId}/index-jobs`)
      .set(authorization(owner.accessToken))
      .send({ branchId, mode })
      .expect(202);
    const body = response.body as IndexJobResponseBody;
    expect(body.status).toBe('queued');

    return body;
  }

  async function processExpectedJob(
    jobId: number,
    workerId: string,
  ): Promise<void> {
    const claimed = await queue.take(workerId);
    expect(claimed?.job.id).toBe(jobId);

    if (!claimed) {
      throw new Error(`Index job ${jobId} was not claimable`);
    }

    await processor.process(claimed, () => false);
  }

  async function readJob(jobId: number): Promise<IndexJobResponseBody> {
    const response = await request(httpServer)
      .get(`/api/v1/repositories/${repositoryId}/index-jobs/${jobId}`)
      .set(authorization(owner.accessToken))
      .expect(200);

    return response.body as IndexJobResponseBody;
  }

  async function expectCurrentMetadataCounts(
    symbols: number,
    dependencies: number,
  ): Promise<void> {
    const symbolRows = await dataSource.query<Array<{ count: string }>>(
      `SELECT COUNT(*) AS count
       FROM code_symbols symbol
       INNER JOIN indexed_files file
         ON file.id = symbol.indexed_file_id
        AND file.current_file_hash_id = symbol.file_hash_id
       WHERE file.repository_id = $1
         AND file.branch_id = $2
         AND file.status = 'active'`,
      [repositoryId, branchId],
    );
    const dependencyRows = await dataSource.query<Array<{ count: string }>>(
      `SELECT COUNT(*) AS count
       FROM code_dependencies dependency
       INNER JOIN indexed_files file
         ON file.id = dependency.source_indexed_file_id
        AND file.current_file_hash_id = dependency.source_file_hash_id
       WHERE file.repository_id = $1
         AND file.branch_id = $2
         AND file.status = 'active'`,
      [repositoryId, branchId],
    );

    expect(Number(symbolRows[0]?.count)).toBe(symbols);
    expect(Number(dependencyRows[0]?.count)).toBe(dependencies);
  }
});

function objectId(content: Buffer): string {
  return createHash('sha1').update(content).digest('hex');
}

function authorization(accessToken: string): { Authorization: string } {
  return { Authorization: `Bearer ${accessToken}` };
}
