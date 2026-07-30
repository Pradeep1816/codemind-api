export interface AccessTokenPayload {
  sub: string;
  organizationId: string;
  sessionId: string;
  type: 'access';
}

export interface RefreshTokenPayload {
  sub: string;
  organizationId: string;
  sessionId: string;
  version: number;
  type: 'refresh';
}

export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
  organization: {
    id: string;
    name: string;
    slug: string;
  };
  roles: string[];
  permissions?: string[];
}

export interface AuthenticatedRequestUser extends AuthenticatedUser {
  sessionId: string;
}
