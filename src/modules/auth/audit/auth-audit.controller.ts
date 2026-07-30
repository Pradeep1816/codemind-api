import { Controller, Get, Query } from '@nestjs/common';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../../common/decorators/require-permissions.decorator';
import type { AuthenticatedRequestUser } from '../interfaces/authenticated-user.interface';
import { AuthAuditService } from './auth-audit.service';
import { AuthAuditEventListResponseDto } from './dto/auth-audit-event-response.dto';
import { ListAuthAuditEventsQueryDto } from './dto/list-auth-audit-events-query.dto';

@Controller({
  path: 'auth/audit-events',
  version: '1',
})
@RequirePermissions('audit.read')
export class AuthAuditController {
  constructor(private readonly authAuditService: AuthAuditService) {}

  @Get()
  list(
    @CurrentUser() currentUser: AuthenticatedRequestUser,
    @Query() query: ListAuthAuditEventsQueryDto,
  ): Promise<AuthAuditEventListResponseDto> {
    return this.authAuditService.listOrganizationEvents(
      currentUser.organization.id,
      query,
    );
  }
}
