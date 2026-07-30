import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { EntityManager } from 'typeorm';
import { RequestMetadata } from '../../../common/utils/request-metadata.util';
import {
  AuthAuditEventListResponseDto,
  AuthAuditEventResponseDto,
} from './dto/auth-audit-event-response.dto';
import { ListAuthAuditEventsQueryDto } from './dto/list-auth-audit-events-query.dto';
import {
  AuthAuditEventEntity,
  AuthAuditEventType,
  AuthAuditOutcome,
} from './entities/auth-audit-event.entity';
import { AuthAuditRepository } from './repositories/auth-audit.repository';

export interface RecordAuthAuditEventInput {
  organizationId?: string | null;
  actorUserId?: string | null;
  subjectUserId?: string | null;
  sessionId?: string | null;
  eventType: AuthAuditEventType;
  outcome: AuthAuditOutcome;
  request?: RequestMetadata;
  metadata?: Record<string, unknown> | null;
}

@Injectable()
export class AuthAuditService {
  constructor(private readonly authAuditRepository: AuthAuditRepository) {}

  async record(
    input: RecordAuthAuditEventInput,
    manager?: EntityManager,
  ): Promise<void> {
    await this.authAuditRepository.create(
      {
        organizationId: input.organizationId ?? null,
        actorUserId: input.actorUserId ?? null,
        subjectUserId: input.subjectUserId ?? null,
        sessionId: input.sessionId ?? null,
        eventType: input.eventType,
        outcome: input.outcome,
        ipAddress: input.request?.ipAddress ?? null,
        userAgent: input.request?.userAgent ?? null,
        metadata: input.metadata ?? null,
      },
      manager,
    );
  }

  async recordBestEffort(input: RecordAuthAuditEventInput): Promise<void> {
    try {
      await this.record(input);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);

      console.error('Failed to persist authentication audit event', message);
    }
  }

  hashIdentifier(value: string): string {
    return createHash('sha256')
      .update(value.trim().toLowerCase())
      .digest('hex');
  }

  async listOrganizationEvents(
    organizationId: string,
    query: ListAuthAuditEventsQueryDto,
  ): Promise<AuthAuditEventListResponseDto> {
    const [events, total] =
      await this.authAuditRepository.findManyByOrganization({
        organizationId,
        page: query.page,
        limit: query.limit,
        eventType: query.eventType,
        outcome: query.outcome,
      });

    return {
      data: events.map((event) => this.toResponse(event)),
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  private toResponse(event: AuthAuditEventEntity): AuthAuditEventResponseDto {
    return {
      id: event.id,
      actorUserId: event.actorUserId,
      subjectUserId: event.subjectUserId,
      sessionId: event.sessionId,
      eventType: event.eventType,
      outcome: event.outcome,
      ipAddress: event.ipAddress,
      userAgent: event.userAgent,
      metadata: event.metadata,
      createdAt: event.createdAt.toISOString(),
    };
  }
}
