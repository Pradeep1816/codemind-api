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
import { AuthAuditService } from './audit/auth-audit.service';
import {
  AuthAuditEventType,
  AuthAuditOutcome,
} from './audit/entities/auth-audit-event.entity';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { PasswordService } from './password.service';
import {
  AuthSessionRotationResult,
  AuthSessionsService,
  CreateAuthSessionInput,
  RotateAuthSessionInput,
} from './sessions/auth-sessions.service';

describe('AuthService', () => {
  const requestMetadata = {
    ipAddress: '127.0.0.1',
    userAgent: 'Jest',
  };
  const recordAuditEvent = jest.fn().mockResolvedValue(undefined);
  const recordAuditEventBestEffort = jest.fn().mockResolvedValue(undefined);
  const authAuditService = {
    hashIdentifier: jest.fn((value: string) => `hash:${value.toLowerCase()}`),
    record: recordAuditEvent,
    recordBestEffort: recordAuditEventBestEffort,
  } as unknown as AuthAuditService;
  const jwtConfiguration = {
    secret: 'a-secure-test-secret-that-is-long-enough',
    expiresIn: '15m',
    refreshSecret: 'a-different-refresh-secret-that-is-long-enough',
    refreshExpiresIn: '30d',
  };
  const input: RegisterDto = {
    organizationName: ' CodeMind Labs ',
    organizationSlug: 'codemind-labs',
    name: ' Pradeep Mahto ',
    email: 'Pradeep@Example.com',
    password: 'a-secure-password',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

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
      {} as AuthSessionsService,
      authAuditService,
    );

    const result = await service.register(input, requestMetadata);

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
    expect(recordAuditEvent).toHaveBeenCalledWith(
      {
        organizationId: organization.id,
        actorUserId: user.id,
        subjectUserId: user.id,
        eventType: AuthAuditEventType.RegistrationSucceeded,
        outcome: AuthAuditOutcome.Success,
        request: requestMetadata,
      },
      manager,
    );
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
      {} as AuthSessionsService,
      authAuditService,
    );

    await expect(service.register(input, requestMetadata)).rejects.toBe(
      conflict,
    );
    expect(recordAuditEventBestEffort).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: AuthAuditEventType.RegistrationFailed,
        outcome: AuthAuditOutcome.Failure,
        request: requestMetadata,
      }),
    );
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
    const signToken = jest
      .fn()
      .mockResolvedValueOnce('signed-access-token')
      .mockResolvedValueOnce('signed-refresh-token');
    const jwtService = {
      signAsync: signToken,
    } as unknown as JwtService;
    const createSession = jest.fn().mockResolvedValue(undefined);
    const service = new AuthService(
      {} as DataSource,
      {} as OrganizationsService,
      usersService,
      passwordService,
      jwtService,
      jwtConfiguration,
      { create: createSession } as unknown as AuthSessionsService,
      authAuditService,
    );

    const result = await service.login(
      {
        email: 'Pradeep@Example.com',
        password: 'a-secure-password',
      },
      requestMetadata,
    );

    expect(findForAuthentication).toHaveBeenCalledWith('Pradeep@Example.com');
    expect(verifyPassword).toHaveBeenCalledWith(
      'stored-password-hash',
      'a-secure-password',
    );
    expect(signToken).toHaveBeenCalledTimes(2);
    expect(signToken).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        sub: user.id,
        organizationId: user.organizationId,
        type: 'access',
      }),
    );
    expect(signToken).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        sub: user.id,
        organizationId: user.organizationId,
        version: 1,
        type: 'refresh',
      }),
      {
        secret: jwtConfiguration.refreshSecret,
        algorithm: 'HS256',
        expiresIn: jwtConfiguration.refreshExpiresIn,
      },
    );
    expect(createSession).toHaveBeenCalledTimes(1);
    const [createdSession] = createSession.mock.calls[0] as unknown as [
      CreateAuthSessionInput,
    ];

    expect(createdSession).toMatchObject({
      userId: user.id,
      organizationId: user.organizationId,
      tokenVersion: 1,
      ipAddress: '127.0.0.1',
      userAgent: 'Jest',
    });
    expect(createdSession.refreshTokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(recordSuccessfulLogin).toHaveBeenCalledWith(user.id);
    expect(recordAuditEventBestEffort).toHaveBeenCalledWith({
      organizationId: user.organizationId,
      actorUserId: user.id,
      subjectUserId: user.id,
      sessionId: createdSession.id,
      eventType: AuthAuditEventType.LoginSucceeded,
      outcome: AuthAuditOutcome.Success,
      request: requestMetadata,
    });
    expect(result).toEqual({
      accessToken: 'signed-access-token',
      refreshToken: 'signed-refresh-token',
      tokenType: 'Bearer',
      expiresIn: '15m',
      refreshExpiresIn: '30d',
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
      {} as AuthSessionsService,
      authAuditService,
    );

    await expect(
      service.login(
        {
          email: 'pradeep@example.com',
          password: 'wrong-password',
        },
        requestMetadata,
      ),
    ).rejects.toThrow(UnauthorizedException);
    expect(recordAuditEventBestEffort).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: AuthAuditEventType.LoginFailed,
        outcome: AuthAuditOutcome.Failure,
      }),
    );
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
      {
        isActive: jest.fn().mockResolvedValue(true),
      } as unknown as AuthSessionsService,
      authAuditService,
    );

    await expect(
      service.resolveAuthenticatedUser({
        sub: user.id,
        organizationId: user.organizationId,
        sessionId: 'session-id',
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
      {} as AuthSessionsService,
      authAuditService,
    );

    await expect(
      service.acceptInvitation(
        {
          token: 'one-time-invitation-token',
          password: 'a-secure-password',
        },
        requestMetadata,
      ),
    ).resolves.toBe(response);
    expect(ensureInvitationCanBeAccepted).toHaveBeenCalledWith(
      'one-time-invitation-token',
    );
    expect(hash).toHaveBeenCalledWith('a-secure-password');
    expect(acceptInvitation).toHaveBeenCalledWith(
      'one-time-invitation-token',
      'stored-password-hash',
      requestMetadata,
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
      {} as AuthSessionsService,
      authAuditService,
    );

    await expect(
      service.login(
        {
          email: 'invited@example.com',
          password: 'a-secure-password',
        },
        requestMetadata,
      ),
    ).rejects.toThrow(UnauthorizedException);
    expect(verify).not.toHaveBeenCalled();
  });

  it('rotates a valid refresh token and returns a new token pair', async () => {
    const payload = {
      sub: 'user-id',
      organizationId: 'organization-id',
      sessionId: 'session-id',
      version: 1,
      type: 'refresh' as const,
    };
    const user = {
      id: payload.sub,
      organizationId: payload.organizationId,
      status: UserStatus.Active,
      organization: {
        status: OrganizationStatus.Active,
      },
    } as UserEntity;
    const verifyAsync = jest.fn().mockResolvedValue(payload);
    const signAsync = jest
      .fn()
      .mockResolvedValueOnce('next-access-token')
      .mockResolvedValueOnce('next-refresh-token');
    const rotate = jest
      .fn()
      .mockResolvedValue(AuthSessionRotationResult.Rotated);
    const service = new AuthService(
      {} as DataSource,
      {} as OrganizationsService,
      {
        findAuthenticatedIdentity: jest.fn().mockResolvedValue(user),
      } as unknown as UsersService,
      {} as PasswordService,
      { verifyAsync, signAsync } as unknown as JwtService,
      jwtConfiguration,
      { rotate } as unknown as AuthSessionsService,
      authAuditService,
    );

    const result = await service.refresh(
      'current-refresh-token',
      requestMetadata,
    );

    expect(verifyAsync).toHaveBeenCalledWith('current-refresh-token', {
      secret: jwtConfiguration.refreshSecret,
      algorithms: ['HS256'],
    });
    expect(rotate).toHaveBeenCalledTimes(1);
    const [rotation] = rotate.mock.calls[0] as unknown as [
      RotateAuthSessionInput,
    ];

    expect(rotation).toMatchObject({
      sessionId: payload.sessionId,
      userId: payload.sub,
      organizationId: payload.organizationId,
      tokenVersion: 1,
    });
    expect(rotation.presentedTokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(rotation.nextTokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(result).toEqual({
      accessToken: 'next-access-token',
      refreshToken: 'next-refresh-token',
      tokenType: 'Bearer',
      expiresIn: '15m',
      refreshExpiresIn: '30d',
    });
  });

  it('records refresh-token reuse without exposing the raw token', async () => {
    const payload = {
      sub: 'user-id',
      organizationId: 'organization-id',
      sessionId: 'session-id',
      version: 1,
      type: 'refresh' as const,
    };
    const user = {
      id: payload.sub,
      organizationId: payload.organizationId,
      status: UserStatus.Active,
      organization: {
        status: OrganizationStatus.Active,
      },
    } as UserEntity;
    const service = new AuthService(
      {} as DataSource,
      {} as OrganizationsService,
      {
        findAuthenticatedIdentity: jest.fn().mockResolvedValue(user),
      } as unknown as UsersService,
      {} as PasswordService,
      {
        verifyAsync: jest.fn().mockResolvedValue(payload),
        signAsync: jest
          .fn()
          .mockResolvedValueOnce('next-access-token')
          .mockResolvedValueOnce('next-refresh-token'),
      } as unknown as JwtService,
      jwtConfiguration,
      {
        rotate: jest.fn().mockResolvedValue(AuthSessionRotationResult.Reused),
      } as unknown as AuthSessionsService,
      authAuditService,
    );
    const consoleError = jest
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);

    await expect(
      service.refresh('reused-refresh-token', requestMetadata),
    ).rejects.toThrow(UnauthorizedException);
    expect(recordAuditEventBestEffort).toHaveBeenCalledWith({
      organizationId: payload.organizationId,
      actorUserId: payload.sub,
      subjectUserId: payload.sub,
      sessionId: payload.sessionId,
      eventType: AuthAuditEventType.RefreshReuseDetected,
      outcome: AuthAuditOutcome.Failure,
      request: requestMetadata,
      metadata: { reason: 'token_reuse' },
    });
    expect(JSON.stringify(recordAuditEventBestEffort.mock.calls)).not.toContain(
      'reused-refresh-token',
    );

    consoleError.mockRestore();
  });
});
