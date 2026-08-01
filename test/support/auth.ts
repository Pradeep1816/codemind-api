import request from 'supertest';
import type { App } from 'supertest/types';

export type DefaultE2eRole = 'OWNER' | 'ADMIN' | 'DEVELOPER' | 'VIEWER';

interface RegisterResponseBody {
  organization: {
    id: string;
    name: string;
    slug: string;
  };
  user: {
    id: string;
    email: string;
    name: string;
  };
}

interface LoginResponseBody {
  accessToken: string;
  user: {
    organization: {
      id: string;
    };
  };
}

interface RoleResponseBody {
  id: string;
  name: DefaultE2eRole;
}

interface InvitationResponseBody {
  user: {
    id: string;
    email: string;
    name: string;
  };
  invitationToken: string;
}

export interface E2eIdentity {
  accessToken: string;
  organizationId: string;
  userId: string;
  email: string;
  password: string;
}

export async function registerAndLoginOwner(
  httpServer: App,
  identity: string,
): Promise<E2eIdentity> {
  const email = `owner-${identity}@example.test`;
  const password = 'CodeMind-E2E-Password-123!';
  const registration = await request(httpServer)
    .post('/api/v1/auth/register')
    .send({
      organizationName: `E2E Organization ${identity}`,
      organizationSlug: `e2e-${identity}`,
      name: `E2E Owner ${identity}`,
      email,
      password,
    })
    .expect(201);
  const registrationBody = registration.body as RegisterResponseBody;
  const loginResult = await login(httpServer, email, password);

  return {
    accessToken: loginResult.accessToken,
    organizationId: registrationBody.organization.id,
    userId: registrationBody.user.id,
    email,
    password,
  };
}

export async function inviteAcceptAndLogin(
  httpServer: App,
  ownerAccessToken: string,
  identity: string,
  roleName: Exclude<DefaultE2eRole, 'OWNER'>,
): Promise<E2eIdentity> {
  const rolesResponse = await request(httpServer)
    .get('/api/v1/roles')
    .set('Authorization', `Bearer ${ownerAccessToken}`)
    .expect(200);
  const roles = rolesResponse.body as RoleResponseBody[];
  const role = roles.find((candidate) => candidate.name === roleName);

  if (!role) {
    throw new Error(`E2E role ${roleName} was not found`);
  }

  const email = `${roleName.toLowerCase()}-${identity}@example.test`;
  const password = 'CodeMind-E2E-Password-456!';
  const invitationResponse = await request(httpServer)
    .post('/api/v1/users/invitations')
    .set('Authorization', `Bearer ${ownerAccessToken}`)
    .send({
      name: `E2E ${roleName} ${identity}`,
      email,
      roleIds: [role.id],
    })
    .expect(201);
  const invitation = invitationResponse.body as InvitationResponseBody;

  await request(httpServer)
    .post('/api/v1/auth/invitations/accept')
    .send({
      token: invitation.invitationToken,
      password,
    })
    .expect(200);

  const loginResult = await login(httpServer, email, password);

  return {
    accessToken: loginResult.accessToken,
    organizationId: loginResult.organizationId,
    userId: invitation.user.id,
    email,
    password,
  };
}

async function login(
  httpServer: App,
  email: string,
  password: string,
): Promise<{ accessToken: string; organizationId: string }> {
  const response = await request(httpServer)
    .post('/api/v1/auth/login')
    .send({ email, password })
    .expect(200);
  const body = response.body as LoginResponseBody;

  return {
    accessToken: body.accessToken,
    organizationId: body.user.organization.id,
  };
}
