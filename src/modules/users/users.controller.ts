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
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { getRequestMetadata } from '../../common/utils/request-metadata.util';
import { AUTH_RATE_LIMIT_POLICIES } from '../../config/rate-limit.config';
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
  @Throttle({ default: AUTH_RATE_LIMIT_POLICIES.invitationCreate })
  @Post('invitations')
  invite(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body() input: InviteUserDto,
    @Req() request: Request,
  ): Promise<UserInvitationResponseDto> {
    return this.usersService.inviteOrganizationUser(
      currentUser.organization.id,
      currentUser.id,
      input,
      getRequestMetadata(request),
    );
  }

  @RequirePermissions('user.manage')
  @Patch(':userId/status')
  updateStatus(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() input: UpdateUserStatusDto,
    @Req() request: Request,
  ): Promise<UserResponseDto> {
    return this.usersService.updateOrganizationUserStatus(
      currentUser.organization.id,
      currentUser.id,
      userId,
      input,
      getRequestMetadata(request),
    );
  }

  @RequirePermissions('user.manage', 'role.manage')
  @Put(':userId/roles')
  replaceRoles(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() input: AssignUserRolesDto,
    @Req() request: Request,
  ): Promise<UserResponseDto> {
    return this.usersService.replaceOrganizationUserRoles(
      currentUser.organization.id,
      currentUser.id,
      userId,
      input,
      getRequestMetadata(request),
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
