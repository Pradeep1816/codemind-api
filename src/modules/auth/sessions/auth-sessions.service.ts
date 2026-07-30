import { Injectable, NotFoundException } from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
import { DataSource, EntityManager } from 'typeorm';
import { AuthSessionResponseDto } from './dto/auth-session-response.dto';
import { AuthSessionRepository } from './repositories/auth-session.repository';

export interface CreateAuthSessionInput {
  id: string;
  userId: string;
  organizationId: string;
  refreshTokenHash: string;
  tokenVersion: number;
  expiresAt: Date;
  ipAddress: string | null;
  userAgent: string | null;
}

export interface RotateAuthSessionInput {
  sessionId: string;
  userId: string;
  organizationId: string;
  tokenVersion: number;
  presentedTokenHash: string;
  nextTokenHash: string;
  nextExpiresAt: Date;
}

export enum AuthSessionRotationResult {
  Rotated = 'rotated',
  Invalid = 'invalid',
  Reused = 'reused',
}

@Injectable()
export class AuthSessionsService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly authSessionRepository: AuthSessionRepository,
  ) {}

  async create(input: CreateAuthSessionInput): Promise<void> {
    await this.authSessionRepository.create(input);
  }

  async isActive(
    sessionId: string,
    userId: string,
    organizationId: string,
  ): Promise<boolean> {
    const session = await this.authSessionRepository.findActive(
      sessionId,
      userId,
      organizationId,
      new Date(),
    );

    return session !== null;
  }

  rotate(input: RotateAuthSessionInput): Promise<AuthSessionRotationResult> {
    return this.dataSource.transaction(async (manager) => {
      const session = await this.authSessionRepository.findByIdForUpdate(
        input.sessionId,
        manager,
      );

      if (
        !session ||
        session.userId !== input.userId ||
        session.organizationId !== input.organizationId ||
        session.revokedAt ||
        session.expiresAt.getTime() <= Date.now()
      ) {
        return AuthSessionRotationResult.Invalid;
      }

      const isCurrentToken =
        session.tokenVersion === input.tokenVersion &&
        this.matchesHash(session.refreshTokenHash, input.presentedTokenHash);

      if (!isCurrentToken) {
        session.revokedAt = new Date();
        session.revokeReason = 'refresh_token_reuse';
        await this.authSessionRepository.save(session, manager);

        return AuthSessionRotationResult.Reused;
      }

      session.refreshTokenHash = input.nextTokenHash;
      session.tokenVersion += 1;
      session.expiresAt = input.nextExpiresAt;
      session.lastUsedAt = new Date();

      await this.authSessionRepository.save(session, manager);

      return AuthSessionRotationResult.Rotated;
    });
  }

  revokeCurrent(sessionId: string, userId: string): Promise<boolean> {
    return this.authSessionRepository.revokeOne(sessionId, userId, 'logout');
  }

  revokeSession(sessionId: string, userId: string): Promise<void> {
    return this.authSessionRepository
      .revokeOne(sessionId, userId, 'remote_logout')
      .then((revoked) => {
        if (!revoked) {
          throw new NotFoundException('Active session was not found');
        }
      });
  }

  revokeAllForUser(
    userId: string,
    reason: string,
    manager?: EntityManager,
  ): Promise<number> {
    return this.authSessionRepository.revokeAllByUser(userId, reason, manager);
  }

  async list(
    userId: string,
    currentSessionId: string,
  ): Promise<AuthSessionResponseDto[]> {
    const sessions = await this.authSessionRepository.findActiveByUser(
      userId,
      new Date(),
    );

    return sessions.map((session) => ({
      id: session.id,
      current: session.id === currentSessionId,
      ipAddress: session.ipAddress,
      userAgent: session.userAgent,
      createdAt: session.createdAt.toISOString(),
      lastUsedAt: session.lastUsedAt?.toISOString() ?? null,
      expiresAt: session.expiresAt.toISOString(),
    }));
  }

  private matchesHash(expected: string, presented: string): boolean {
    const expectedBuffer = Buffer.from(expected, 'hex');
    const presentedBuffer = Buffer.from(presented, 'hex');

    return (
      expectedBuffer.length === presentedBuffer.length &&
      timingSafeEqual(expectedBuffer, presentedBuffer)
    );
  }
}
