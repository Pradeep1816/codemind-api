import { NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { DataSource, EntityManager } from 'typeorm';
import {
  AuthSessionRotationResult,
  AuthSessionsService,
} from './auth-sessions.service';
import { AuthSessionEntity } from './entities/auth-session.entity';
import { AuthSessionRepository } from './repositories/auth-session.repository';

describe('AuthSessionsService', () => {
  const manager = {} as EntityManager;
  const currentHash = createHash('sha256')
    .update('current-refresh-token')
    .digest('hex');

  function createDataSource(): DataSource {
    return {
      transaction: jest
        .fn()
        .mockImplementation(
          async (
            operation: (transactionManager: EntityManager) => Promise<unknown>,
          ) => operation(manager),
        ),
    } as unknown as DataSource;
  }

  function createSession(): AuthSessionEntity {
    return {
      id: 'session-id',
      userId: 'user-id',
      organizationId: 'organization-id',
      refreshTokenHash: currentHash,
      tokenVersion: 1,
      expiresAt: new Date(Date.now() + 60_000),
      lastUsedAt: null,
      revokedAt: null,
      revokeReason: null,
    } as AuthSessionEntity;
  }

  it('rotates the current refresh-token hash and version atomically', async () => {
    const session = createSession();
    const save = jest.fn().mockResolvedValue(session);
    const repository = {
      findByIdForUpdate: jest.fn().mockResolvedValue(session),
      save,
    } as unknown as AuthSessionRepository;
    const service = new AuthSessionsService(createDataSource(), repository);
    const nextHash = createHash('sha256')
      .update('next-refresh-token')
      .digest('hex');
    const nextExpiresAt = new Date(Date.now() + 120_000);

    const result = await service.rotate({
      sessionId: session.id,
      userId: session.userId,
      organizationId: session.organizationId,
      tokenVersion: 1,
      presentedTokenHash: currentHash,
      nextTokenHash: nextHash,
      nextExpiresAt,
    });

    expect(result).toBe(AuthSessionRotationResult.Rotated);
    expect(session.refreshTokenHash).toBe(nextHash);
    expect(session.tokenVersion).toBe(2);
    expect(session.expiresAt).toBe(nextExpiresAt);
    expect(session.lastUsedAt).toBeInstanceOf(Date);
    expect(save).toHaveBeenCalledWith(session, manager);
  });

  it('commits session revocation when an older token is reused', async () => {
    const session = createSession();
    session.tokenVersion = 2;
    const save = jest.fn().mockResolvedValue(session);
    const repository = {
      findByIdForUpdate: jest.fn().mockResolvedValue(session),
      save,
    } as unknown as AuthSessionRepository;
    const service = new AuthSessionsService(createDataSource(), repository);

    const result = await service.rotate({
      sessionId: session.id,
      userId: session.userId,
      organizationId: session.organizationId,
      tokenVersion: 1,
      presentedTokenHash: currentHash,
      nextTokenHash: 'f'.repeat(64),
      nextExpiresAt: new Date(Date.now() + 120_000),
    });

    expect(result).toBe(AuthSessionRotationResult.Reused);
    expect(session.revokedAt).toBeInstanceOf(Date);
    expect(session.revokeReason).toBe('refresh_token_reuse');
    expect(save).toHaveBeenCalledWith(session, manager);
  });

  it('does not update an expired session', async () => {
    const session = createSession();
    session.expiresAt = new Date(Date.now() - 1);
    const save = jest.fn();
    const repository = {
      findByIdForUpdate: jest.fn().mockResolvedValue(session),
      save,
    } as unknown as AuthSessionRepository;
    const service = new AuthSessionsService(createDataSource(), repository);

    const result = await service.rotate({
      sessionId: session.id,
      userId: session.userId,
      organizationId: session.organizationId,
      tokenVersion: 1,
      presentedTokenHash: currentHash,
      nextTokenHash: 'f'.repeat(64),
      nextExpiresAt: new Date(Date.now() + 120_000),
    });

    expect(result).toBe(AuthSessionRotationResult.Invalid);
    expect(save).not.toHaveBeenCalled();
  });

  it('lists only repository-provided active sessions and marks the current one', async () => {
    const current = {
      ...createSession(),
      createdAt: new Date('2026-07-30T10:00:00.000Z'),
      lastUsedAt: new Date('2026-07-30T11:00:00.000Z'),
      ipAddress: '127.0.0.1',
      userAgent: 'Jest',
    } as AuthSessionEntity;
    const other = {
      ...createSession(),
      id: 'other-session-id',
      createdAt: new Date('2026-07-29T10:00:00.000Z'),
      lastUsedAt: null,
      ipAddress: null,
      userAgent: null,
    } as AuthSessionEntity;
    const repository = {
      findActiveByUser: jest.fn().mockResolvedValue([current, other]),
    } as unknown as AuthSessionRepository;
    const service = new AuthSessionsService({} as DataSource, repository);

    const result = await service.list(current.userId, current.id);

    expect(result).toEqual([
      {
        id: current.id,
        current: true,
        ipAddress: '127.0.0.1',
        userAgent: 'Jest',
        createdAt: '2026-07-30T10:00:00.000Z',
        lastUsedAt: '2026-07-30T11:00:00.000Z',
        expiresAt: current.expiresAt.toISOString(),
      },
      {
        id: other.id,
        current: false,
        ipAddress: null,
        userAgent: null,
        createdAt: '2026-07-29T10:00:00.000Z',
        lastUsedAt: null,
        expiresAt: other.expiresAt.toISOString(),
      },
    ]);
  });

  it('does not expose whether another user owns a session', async () => {
    const repository = {
      revokeOne: jest.fn().mockResolvedValue(false),
    } as unknown as AuthSessionRepository;
    const service = new AuthSessionsService({} as DataSource, repository);

    await expect(
      service.revokeSession('other-session-id', 'user-id'),
    ).rejects.toThrow(NotFoundException);
  });
});
