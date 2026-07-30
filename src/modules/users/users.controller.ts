import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { AssignUserRolesDto } from './dto/assign-user-roles.dto';
import { InviteUserDto } from './dto/invite-user.dto';
import { ListUsersQueryDto } from './dto/list-users-query.dto';
import { UpdateUserStatusDto } from './dto/update-user-status.dto';
import {
  UserInvitationResponseDto,
  UserListResponseDto,
  UserResponseDto,
} from './dto/user-response.dto';
import { UsersService } from './users.service';

@Controller({
  path: 'users',
  version: '1',
})
@RequirePermissions('user.read')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  list(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Query() query: ListUsersQueryDto,
  ): Promise<UserListResponseDto> {
    return this.usersService.listOrganizationUsers(
      currentUser.organization.id,
      query,
    );
  }

  @RequirePermissions('user.manage', 'role.manage')
  @Post('invitations')
  invite(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body() input: InviteUserDto,
  ): Promise<UserInvitationResponseDto> {
    return this.usersService.inviteOrganizationUser(
      currentUser.organization.id,
      currentUser.id,
      input,
    );
  }

  @RequirePermissions('user.manage')
  @Patch(':userId/status')
  updateStatus(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() input: UpdateUserStatusDto,
  ): Promise<UserResponseDto> {
    return this.usersService.updateOrganizationUserStatus(
      currentUser.organization.id,
      userId,
      input,
    );
  }

  @RequirePermissions('user.manage', 'role.manage')
  @Put(':userId/roles')
  replaceRoles(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() input: AssignUserRolesDto,
  ): Promise<UserResponseDto> {
    return this.usersService.replaceOrganizationUserRoles(
      currentUser.organization.id,
      userId,
      input,
    );
  }

  @Get(':userId')
  findOne(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('userId', ParseUUIDPipe) userId: string,
  ): Promise<UserResponseDto> {
    return this.usersService.getOrganizationUser(
      currentUser.organization.id,
      userId,
    );
  }
}
