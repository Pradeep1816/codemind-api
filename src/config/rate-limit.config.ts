import { registerAs } from '@nestjs/config';

function readInteger(name: string, fallback: number): number {
  return Number.parseInt(process.env[name] ?? String(fallback), 10);
}

export const AUTH_RATE_LIMIT_POLICIES = {
  register: {
    limit: (): number => readInteger('AUTH_REGISTER_RATE_LIMIT', 3),
    ttl: (): number => readInteger('AUTH_RATE_LIMIT_TTL_MS', 60_000),
  },
  login: {
    limit: (): number => readInteger('AUTH_LOGIN_RATE_LIMIT', 5),
    ttl: (): number => readInteger('AUTH_RATE_LIMIT_TTL_MS', 60_000),
  },
  refresh: {
    limit: (): number => readInteger('AUTH_REFRESH_RATE_LIMIT', 20),
    ttl: (): number => readInteger('AUTH_RATE_LIMIT_TTL_MS', 60_000),
  },
  invitationAccept: {
    limit: (): number => readInteger('AUTH_INVITATION_ACCEPT_RATE_LIMIT', 5),
    ttl: (): number => readInteger('AUTH_RATE_LIMIT_TTL_MS', 60_000),
  },
  invitationCreate: {
    limit: (): number => readInteger('AUTH_INVITATION_CREATE_RATE_LIMIT', 10),
    ttl: (): number => readInteger('AUTH_RATE_LIMIT_TTL_MS', 60_000),
  },
} as const;

export const REPOSITORY_RATE_LIMIT_POLICIES = {
  sync: {
    limit: (): number => readInteger('REPOSITORY_SYNC_RATE_LIMIT', 5),
    ttl: (): number => readInteger('REPOSITORY_SYNC_RATE_LIMIT_TTL_MS', 60_000),
  },
} as const;

export default registerAs('rateLimit', () => ({
  ttlMs: readInteger('RATE_LIMIT_TTL_MS', 60_000),
  defaultLimit: readInteger('RATE_LIMIT_DEFAULT_LIMIT', 120),
}));
