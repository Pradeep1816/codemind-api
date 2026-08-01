import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import type { App } from 'supertest/types';
import { GitCommandError } from '../src/modules/repositories/git/git.errors';
import { GitService } from '../src/modules/repositories/git/git.service';
import type { GitRepositoryState } from '../src/modules/repositories/git/git.types';
import {
  E2eIdentity,
  inviteAcceptAndLogin,
  registerAndLoginOwner,
} from './support/auth';
import { createE2eApplication, E2eGitService } from './support/e2e-application';
import { resetE2eDatabase } from './support/database';

interface RepositoryResponseBody {
  id: number;
  name: string;
  provider: string;
  remoteUrl: string;
  defaultBranch: string | null;
  status: string;
}

interface RepositoryListResponseBody {
  data: RepositoryResponseBody[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

interface RepositoryStatusResponseBody {
  repositoryId: number;
  sync: {
    status: string;
    lastAttemptedAt: string | null;
    lastSyncedAt: string | null;
  };
  branches: {
    total: number;
    active: number;
    deleted: number;
  };
  repositorySizeBytes: number | null;
}

interface RepositoryMemberResponseBody {
  user: {
    id: string;
  };
}

interface RepositoryBranchesResponseBody {
  repositoryId: number;
  defaultBranch: string | null;
  branches: Array<{
    name: string;
    status: string;
  }>;
}

describe('Repository API (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let httpServer: App;
  let tenantAOwner: E2eIdentity;
  let tenantBOwner: E2eIdentity;
  let developer: E2eIdentity;
  let viewer: E2eIdentity;
  let gitService: E2eGitService & {
    synchronizeRepository: jest.MockedFunction<
      GitService['synchronizeRepository']
    >;
  };
  let repositorySequence = 0;

  beforeAll(async () => {
    gitService = {
      synchronizeRepository: jest.fn(),
    };

    ({ app, dataSource, httpServer } = await createE2eApplication(gitService));
    await resetE2eDatabase(dataSource);

    const runIdentity = Date.now().toString(36);
    tenantAOwner = await registerAndLoginOwner(httpServer, `${runIdentity}-a`);
    tenantBOwner = await registerAndLoginOwner(httpServer, `${runIdentity}-b`);
    developer = await inviteAcceptAndLogin(
      httpServer,
      tenantAOwner.accessToken,
      `${runIdentity}-developer`,
      'DEVELOPER',
    );
    viewer = await inviteAcceptAndLogin(
      httpServer,
      tenantAOwner.accessToken,
      `${runIdentity}-viewer`,
      'VIEWER',
    );
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
    }
  });

  it('requires authentication and validates repository input', async () => {
    await request(httpServer)
      .post('/api/v1/repositories')
      .send(createRepositoryInput('unauthenticated'))
      .expect(401);

    await request(httpServer)
      .post('/api/v1/repositories')
      .set(authorization(tenantAOwner.accessToken))
      .send({
        ...createRepositoryInput('unknown-field'),
        organizationId: tenantBOwner.organizationId,
      })
      .expect(400);

    await request(httpServer)
      .post('/api/v1/repositories')
      .set(authorization(tenantAOwner.accessToken))
      .send({
        name: 'Credential URL',
        remoteUrl: 'https://username:secret@github.com/codemind/private.git',
      })
      .expect(400);
  });

  it('creates, lists, reads, updates, and deletes an organization repository', async () => {
    const input = createRepositoryInput('crud');
    const createResponse = await request(httpServer)
      .post('/api/v1/repositories')
      .set(authorization(tenantAOwner.accessToken))
      .send(input)
      .expect(201);
    const repository = createResponse.body as RepositoryResponseBody;

    expect(repository).toMatchObject({
      name: input.name,
      provider: 'github',
      remoteUrl: input.remoteUrl,
      defaultBranch: 'main',
      status: 'active',
    });

    await request(httpServer)
      .post('/api/v1/repositories')
      .set(authorization(tenantAOwner.accessToken))
      .send({ ...input, remoteUrl: `${input.remoteUrl}/` })
      .expect(409);

    const listResponse = await request(httpServer)
      .get('/api/v1/repositories')
      .query({ search: 'crud', page: 1, limit: 10 })
      .set(authorization(tenantAOwner.accessToken))
      .expect(200);
    const list = listResponse.body as RepositoryListResponseBody;

    expect(list.data).toEqual([
      expect.objectContaining({ id: repository.id, name: input.name }),
    ]);
    expect(list.pagination).toEqual({
      page: 1,
      limit: 10,
      total: 1,
      totalPages: 1,
    });

    await request(httpServer)
      .get(`/api/v1/repositories/${repository.id}`)
      .set(authorization(tenantAOwner.accessToken))
      .expect(200)
      .expect(({ body }) => {
        expect(body).toMatchObject({ id: repository.id, name: input.name });
      });

    await request(httpServer)
      .patch(`/api/v1/repositories/${repository.id}`)
      .set(authorization(tenantAOwner.accessToken))
      .send({ name: 'CRUD Repository Updated', status: 'disabled' })
      .expect(200)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          id: repository.id,
          name: 'CRUD Repository Updated',
          status: 'disabled',
        });
      });

    await request(httpServer)
      .delete(`/api/v1/repositories/${repository.id}`)
      .set(authorization(tenantAOwner.accessToken))
      .expect(204);

    await request(httpServer)
      .get(`/api/v1/repositories/${repository.id}`)
      .set(authorization(tenantAOwner.accessToken))
      .expect(404);
  });

  it('does not expose repositories across organization boundaries', async () => {
    const repository = await createRepository(
      tenantAOwner.accessToken,
      'tenant-isolation',
    );

    const tenantBListResponse = await request(httpServer)
      .get('/api/v1/repositories')
      .set(authorization(tenantBOwner.accessToken))
      .expect(200);
    const tenantBList = tenantBListResponse.body as RepositoryListResponseBody;

    expect(tenantBList.data).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: repository.id })]),
    );

    await request(httpServer)
      .get(`/api/v1/repositories/${repository.id}`)
      .set(authorization(tenantBOwner.accessToken))
      .expect(404);

    await request(httpServer)
      .patch(`/api/v1/repositories/${repository.id}`)
      .set(authorization(tenantBOwner.accessToken))
      .send({ name: 'Cross-tenant update' })
      .expect(404);

    await request(httpServer)
      .get(`/api/v1/repositories/${repository.id}/members`)
      .set(authorization(tenantBOwner.accessToken))
      .expect(404);

    await request(httpServer)
      .get(`/api/v1/repositories/${repository.id}/branches`)
      .set(authorization(tenantBOwner.accessToken))
      .expect(404);

    await request(httpServer)
      .get(`/api/v1/repositories/${repository.id}/status`)
      .set(authorization(tenantBOwner.accessToken))
      .expect(404);

    await request(httpServer)
      .delete(`/api/v1/repositories/${repository.id}`)
      .set(authorization(tenantBOwner.accessToken))
      .expect(404);
  });

  it('enforces the repository permission matrix', async () => {
    const developerRepository = await createRepository(
      developer.accessToken,
      'developer-permissions',
    );

    await request(httpServer)
      .patch(`/api/v1/repositories/${developerRepository.id}`)
      .set(authorization(developer.accessToken))
      .send({ name: 'Developer Updated Repository' })
      .expect(200);

    await request(httpServer)
      .delete(`/api/v1/repositories/${developerRepository.id}`)
      .set(authorization(developer.accessToken))
      .expect(403);

    await request(httpServer)
      .post(`/api/v1/repositories/${developerRepository.id}/members`)
      .set(authorization(developer.accessToken))
      .send({ userId: viewer.userId })
      .expect(403);

    await request(httpServer)
      .get(`/api/v1/repositories/${developerRepository.id}`)
      .set(authorization(viewer.accessToken))
      .expect(200);

    await request(httpServer)
      .get(`/api/v1/repositories/${developerRepository.id}/status`)
      .set(authorization(viewer.accessToken))
      .expect(200);

    await request(httpServer)
      .post('/api/v1/repositories')
      .set(authorization(viewer.accessToken))
      .send(createRepositoryInput('viewer-create'))
      .expect(403);

    await request(httpServer)
      .patch(`/api/v1/repositories/${developerRepository.id}`)
      .set(authorization(viewer.accessToken))
      .send({ name: 'Viewer Update Attempt' })
      .expect(403);

    await request(httpServer)
      .delete(`/api/v1/repositories/${developerRepository.id}`)
      .set(authorization(viewer.accessToken))
      .expect(403);

    await request(httpServer)
      .post(`/api/v1/repositories/${developerRepository.id}/branches/sync`)
      .set(authorization(viewer.accessToken))
      .expect(403);
  });

  it('adds, lists, and removes repository members', async () => {
    const repository = await createRepository(
      tenantAOwner.accessToken,
      'membership',
    );

    await request(httpServer)
      .post(`/api/v1/repositories/${repository.id}/members`)
      .set(authorization(tenantAOwner.accessToken))
      .send({ userId: developer.userId })
      .expect(201)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          user: {
            id: developer.userId,
            email: developer.email,
            status: 'active',
            roles: ['DEVELOPER'],
          },
          addedByUserId: tenantAOwner.userId,
        });
      });

    await request(httpServer)
      .post(`/api/v1/repositories/${repository.id}/members`)
      .set(authorization(tenantAOwner.accessToken))
      .send({ userId: developer.userId })
      .expect(409);

    const membersResponse = await request(httpServer)
      .get(`/api/v1/repositories/${repository.id}/members`)
      .set(authorization(tenantAOwner.accessToken))
      .expect(200);
    const members = membersResponse.body as RepositoryMemberResponseBody[];

    expect(members).toHaveLength(1);
    expect(members[0]?.user.id).toBe(developer.userId);

    await request(httpServer)
      .delete(
        `/api/v1/repositories/${repository.id}/members/${developer.userId}`,
      )
      .set(authorization(tenantAOwner.accessToken))
      .expect(204);

    await request(httpServer)
      .delete(
        `/api/v1/repositories/${repository.id}/members/${developer.userId}`,
      )
      .set(authorization(tenantAOwner.accessToken))
      .expect(404);
  });

  it('persists successful and failed synchronization health', async () => {
    const repository = await createRepository(
      tenantAOwner.accessToken,
      'sync-health',
    );

    const initialStatusResponse = await request(httpServer)
      .get(`/api/v1/repositories/${repository.id}/status`)
      .set(authorization(tenantAOwner.accessToken))
      .expect(200);
    const initialStatus =
      initialStatusResponse.body as RepositoryStatusResponseBody;

    expect(initialStatus).toMatchObject({
      repositoryId: repository.id,
      sync: {
        status: 'never',
        lastAttemptedAt: null,
        lastSyncedAt: null,
      },
      branches: { total: 0, active: 0, deleted: 0 },
      repositorySizeBytes: null,
    });

    const gitState: GitRepositoryState = {
      workspacePath: '/tmp/codemind-e2e-repository',
      defaultBranch: 'main',
      headCommitSha: '1111111111111111111111111111111111111111',
      sizeBytes: 4096,
      branches: [
        {
          name: 'main',
          commitSha: '1111111111111111111111111111111111111111',
          isDefault: true,
        },
        {
          name: 'feature/e2e',
          commitSha: '2222222222222222222222222222222222222222',
          isDefault: false,
        },
      ],
    };
    gitService.synchronizeRepository.mockResolvedValueOnce(gitState);

    const syncResponse = await request(httpServer)
      .post(`/api/v1/repositories/${repository.id}/branches/sync`)
      .set(authorization(developer.accessToken))
      .expect(201);
    const syncBody = syncResponse.body as RepositoryBranchesResponseBody;

    expect(syncBody).toMatchObject({
      repositoryId: repository.id,
      defaultBranch: 'main',
    });
    expect(syncBody.branches).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'main', status: 'active' }),
        expect.objectContaining({
          name: 'feature/e2e',
          status: 'active',
        }),
      ]),
    );

    const successfulStatusResponse = await request(httpServer)
      .get(`/api/v1/repositories/${repository.id}/status`)
      .set(authorization(viewer.accessToken))
      .expect(200);
    const successfulStatus =
      successfulStatusResponse.body as RepositoryStatusResponseBody;

    expect(successfulStatus.sync.status).toBe('succeeded');
    expect(successfulStatus.sync.lastAttemptedAt).not.toBeNull();
    expect(successfulStatus.sync.lastSyncedAt).not.toBeNull();
    expect(successfulStatus.branches).toEqual({
      total: 2,
      active: 2,
      deleted: 0,
    });
    expect(successfulStatus.repositorySizeBytes).toBe(4096);

    gitService.synchronizeRepository.mockRejectedValueOnce(
      new GitCommandError('fetch', 128, null, false),
    );

    await request(httpServer)
      .post(`/api/v1/repositories/${repository.id}/branches/sync`)
      .set(authorization(developer.accessToken))
      .expect(503);

    const failedStatusResponse = await request(httpServer)
      .get(`/api/v1/repositories/${repository.id}/status`)
      .set(authorization(tenantAOwner.accessToken))
      .expect(200);
    const failedStatus =
      failedStatusResponse.body as RepositoryStatusResponseBody;

    expect(failedStatus.sync.status).toBe('failed');
    expect(failedStatus.sync.lastAttemptedAt).not.toBeNull();
    expect(failedStatus.sync.lastSyncedAt).toBe(
      successfulStatus.sync.lastSyncedAt,
    );
    expect(failedStatus.repositorySizeBytes).toBe(4096);
    expect(failedStatus.branches.total).toBe(2);
  });

  async function createRepository(
    accessToken: string,
    label: string,
  ): Promise<RepositoryResponseBody> {
    const response = await request(httpServer)
      .post('/api/v1/repositories')
      .set(authorization(accessToken))
      .send(createRepositoryInput(label))
      .expect(201);

    return response.body as RepositoryResponseBody;
  }

  function createRepositoryInput(label: string): {
    name: string;
    remoteUrl: string;
    defaultBranch: string;
  } {
    repositorySequence += 1;

    return {
      name: `E2E ${label} ${repositorySequence}`,
      remoteUrl: `https://github.com/codemind-e2e/${label}-${repositorySequence}.git`,
      defaultBranch: 'main',
    };
  }
});

function authorization(accessToken: string): { Authorization: string } {
  return { Authorization: `Bearer ${accessToken}` };
}
