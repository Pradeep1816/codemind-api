export interface AccessTokenPayload {
  sub: string;
  organizationId: string;
  type: 'access';
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
