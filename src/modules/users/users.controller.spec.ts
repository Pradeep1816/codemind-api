import { UserStatus } from '../../database/entities/user.entity';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { ListUsersQueryDto } from './dto/list-users-query.dto';
import { InviteUserDto } from './dto/invite-user.dto';
import { UpdateUserStatusDto } from './dto/update-user-status.dto';
import { AssignUserRolesDto } from './dto/assign-user-roles.dto';
import type {
  UserListResponseDto,
  UserResponseDto,
} from './dto/user-response.dto';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

describe('UsersController', () => {
  const currentUser: AuthenticatedUser = {
    id: 'current-user-id',
    email: 'owner@example.com',
    name: 'Owner',
    organization: {
      id: 'organization-id',
      name: 'CodeMind Labs',
      slug: 'codemind-labs',
    },
    roles: ['OWNER'],
  };

  it('uses the authenticated organization when listing users', async () => {
    const response: UserListResponseDto = {
      data: [],
      pagination: {
        page: 1,
        limit: 20,
        total: 0,
        totalPages: 0,
      },
    };
    const listOrganizationUsers = jest.fn().mockResolvedValue(response);
    const controller = new UsersController({
      listOrganizationUsers,
    } as unknown as UsersService);
    const query = new ListUsersQueryDto();

    const result = await controller.list(currentUser, query);

    expect(listOrganizationUsers).toHaveBeenCalledWith(
      currentUser.organization.id,
      query,
    );
    expect(result).toBe(response);
  });

  it('uses the authenticated organization when loading a user', async () => {
    const response: UserResponseDto = {
      id: 'target-user-id',
      email: 'user@example.com',
      name: 'User',
      status: UserStatus.Active,
      roles: ['VIEWER'],
      lastLoginAt: null,
      createdAt: '2026-07-29T10:00:00.000Z',
    };
    const getOrganizationUser = jest.fn().mockResolvedValue(response);
    const controller = new UsersController({
      getOrganizationUser,
    } as unknown as UsersService);

    const result = await controller.findOne(currentUser, response.id);

    expect(getOrganizationUser).toHaveBeenCalledWith(
      currentUser.organization.id,
      response.id,
    );
    expect(result).toBe(response);
  });

  it('passes the authenticated inviter and organization to invitations', async () => {
    const input: InviteUserDto = {
      name: 'Developer',
      email: 'developer@example.com',
      roleIds: ['role-id'],
    };
    const inviteOrganizationUser = jest.fn().mockResolvedValue({});
    const controller = new UsersController({
      inviteOrganizationUser,
    } as unknown as UsersService);

    await controller.invite(currentUser, input);

    expect(inviteOrganizationUser).toHaveBeenCalledWith(
      currentUser.organization.id,
      currentUser.id,
      input,
    );
  });

  it('keeps status and role changes inside the authenticated organization', async () => {
    const statusInput: UpdateUserStatusDto = {
      status: UserStatus.Suspended,
    };
    const rolesInput: AssignUserRolesDto = {
      roleIds: ['role-id'],
    };
    const updateOrganizationUserStatus = jest.fn().mockResolvedValue({});
    const replaceOrganizationUserRoles = jest.fn().mockResolvedValue({});
    const controller = new UsersController({
      updateOrganizationUserStatus,
      replaceOrganizationUserRoles,
    } as unknown as UsersService);

    await controller.updateStatus(currentUser, 'target-user-id', statusInput);
    await controller.replaceRoles(currentUser, 'target-user-id', rolesInput);

    expect(updateOrganizationUserStatus).toHaveBeenCalledWith(
      currentUser.organization.id,
      'target-user-id',
      statusInput,
    );
    expect(replaceOrganizationUserRoles).toHaveBeenCalledWith(
      currentUser.organization.id,
      'target-user-id',
      rolesInput,
    );
  });
});
