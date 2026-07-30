import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { RoleEntity } from '../../database/entities/role.entity';
import { UserRoleEntity } from '../../database/entities/user-role.entity';
import { UserEntity, UserStatus } from '../../database/entities/user.entity';
import { DefaultRoleName } from '../../database/seeds/roles.seed';
import { OrganizationsService } from '../organizations/organizations.service';
import { ListUsersQueryDto } from './dto/list-users-query.dto';
import {
  CreateUserRecord,
  UserRepository,
} from './repositories/user.repository';
import { UsersService } from './users.service';

describe('UsersService', () => {
  const manager = {} as EntityManager;

  it('normalizes user data and delegates persistence', async () => {
    const user = {
      id: 'user-id',
      email: 'pradeep@example.com',
      name: 'Pradeep Mahto',
    } as UserEntity;
    const findByEmail = jest.fn().mockResolvedValue(null);
    const createUser = jest.fn().mockResolvedValue(user);
    const userRepository = {
      findByEmail,
      create: createUser,
    } as unknown as UserRepository;
    const service = new UsersService(userRepository);

    await service.ensureEmailAvailable(' Pradeep@Example.com ', manager);
    const result = await service.create(
      {
        organizationId: 'organization-id',
        email: ' Pradeep@Example.com ',
        name: ' Pradeep Mahto ',
        passwordHash: 'stored-password-hash',
      },
      manager,
    );

    expect(findByEmail).toHaveBeenCalledWith('pradeep@example.com', manager);
    expect(createUser).toHaveBeenCalledWith(
      {
        organizationId: 'organization-id',
        email: 'pradeep@example.com',
        name: 'Pradeep Mahto',
        passwordHash: 'stored-password-hash',
      },
      manager,
    );
    expect(result).toBe(user);
  });

  it('rejects an email already found by the repository', async () => {
    const userRepository = {
      findByEmail: jest.fn().mockResolvedValue({ id: 'user-id' }),
    } as unknown as UserRepository;
    const service = new UsersService(userRepository);

    await expect(
      service.ensureEmailAvailable('pradeep@example.com', manager),
    ).rejects.toThrow(ConflictException);
  });

  it('delegates authentication reads and last-login updates', async () => {
    const user = {
      id: 'user-id',
      email: 'pradeep@example.com',
    } as UserEntity;
    const findForAuthentication = jest.fn().mockResolvedValue(user);
    const findAuthenticatedIdentity = jest.fn().mockResolvedValue(user);
    const updateLastLoginAt = jest.fn().mockResolvedValue(undefined);
    const userRepository = {
      findForAuthentication,
      findAuthenticatedIdentity,
      updateLastLoginAt,
    } as unknown as UserRepository;
    const service = new UsersService(userRepository);

    await service.findForAuthentication(' Pradeep@Example.com ');
    await service.findAuthenticatedIdentity('user-id', 'organization-id');
    await service.recordSuccessfulLogin('user-id');

    expect(findForAuthentication).toHaveBeenCalledWith('pradeep@example.com');
    expect(findAuthenticatedIdentity).toHaveBeenCalledWith(
      'user-id',
      'organization-id',
    );
    expect(updateLastLoginAt).toHaveBeenCalledWith('user-id', expect.any(Date));
  });

  it('returns a mapped and paginated organization user list', async () => {
    const user = {
      id: 'user-id',
      organizationId: 'organization-id',
      email: 'owner@example.com',
      name: 'Owner',
      status: UserStatus.Active,
      lastLoginAt: new Date('2026-07-29T11:00:00.000Z'),
      createdAt: new Date('2026-07-29T10:00:00.000Z'),
      userRoles: [
        {
          role: { name: 'OWNER' } as RoleEntity,
        } as UserRoleEntity,
      ],
    } as UserEntity;
    const findManyByOrganization = jest.fn().mockResolvedValue([[user], 1]);
    const userRepository = {
      findManyByOrganization,
    } as unknown as UserRepository;
    const service = new UsersService(userRepository);
    const query = Object.assign(new ListUsersQueryDto(), {
      page: 1,
      limit: 20,
      search: 'owner',
      status: UserStatus.Active,
    });

    const result = await service.listOrganizationUsers(
      'organization-id',
      query,
    );

    expect(findManyByOrganization).toHaveBeenCalledWith({
      organizationId: 'organization-id',
      page: 1,
      limit: 20,
      search: 'owner',
      status: UserStatus.Active,
    });
    expect(result).toEqual({
      data: [
        {
          id: user.id,
          email: user.email,
          name: user.name,
          status: user.status,
          roles: ['OWNER'],
          lastLoginAt: '2026-07-29T11:00:00.000Z',
          createdAt: '2026-07-29T10:00:00.000Z',
        },
      ],
      pagination: {
        page: 1,
        limit: 20,
        total: 1,
        totalPages: 1,
      },
    });
  });

  it('does not return a user from outside the organization scope', async () => {
    const findByIdAndOrganization = jest.fn().mockResolvedValue(null);
    const userRepository = {
      findByIdAndOrganization,
    } as unknown as UserRepository;
    const service = new UsersService(userRepository);

    await expect(
      service.getOrganizationUser('organization-id', 'other-user-id'),
    ).rejects.toThrow(NotFoundException);
    expect(findByIdAndOrganization).toHaveBeenCalledWith(
      'other-user-id',
      'organization-id',
    );
  });

  it('creates an invited user with a hashed one-time token and scoped roles', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-29T10:00:00.000Z'));

    try {
      const role = {
        id: 'role-id',
        organizationId: 'organization-id',
        name: DefaultRoleName.Developer,
      } as RoleEntity;
      const invitedUser = {
        id: 'invited-user-id',
        organizationId: 'organization-id',
        email: 'developer@example.com',
        name: 'Developer',
        status: UserStatus.Invited,
        lastLoginAt: null,
        createdAt: new Date('2026-07-29T10:00:00.000Z'),
        userRoles: [{ role } as UserRoleEntity],
      } as UserEntity;
      const createUser = jest.fn().mockResolvedValue(invitedUser);
      const findByIdAndOrganization = jest.fn().mockResolvedValue(invitedUser);
      const userRepository = {
        findByEmail: jest.fn().mockResolvedValue(null),
        create: createUser,
        findByIdAndOrganization,
      } as unknown as UserRepository;
      const replaceUserRoles = jest.fn().mockResolvedValue(undefined);
      const organizationsService = {
        findRolesByIds: jest.fn().mockResolvedValue([role]),
        replaceUserRoles,
      } as unknown as OrganizationsService;
      const transaction = jest
        .fn()
        .mockImplementation(
          async (
            operation: (transactionManager: EntityManager) => Promise<unknown>,
          ) => operation(manager),
        );
      const service = new UsersService(
        userRepository,
        organizationsService,
        { transaction } as unknown as DataSource,
        { ttlHours: 72 },
      );

      const result = await service.inviteOrganizationUser(
        'organization-id',
        'owner-user-id',
        {
          name: ' Developer ',
          email: ' Developer@Example.com ',
          roleIds: [role.id],
        },
      );

      expect(createUser).toHaveBeenCalledTimes(1);
      const [createdRecord, createManager] = createUser.mock
        .calls[0] as unknown as [CreateUserRecord, EntityManager];

      expect(createdRecord).toMatchObject({
        organizationId: 'organization-id',
        email: 'developer@example.com',
        name: 'Developer',
        passwordHash: null,
        status: UserStatus.Invited,
        invitedByUserId: 'owner-user-id',
        invitationExpiresAt: new Date('2026-08-01T10:00:00.000Z'),
      });
      expect(createdRecord.invitationTokenHash).toMatch(/^[a-f0-9]{64}$/);
      expect(createManager).toBe(manager);
      expect(replaceUserRoles).toHaveBeenCalledWith(
        invitedUser.id,
        [role.id],
        manager,
      );
      expect(result.user).toMatchObject({
        id: invitedUser.id,
        status: UserStatus.Invited,
        roles: [DefaultRoleName.Developer],
      });
      expect(result.invitationToken).toHaveLength(43);
      expect(result.expiresAt).toBe('2026-08-01T10:00:00.000Z');
    } finally {
      jest.useRealTimers();
    }
  });

  it('accepts an invitation only while its token is valid', async () => {
    const role = {
      id: 'role-id',
      name: DefaultRoleName.Viewer,
    } as RoleEntity;
    const user = {
      id: 'invited-user-id',
      organizationId: 'organization-id',
      email: 'viewer@example.com',
      name: 'Viewer',
      status: UserStatus.Invited,
      invitationExpiresAt: new Date(Date.now() + 60_000),
      createdAt: new Date('2026-07-29T10:00:00.000Z'),
      lastLoginAt: null,
      userRoles: [{ role } as UserRoleEntity],
    } as UserEntity;
    const save = jest.fn().mockResolvedValue(user);
    const userRepository = {
      findByInvitationTokenHashForUpdate: jest.fn().mockResolvedValue(user),
      save,
      findByIdAndOrganization: jest.fn().mockResolvedValue(user),
    } as unknown as UserRepository;
    const transaction = jest
      .fn()
      .mockImplementation(
        async (
          operation: (transactionManager: EntityManager) => Promise<unknown>,
        ) => operation(manager),
      );
    const service = new UsersService(
      userRepository,
      {} as OrganizationsService,
      { transaction } as unknown as DataSource,
      { ttlHours: 72 },
    );

    const result = await service.acceptInvitation(
      'one-time-invitation-token',
      'stored-password-hash',
    );

    expect(save).toHaveBeenCalledTimes(1);
    const [savedUser, saveManager] = save.mock.calls[0] as unknown as [
      UserEntity,
      EntityManager,
    ];

    expect(savedUser).toMatchObject({
      passwordHash: 'stored-password-hash',
      status: UserStatus.Active,
      invitationTokenHash: null,
      invitationExpiresAt: null,
    });
    expect(savedUser.invitationAcceptedAt).toBeInstanceOf(Date);
    expect(saveManager).toBe(manager);
    expect(result.status).toBe(UserStatus.Active);
  });

  it('rejects an unavailable invitation before password hashing begins', async () => {
    const findAvailableInvitationByTokenHash = jest
      .fn()
      .mockResolvedValue(null);
    const service = new UsersService(
      {
        findAvailableInvitationByTokenHash,
      } as unknown as UserRepository,
      {} as OrganizationsService,
      {} as DataSource,
      { ttlHours: 72 },
    );

    await expect(
      service.ensureInvitationCanBeAccepted('invalid-invitation-token'),
    ).rejects.toThrow(BadRequestException);
    expect(findAvailableInvitationByTokenHash).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Date),
    );
  });

  it('protects the last active OWNER from suspension', async () => {
    const ownerRole = {
      name: DefaultRoleName.Owner,
    } as RoleEntity;
    const user = {
      id: 'owner-user-id',
      organizationId: 'organization-id',
      status: UserStatus.Active,
      userRoles: [{ role: ownerRole } as UserRoleEntity],
    } as UserEntity;
    const save = jest.fn();
    const userRepository = {
      findByIdAndOrganizationForUpdate: jest.fn().mockResolvedValue(user),
      findByIdAndOrganization: jest.fn().mockResolvedValue(user),
      save,
    } as unknown as UserRepository;
    const organizationsService = {
      lockOrganization: jest.fn().mockResolvedValue(true),
      countActiveUsersWithRole: jest.fn().mockResolvedValue(1),
    } as unknown as OrganizationsService;
    const transaction = jest
      .fn()
      .mockImplementation(
        async (
          operation: (transactionManager: EntityManager) => Promise<unknown>,
        ) => operation(manager),
      );
    const service = new UsersService(
      userRepository,
      organizationsService,
      { transaction } as unknown as DataSource,
      { ttlHours: 72 },
    );

    await expect(
      service.updateOrganizationUserStatus('organization-id', user.id, {
        status: UserStatus.Suspended,
      }),
    ).rejects.toThrow(ConflictException);
    expect(save).not.toHaveBeenCalled();
  });

  it('rejects role assignments from another organization', async () => {
    const user = {
      id: 'user-id',
      organizationId: 'organization-id',
      status: UserStatus.Active,
    } as UserEntity;
    const userRepository = {
      findByIdAndOrganizationForUpdate: jest.fn().mockResolvedValue(user),
    } as unknown as UserRepository;
    const replaceUserRoles = jest.fn();
    const organizationsService = {
      lockOrganization: jest.fn().mockResolvedValue(true),
      findRolesByIds: jest.fn().mockResolvedValue([]),
      replaceUserRoles,
    } as unknown as OrganizationsService;
    const transaction = jest
      .fn()
      .mockImplementation(
        async (
          operation: (transactionManager: EntityManager) => Promise<unknown>,
        ) => operation(manager),
      );
    const service = new UsersService(
      userRepository,
      organizationsService,
      { transaction } as unknown as DataSource,
      { ttlHours: 72 },
    );

    await expect(
      service.replaceOrganizationUserRoles('organization-id', user.id, {
        roleIds: ['outside-role-id'],
      }),
    ).rejects.toThrow(BadRequestException);
    expect(replaceUserRoles).not.toHaveBeenCalled();
  });
});
