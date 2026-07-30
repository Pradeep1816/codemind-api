import type { AuthenticatedRequestUser } from '../interfaces/authenticated-user.interface';
import { AuthAuditController } from './auth-audit.controller';
import { AuthAuditService } from './auth-audit.service';
import { ListAuthAuditEventsQueryDto } from './dto/list-auth-audit-events-query.dto';

describe('AuthAuditController', () => {
  it('uses only the authenticated organization as the audit scope', async () => {
    const response = {
      data: [],
      pagination: {
        page: 1,
        limit: 20,
        total: 0,
        totalPages: 0,
      },
    };
    const listOrganizationEvents = jest.fn().mockResolvedValue(response);
    const controller = new AuthAuditController({
      listOrganizationEvents,
    } as unknown as AuthAuditService);
    const currentUser = {
      id: 'user-id',
      organization: {
        id: 'organization-id',
      },
    } as AuthenticatedRequestUser;
    const query = new ListAuthAuditEventsQueryDto();

    await expect(controller.list(currentUser, query)).resolves.toBe(response);
    expect(listOrganizationEvents).toHaveBeenCalledWith(
      currentUser.organization.id,
      query,
    );
  });
});
