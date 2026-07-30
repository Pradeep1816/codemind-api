import { EntityManager } from 'typeorm';
import { AuthAuditService } from './auth-audit.service';
import { ListAuthAuditEventsQueryDto } from './dto/list-auth-audit-events-query.dto';
import {
  AuthAuditEventEntity,
  AuthAuditEventType,
  AuthAuditOutcome,
} from './entities/auth-audit-event.entity';
import { AuthAuditRepository } from './repositories/auth-audit.repository';

describe('AuthAuditService', () => {
  it('persists normalized event fields in the supplied transaction', async () => {
    const create = jest.fn().mockResolvedValue({});
    const service = new AuthAuditService({
      create,
    } as unknown as AuthAuditRepository);
    const manager = {} as EntityManager;

    await service.record(
      {
        organizationId: 'organization-id',
        actorUserId: 'actor-id',
        eventType: AuthAuditEventType.LoginSucceeded,
        outcome: AuthAuditOutcome.Success,
        request: {
          ipAddress: '127.0.0.1',
          userAgent: 'Jest',
        },
      },
      manager,
    );

    expect(create).toHaveBeenCalledWith(
      {
        organizationId: 'organization-id',
        actorUserId: 'actor-id',
        subjectUserId: null,
        sessionId: null,
        eventType: AuthAuditEventType.LoginSucceeded,
        outcome: AuthAuditOutcome.Success,
        ipAddress: '127.0.0.1',
        userAgent: 'Jest',
        metadata: null,
      },
      manager,
    );
  });

  it('does not allow an audit persistence failure to break best-effort flows', async () => {
    const create = jest
      .fn()
      .mockRejectedValue(new Error('database unavailable'));
    const service = new AuthAuditService({
      create,
    } as unknown as AuthAuditRepository);
    const consoleError = jest
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);

    await expect(
      service.recordBestEffort({
        eventType: AuthAuditEventType.LoginFailed,
        outcome: AuthAuditOutcome.Failure,
      }),
    ).resolves.toBeUndefined();
    expect(consoleError).toHaveBeenCalledWith(
      'Failed to persist authentication audit event',
      'database unavailable',
    );

    consoleError.mockRestore();
  });

  it('lists only organization-scoped events and maps persistence dates', async () => {
    const event = {
      id: 'event-id',
      actorUserId: 'actor-id',
      subjectUserId: 'subject-id',
      sessionId: 'session-id',
      eventType: AuthAuditEventType.UserStatusChanged,
      outcome: AuthAuditOutcome.Success,
      ipAddress: '127.0.0.1',
      userAgent: 'Jest',
      metadata: {
        previousStatus: 'active',
        newStatus: 'suspended',
      },
      createdAt: new Date('2026-07-30T10:00:00.000Z'),
    } as AuthAuditEventEntity;
    const findManyByOrganization = jest.fn().mockResolvedValue([[event], 1]);
    const service = new AuthAuditService({
      findManyByOrganization,
    } as unknown as AuthAuditRepository);
    const query = Object.assign(new ListAuthAuditEventsQueryDto(), {
      page: 2,
      limit: 10,
      eventType: AuthAuditEventType.UserStatusChanged,
      outcome: AuthAuditOutcome.Success,
    });

    const result = await service.listOrganizationEvents(
      'organization-id',
      query,
    );

    expect(findManyByOrganization).toHaveBeenCalledWith({
      organizationId: 'organization-id',
      page: 2,
      limit: 10,
      eventType: AuthAuditEventType.UserStatusChanged,
      outcome: AuthAuditOutcome.Success,
    });
    expect(result).toEqual({
      data: [
        {
          id: event.id,
          actorUserId: event.actorUserId,
          subjectUserId: event.subjectUserId,
          sessionId: event.sessionId,
          eventType: event.eventType,
          outcome: event.outcome,
          ipAddress: event.ipAddress,
          userAgent: event.userAgent,
          metadata: event.metadata,
          createdAt: '2026-07-30T10:00:00.000Z',
        },
      ],
      pagination: {
        page: 2,
        limit: 10,
        total: 1,
        totalPages: 1,
      },
    });
  });

  it('hashes identifiers consistently without retaining their raw values', () => {
    const service = new AuthAuditService({} as AuthAuditRepository);

    expect(service.hashIdentifier(' Owner@Example.com ')).toBe(
      service.hashIdentifier('owner@example.com'),
    );
    expect(service.hashIdentifier('owner@example.com')).toMatch(
      /^[a-f0-9]{64}$/,
    );
  });
});
