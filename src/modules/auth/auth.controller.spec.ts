import { Request } from 'express';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AuthenticatedRequestUser } from './interfaces/authenticated-user.interface';

describe('AuthController', () => {
  const request = {
    ip: '127.0.0.1',
    get: jest.fn().mockReturnValue('Test User Agent'),
  } as unknown as Request;
  const requestMetadata = {
    ipAddress: '127.0.0.1',
    userAgent: 'Test User Agent',
  };
  const currentUser: AuthenticatedRequestUser = {
    id: 'user-id',
    email: 'owner@example.com',
    name: 'Owner',
    organization: {
      id: 'organization-id',
      name: 'CodeMind Labs',
      slug: 'codemind-labs',
    },
    roles: ['OWNER'],
    sessionId: 'session-id',
  };

  it('captures bounded request metadata when logging in', async () => {
    const response = { accessToken: 'access-token' };
    const login = jest.fn().mockResolvedValue(response);
    const controller = new AuthController({
      login,
    } as unknown as AuthService);
    const input = {
      email: 'owner@example.com',
      password: 'a-secure-password',
    };

    await expect(controller.login(input, request)).resolves.toBe(response);
    expect(login).toHaveBeenCalledWith(input, requestMetadata);
  });

  it('does not expose the internal session ID from the current-user endpoint', () => {
    const controller = new AuthController({} as AuthService);

    expect(controller.me(currentUser)).toEqual({
      id: currentUser.id,
      email: currentUser.email,
      name: currentUser.name,
      organization: currentUser.organization,
      roles: currentUser.roles,
      permissions: undefined,
    });
  });

  it('uses only the authenticated user when revoking sessions', async () => {
    const logout = jest.fn().mockResolvedValue(true);
    const logoutAll = jest.fn().mockResolvedValue({ revokedSessions: 2 });
    const revokeSession = jest.fn().mockResolvedValue(undefined);
    const controller = new AuthController({
      logout,
      logoutAll,
      revokeSession,
    } as unknown as AuthService);

    await controller.logout(currentUser, request);
    await controller.logoutAll(currentUser, request);
    await controller.revokeSession(currentUser, 'other-session-id', request);

    expect(logout).toHaveBeenCalledWith(
      currentUser.sessionId,
      currentUser.id,
      currentUser.organization.id,
      requestMetadata,
    );
    expect(logoutAll).toHaveBeenCalledWith(
      currentUser.id,
      currentUser.organization.id,
      currentUser.sessionId,
      requestMetadata,
    );
    expect(revokeSession).toHaveBeenCalledWith(
      'other-session-id',
      currentUser.id,
      currentUser.organization.id,
      requestMetadata,
    );
  });
});
