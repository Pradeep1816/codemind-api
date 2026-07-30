import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from '../auth.service';
import { AuthenticatedUser } from '../interfaces/authenticated-user.interface';
import { JwtAuthGuard } from './jwt-auth.guard';

interface TestRequest {
  headers: {
    authorization?: string;
  };
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

describe('JwtAuthGuard', () => {
  it('allows endpoints explicitly marked as public', async () => {
    const isPublic = jest.fn().mockReturnValue(true);
    const reflector = {
      getAllAndOverride: isPublic,
    } as unknown as Reflector;
    const verifyToken = jest.fn();
    const guard = new JwtAuthGuard(
      reflector,
      { verifyAsync: verifyToken } as unknown as JwtService,
      {} as AuthService,
    );

    await expect(
      guard.canActivate(createContext({ headers: {} })),
    ).resolves.toBe(true);
    expect(verifyToken).not.toHaveBeenCalled();
  });

  it('verifies a bearer token and attaches the current user', async () => {
    const payload = {
      sub: 'user-id',
      organizationId: 'organization-id',
      type: 'access' as const,
    };
    const user: AuthenticatedUser = {
      id: 'user-id',
      email: 'pradeep@example.com',
      name: 'Pradeep Mahto',
      organization: {
        id: 'organization-id',
        name: 'CodeMind Labs',
        slug: 'codemind-labs',
      },
      roles: ['OWNER'],
    };
    const request: TestRequest = {
      headers: {
        authorization: 'Bearer signed-access-token',
      },
    };
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(false),
    } as unknown as Reflector;
    const verifyToken = jest.fn().mockResolvedValue(payload);
    const resolveAuthenticatedUser = jest.fn().mockResolvedValue(user);
    const guard = new JwtAuthGuard(
      reflector,
      { verifyAsync: verifyToken } as unknown as JwtService,
      { resolveAuthenticatedUser } as unknown as AuthService,
    );

    await expect(guard.canActivate(createContext(request))).resolves.toBe(true);
    expect(verifyToken).toHaveBeenCalledWith('signed-access-token');
    expect(resolveAuthenticatedUser).toHaveBeenCalledWith(payload);
    expect(request.user).toBe(user);
  });

  it('rejects a protected endpoint without a bearer token', async () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(false),
    } as unknown as Reflector;
    const guard = new JwtAuthGuard(
      reflector,
      {} as JwtService,
      {} as AuthService,
    );

    await expect(
      guard.canActivate(createContext({ headers: {} })),
    ).rejects.toThrow(UnauthorizedException);
  });
});
