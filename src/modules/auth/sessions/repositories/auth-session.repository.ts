import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { AuthSessionEntity } from '../entities/auth-session.entity';

export interface CreateAuthSessionRecord {
  id: string;
  userId: string;
  organizationId: string;
  refreshTokenHash: string;
  tokenVersion: number;
  expiresAt: Date;
  ipAddress: string | null;
  userAgent: string | null;
}

@Injectable()
export class AuthSessionRepository {
  constructor(
    @InjectRepository(AuthSessionEntity)
    private readonly repository: Repository<AuthSessionEntity>,
  ) {}

  create(input: CreateAuthSessionRecord): Promise<AuthSessionEntity> {
    return this.repository.save(this.repository.create(input));
  }

  findByIdForUpdate(
    sessionId: string,
    manager: EntityManager,
  ): Promise<AuthSessionEntity | null> {
    return manager
      .getRepository(AuthSessionEntity)
      .createQueryBuilder('session')
      .addSelect('session.refreshTokenHash')
      .where('session.id = :sessionId', { sessionId })
      .setLock('pessimistic_write')
      .getOne();
  }

  findActive(
    sessionId: string,
    userId: string,
    organizationId: string,
    now: Date,
  ): Promise<AuthSessionEntity | null> {
    return this.repository
      .createQueryBuilder('session')
      .select('session.id')
      .where('session.id = :sessionId', { sessionId })
      .andWhere('session.userId = :userId', { userId })
      .andWhere('session.organizationId = :organizationId', {
        organizationId,
      })
      .andWhere('session.revokedAt IS NULL')
      .andWhere('session.expiresAt > :now', { now })
      .getOne();
  }

  findActiveByUser(userId: string, now: Date): Promise<AuthSessionEntity[]> {
    return this.repository
      .createQueryBuilder('session')
      .where('session.userId = :userId', { userId })
      .andWhere('session.revokedAt IS NULL')
      .andWhere('session.expiresAt > :now', { now })
      .orderBy('session.lastUsedAt', 'DESC', 'NULLS LAST')
      .addOrderBy('session.createdAt', 'DESC')
      .getMany();
  }

  save(
    session: AuthSessionEntity,
    manager: EntityManager,
  ): Promise<AuthSessionEntity> {
    return manager.getRepository(AuthSessionEntity).save(session);
  }

  async revokeOne(
    sessionId: string,
    userId: string,
    reason: string,
  ): Promise<boolean> {
    const result = await this.repository
      .createQueryBuilder()
      .update(AuthSessionEntity)
      .set({
        revokedAt: new Date(),
        revokeReason: reason,
      })
      .where('id = :sessionId', { sessionId })
      .andWhere('userId = :userId', { userId })
      .andWhere('revokedAt IS NULL')
      .execute();

    return (result.affected ?? 0) > 0;
  }

  async revokeAllByUser(
    userId: string,
    reason: string,
    manager?: EntityManager,
  ): Promise<number> {
    const repository = manager
      ? manager.getRepository(AuthSessionEntity)
      : this.repository;
    const result = await repository
      .createQueryBuilder()
      .update(AuthSessionEntity)
      .set({
        revokedAt: new Date(),
        revokeReason: reason,
      })
      .where('userId = :userId', { userId })
      .andWhere('revokedAt IS NULL')
      .execute();

    return result.affected ?? 0;
  }
}
