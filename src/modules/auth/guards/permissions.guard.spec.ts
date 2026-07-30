import {
  ExecutionContext,
  ForbiddenException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../../../common/decorators/public.decorator';
import { REQUIRED_PERMISSIONS_KEY } from '../../../common/decorators/require-permissions.decorator';
import { OrganizationsService } from '../../organizations/organizations.service';
import type { AuthenticatedUser } from '../interfaces/authenticated-user.interface';
import { PermissionsGuard } from './permissions.guard';

interface TestRequest {
  user?: AuthenticatedUser;
}

function createContext(request: TestRequest): ExecutionContext {
  return {
    getHandler: jest.fn(),
    getClass: jest.fn(),
    switchToHttp: jest.fn().mockReturnValue({
      getRequest: jest.fn().mockReturnValue(request),
    }),
  } as unknown as ExecutionContext;
}

function createReflector(
  requiredPermissions?: string[],
  isPublic = false,
): Reflector {
  return {
    getAllAndOverride: jest.fn((key: string) => {
      if (key === IS_PUBLIC_KEY) {
        return isPublic;
      }

      if (key === REQUIRED_PERMISSIONS_KEY) {
        return requiredPermissions;
      }

      return undefined;
    }),
  } as unknown as Reflector;
}

const authenticatedUser: AuthenticatedUser = {
  id: 'user-id',
  email: 'owner@example.com',
  name: 'Owner',
  organization: {
    id: 'organization-id',
    name: 'CodeMind Labs',
    slug: 'codemind-labs',
  },
  roles: ['OWNER'],
};

describe('PermissionsGuard', () => {
  it('allows a route that does not declare permissions', async () => {
    const getUserPermissionNames = jest.fn();
    const guard = new PermissionsGuard(createReflector(), {
      getUserPermissionNames,
    } as unknown as OrganizationsService);

    await expect(
      guard.canActivate(createContext({ user: authenticatedUser })),
    ).resolves.toBe(true);
    expect(getUserPermissionNames).not.toHaveBeenCalled();
  });

  it('allows a user who has every required permission', async () => {
    const getUserPermissionNames = jest
      .fn()
      .mockResolvedValue(['user.read', 'user.manage', 'role.read']);
    const guard = new PermissionsGuard(
      createReflector(['user.read', 'user.manage']),
      { getUserPermissionNames } as unknown as OrganizationsService,
    );
    const request: TestRequest = {
      user: authenticatedUser,
    };

    await expect(guard.canActivate(createContext(request))).resolves.toBe(true);
    expect(getUserPermissionNames).toHaveBeenCalledWith(
      authenticatedUser.id,
      authenticatedUser.organization.id,
    );
    expect(request.user?.permissions).toEqual([
      'user.read',
      'user.manage',
      'role.read',
    ]);
  });

  it('rejects a user missing a required permission', async () => {
    const getUserPermissionNames = jest.fn().mockResolvedValue(['user.read']);
    const guard = new PermissionsGuard(
      createReflector(['user.read', 'user.manage']),
      { getUserPermissionNames } as unknown as OrganizationsService,
    );

    await expect(
      guard.canActivate(createContext({ user: authenticatedUser })),
    ).rejects.toThrow(ForbiddenException);
  });

  it('rejects a permission-protected route without an authenticated user', async () => {
    const guard = new PermissionsGuard(
      createReflector(['user.read']),
      {} as OrganizationsService,
    );

    await expect(guard.canActivate(createContext({}))).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('handles unexpected repository failures through the catch block', async () => {
    const consoleError = jest
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    const getUserPermissionNames = jest
      .fn()
      .mockRejectedValue(new Error('Database connection failed'));
    const guard = new PermissionsGuard(createReflector(['user.read']), {
      getUserPermissionNames,
    } as unknown as OrganizationsService);

    try {
      await expect(
        guard.canActivate(createContext({ user: authenticatedUser })),
      ).rejects.toThrow(ServiceUnavailableException);
      expect(consoleError).toHaveBeenCalledWith(
        'Permission authorization check failed',
        'Database connection failed',
      );
    } finally {
      consoleError.mockRestore();
    }
  });
});
