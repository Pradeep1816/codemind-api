import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  AuthAuditEventType,
  AuthAuditOutcome,
} from '../entities/auth-audit-event.entity';
import { ListAuthAuditEventsQueryDto } from './list-auth-audit-events-query.dto';

describe('ListAuthAuditEventsQueryDto', () => {
  it('accepts pagination and supported audit filters', async () => {
    const query = plainToInstance(ListAuthAuditEventsQueryDto, {
      page: '2',
      limit: '50',
      eventType: AuthAuditEventType.LoginFailed,
      outcome: AuthAuditOutcome.Failure,
    });

    await expect(validate(query)).resolves.toHaveLength(0);
    expect(query.page).toBe(2);
    expect(query.limit).toBe(50);
  });

  it('rejects unsupported event filters and oversized pages', async () => {
    const query = plainToInstance(ListAuthAuditEventsQueryDto, {
      limit: '101',
      eventType: 'password.exposed',
    });

    const errors = await validate(query);

    expect(errors.map((error) => error.property)).toEqual(
      expect.arrayContaining(['limit', 'eventType']),
    );
  });
});
