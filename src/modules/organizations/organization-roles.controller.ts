import { Controller, Get } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { RoleResponseDto } from './dto/role-response.dto';
import { OrganizationsService } from './organizations.service';

@Controller({
  path: 'roles',
  version: '1',
})
export class OrganizationRolesController {
  constructor(private readonly organizationsService: OrganizationsService) {}

  @RequirePermissions('role.read')
  @Get()
  list(
    @CurrentUser() currentUser: AuthenticatedUser,
  ): Promise<RoleResponseDto[]> {
    return this.organizationsService.listRoles(currentUser.organization.id);
  }
}
