import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import {
  AuthAuditEventEntity,
  AuthAuditEventType,
  AuthAuditOutcome,
} from '../entities/auth-audit-event.entity';

export interface CreateAuthAuditEventRecord {
  organizationId: string | null;
  actorUserId: string | null;
  subjectUserId: string | null;
  sessionId: string | null;
  eventType: AuthAuditEventType;
  outcome: AuthAuditOutcome;
  ipAddress: string | null;
  userAgent: string | null;
  metadata: Record<string, unknown> | null;
}

export interface FindAuthAuditEventsOptions {
  organizationId: string;
  page: number;
  limit: number;
  eventType?: AuthAuditEventType;
  outcome?: AuthAuditOutcome;
}

@Injectable()
export class AuthAuditRepository {
  constructor(
    @InjectRepository(AuthAuditEventEntity)
    private readonly repository: Repository<AuthAuditEventEntity>,
  ) {}

  create(
    input: CreateAuthAuditEventRecord,
    manager?: EntityManager,
  ): Promise<AuthAuditEventEntity> {
    const repository = manager
      ? manager.getRepository(AuthAuditEventEntity)
      : this.repository;

    return repository.save(repository.create(input));
  }

  findManyByOrganization(
    options: FindAuthAuditEventsOptions,
  ): Promise<[AuthAuditEventEntity[], number]> {
    const query = this.repository
      .createQueryBuilder('event')
      .where('event.organizationId = :organizationId', {
        organizationId: options.organizationId,
      });

    if (options.eventType) {
      query.andWhere('event.eventType = :eventType', {
        eventType: options.eventType,
      });
    }

    if (options.outcome) {
      query.andWhere('event.outcome = :outcome', {
        outcome: options.outcome,
      });
    }

    return query
      .orderBy('event.createdAt', 'DESC')
      .addOrderBy('event.id', 'DESC')
      .skip((options.page - 1) * options.limit)
      .take(options.limit)
      .getManyAndCount();
  }
}
