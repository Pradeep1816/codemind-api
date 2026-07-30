import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { DataSource, EntityManager } from 'typeorm';
import {
  OrganizationEntity,
  OrganizationStatus,
} from '../../database/entities/organization.entity';
import { RoleEntity } from '../../database/entities/role.entity';
import { UserRoleEntity } from '../../database/entities/user-role.entity';
import { UserEntity, UserStatus } from '../../database/entities/user.entity';
import { DefaultRoleName } from '../../database/seeds/roles.seed';
import { OrganizationsService } from '../organizations/organizations.service';
import { UsersService } from '../users/users.service';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { PasswordService } from './password.service';

describe('AuthService', () => {
  const jwtConfiguration = {
    secret: 'a-secure-test-secret-that-is-long-enough',
    expiresIn: '15m',
  };
  const input: RegisterDto = {
    organizationName: ' CodeMind Labs ',
    organizationSlug: 'codemind-labs',
    name: ' Pradeep Mahto ',
    email: 'Pradeep@Example.com',
    password: 'a-secure-password',
  };

  it('creates an organization and its first OWNER user in one transaction', async () => {
    const organization = {
      id: 'organization-id',
      name: 'CodeMind Labs',
      slug: 'codemind-labs',
    } as OrganizationEntity;
    const ownerRole = {
      id: 'owner-role-id',
      organizationId: organization.id,
      name: DefaultRoleName.Owner,
    } as RoleEntity;
    const user = {
      id: 'user-id',
      organizationId: organization.id,
      email: 'pradeep@example.com',
      name: 'Pradeep Mahto',
      status: UserStatus.Active,
      passwordHash: 'stored-password-hash',
    } as UserEntity;
    const manager = {} as EntityManager;
    const transaction = jest
      .fn()
      .mockImplementation(
        async (
          operation: (transactionManager: EntityManager) => Promise<unknown>,
        ) => operation(manager),
      );
    const dataSource = { transaction } as unknown as DataSource;
    const ensureSlugAvailable = jest.fn().mockResolvedValue(undefined);
    const createOrganization = jest.fn().mockResolvedValue(organization);
    const createDefaultRoles = jest.fn().mockResolvedValue([ownerRole]);
    const assignUserRole = jest.fn().mockResolvedValue(undefined);
    const organizationsService = {
      normalizeSlug: jest.fn((slug: string) => slug.trim().toLowerCase()),
      ensureSlugAvailable,
      create: createOrganization,
      createDefaultRoles,
      assignUserRole,
    } as unknown as OrganizationsService;
    const ensureEmailAvailable = jest.fn().mockResolvedValue(undefined);
    const createUser = jest.fn().mockResolvedValue(user);
    const usersService = {
      normalizeEmail: jest.fn((email: string) => email.trim().toLowerCase()),
      ensureEmailAvailable,
      create: createUser,
    } as unknown as UsersService;
    const hashPassword = jest.fn().mockResolvedValue('stored-password-hash');
    const passwordService = {
      hash: hashPassword,
    } as unknown as PasswordService;
    const jwtService = {} as JwtService;
    const service = new AuthService(
      dataSource,
      organizationsService,
      usersService,
      passwordService,
      jwtService,
      jwtConfiguration,
    );

    const result = await service.register(input);

    expect(hashPassword).toHaveBeenCalledWith(input.password);
    expect(ensureSlugAvailable).toHaveBeenCalledWith('codemind-labs', manager);
    expect(ensureEmailAvailable).toHaveBeenCalledWith(
      'pradeep@example.com',
      manager,
    );
    expect(createOrganization).toHaveBeenCalledWith(
      {
        name: 'CodeMind Labs',
        slug: 'codemind-labs',
      },
      manager,
    );
    expect(createDefaultRoles).toHaveBeenCalledWith(organization.id, manager);
    expect(createUser).toHaveBeenCalledWith(
      {
        organizationId: organization.id,
        email: 'pradeep@example.com',
        name: 'Pradeep Mahto',
        passwordHash: 'stored-password-hash',
      },
      manager,
    );
    expect(assignUserRole).toHaveBeenCalledWith(user.id, ownerRole.id, manager);
    expect(result).toEqual({
      organization: {
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
      },
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        status: UserStatus.Active,
        role: DefaultRoleName.Owner,
      },
    });
    expect(result.user).not.toHaveProperty('passwordHash');
  });

  it('preserves a domain conflict so the transaction can roll back', async () => {
    const conflict = new ConflictException(
      'Organization slug is already in use',
    );
    const manager = {} as EntityManager;
    const transaction = jest
      .fn()
      .mockImplementation(
        async (
          operation: (transactionManager: EntityManager) => Promise<unknown>,
        ) => operation(manager),
      );
    const dataSource = { transaction } as unknown as DataSource;
    const organizationsService = {
      normalizeSlug: jest.fn((slug: string) => slug),
      ensureSlugAvailable: jest.fn().mockRejectedValue(conflict),
    } as unknown as OrganizationsService;
    const usersService = {
      normalizeEmail: jest.fn((email: string) => email),
    } as unknown as UsersService;
    const passwordService = {
      hash: jest.fn().mockResolvedValue('stored-password-hash'),
    } as unknown as PasswordService;
    const jwtService = {} as JwtService;
    const service = new AuthService(
      dataSource,
      organizationsService,
      usersService,
      passwordService,
      jwtService,
      jwtConfiguration,
    );

    await expect(service.register(input)).rejects.toBe(conflict);
  });

  it('returns an access token for valid active credentials', async () => {
    const ownerRole = {
      id: 'owner-role-id',
      name: DefaultRoleName.Owner,
    } as RoleEntity;
    const user = {
      id: 'user-id',
      organizationId: 'organization-id',
      email: 'pradeep@example.com',
      name: 'Pradeep Mahto',
      passwordHash: 'stored-password-hash',
      status: UserStatus.Active,
      organization: {
        id: 'organization-id',
        name: 'CodeMind Labs',
        slug: 'codemind-labs',
        status: OrganizationStatus.Active,
      },
      userRoles: [{ role: ownerRole } as UserRoleEntity],
    } as UserEntity;
    const findForAuthentication = jest.fn().mockResolvedValue(user);
    const recordSuccessfulLogin = jest.fn().mockResolvedValue(undefined);
    const usersService = {
      findForAuthentication,
      recordSuccessfulLogin,
    } as unknown as UsersService;
    const verifyPassword = jest.fn().mockResolvedValue(true);
    const passwordService = {
      verify: verifyPassword,
    } as unknown as PasswordService;
    const signToken = jest.fn().mockResolvedValue('signed-access-token');
    const jwtService = {
      signAsync: signToken,
    } as unknown as JwtService;
    const service = new AuthService(
      {} as DataSource,
      {} as OrganizationsService,
      usersService,
      passwordService,
      jwtService,
      jwtConfiguration,
    );

    const result = await service.login({
      email: 'Pradeep@Example.com',
      password: 'a-secure-password',
    });

    expect(findForAuthentication).toHaveBeenCalledWith('Pradeep@Example.com');
    expect(verifyPassword).toHaveBeenCalledWith(
      'stored-password-hash',
      'a-secure-password',
    );
    expect(signToken).toHaveBeenCalledWith({
      sub: user.id,
      organizationId: user.organizationId,
      type: 'access',
    });
    expect(recordSuccessfulLogin).toHaveBeenCalledWith(user.id);
    expect(result).toEqual({
      accessToken: 'signed-access-token',
      tokenType: 'Bearer',
      expiresIn: '15m',
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        organization: {
          id: user.organization.id,
          name: user.organization.name,
          slug: user.organization.slug,
        },
        roles: [DefaultRoleName.Owner],
      },
    });
    expect(result.user).not.toHaveProperty('passwordHash');
  });

  it('returns the same unauthorized response for an invalid password', async () => {
    const user = {
      id: 'user-id',
      passwordHash: 'stored-password-hash',
    } as UserEntity;
    const usersService = {
      findForAuthentication: jest.fn().mockResolvedValue(user),
      recordSuccessfulLogin: jest.fn(),
    } as unknown as UsersService;
    const passwordService = {
      verify: jest.fn().mockResolvedValue(false),
    } as unknown as PasswordService;
    const jwtService = {
      signAsync: jest.fn(),
    } as unknown as JwtService;
    const service = new AuthService(
      {} as DataSource,
      {} as OrganizationsService,
      usersService,
      passwordService,
      jwtService,
      jwtConfiguration,
    );

    await expect(
      service.login({
        email: 'pradeep@example.com',
        password: 'wrong-password',
      }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('rejects a token when its user is no longer active', async () => {
    const user = {
      id: 'user-id',
      organizationId: 'organization-id',
      status: UserStatus.Suspended,
      organization: {
        status: OrganizationStatus.Active,
      },
    } as UserEntity;
    const usersService = {
      findAuthenticatedIdentity: jest.fn().mockResolvedValue(user),
    } as unknown as UsersService;
    const service = new AuthService(
      {} as DataSource,
      {} as OrganizationsService,
      usersService,
      {} as PasswordService,
      {} as JwtService,
      jwtConfiguration,
    );

    await expect(
      service.resolveAuthenticatedUser({
        sub: user.id,
        organizationId: user.organizationId,
        type: 'access',
      }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('hashes an accepted invitation password before updating the user', async () => {
    const response = {
      id: 'user-id',
      email: 'developer@example.com',
      name: 'Developer',
      status: UserStatus.Active,
      roles: ['DEVELOPER'],
      lastLoginAt: null,
      createdAt: '2026-07-29T10:00:00.000Z',
    };
    const acceptInvitation = jest.fn().mockResolvedValue(response);
    const ensureInvitationCanBeAccepted = jest
      .fn()
      .mockResolvedValue(undefined);
    const usersService = {
      acceptInvitation,
      ensureInvitationCanBeAccepted,
    } as unknown as UsersService;
    const hash = jest.fn().mockResolvedValue('stored-password-hash');
    const service = new AuthService(
      {} as DataSource,
      {} as OrganizationsService,
      usersService,
      { hash } as unknown as PasswordService,
      {} as JwtService,
      jwtConfiguration,
    );

    await expect(
      service.acceptInvitation({
        token: 'one-time-invitation-token',
        password: 'a-secure-password',
      }),
    ).resolves.toBe(response);
    expect(ensureInvitationCanBeAccepted).toHaveBeenCalledWith(
      'one-time-invitation-token',
    );
    expect(hash).toHaveBeenCalledWith('a-secure-password');
    expect(acceptInvitation).toHaveBeenCalledWith(
      'one-time-invitation-token',
      'stored-password-hash',
    );
  });

  it('rejects an invited user without attempting password verification', async () => {
    const user = {
      status: UserStatus.Invited,
      passwordHash: null,
      organization: {
        status: OrganizationStatus.Active,
      },
    } as UserEntity;
    const verify = jest.fn();
    const service = new AuthService(
      {} as DataSource,
      {} as OrganizationsService,
      {
        findForAuthentication: jest.fn().mockResolvedValue(user),
      } as unknown as UsersService,
      { verify } as unknown as PasswordService,
      {} as JwtService,
      jwtConfiguration,
    );

    await expect(
      service.login({
        email: 'invited@example.com',
        password: 'a-secure-password',
      }),
    ).rejects.toThrow(UnauthorizedException);
    expect(verify).not.toHaveBeenCalled();
  });
});
