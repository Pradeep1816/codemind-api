# CodeMind API Rate Limiting

## Document information

Status: Implemented
Version: 1.0
Owner: CodeMind Engineering Team

## Purpose

Rate limiting protects authentication endpoints from automated abuse and
provides a baseline safeguard against accidental API overload. It runs as a
global NestJS guard before controller business logic.

## Request flow

```text
HTTP request
    |
    v
Resolve client IP
    |
    v
Global throttler guard
    |
    +-- limit exceeded --> 429 Too Many Requests
    |
    v
Authentication and permission guards
    |
    v
Controller and service
```

The default tracker is the client IP address. CodeMind does not use an email
address or bearer token as a rate-limit key because doing so would require
reading credentials before the guard executes.

## Implemented policies

The global policy applies to every route. Authentication, invitation, and
repository synchronization routes override it with stricter limits.

| Scope or endpoint | Default requests | Default window |
|---|---:|---:|
| All routes | 120 | 60 seconds |
| `POST /api/v1/auth/register` | 3 | 60 seconds |
| `POST /api/v1/auth/login` | 5 | 60 seconds |
| `POST /api/v1/auth/refresh` | 20 | 60 seconds |
| `POST /api/v1/auth/invitations/accept` | 5 | 60 seconds |
| `POST /api/v1/users/invitations` | 10 | 60 seconds |
| `POST /api/v1/repositories/:repositoryId/branches/sync` | 5 | 60 seconds |

The guard returns HTTP `429 Too Many Requests` when the applicable limit is
exceeded.

## Configuration

```env
RATE_LIMIT_TTL_MS=60000
RATE_LIMIT_DEFAULT_LIMIT=120
AUTH_RATE_LIMIT_TTL_MS=60000
AUTH_REGISTER_RATE_LIMIT=3
AUTH_LOGIN_RATE_LIMIT=5
AUTH_REFRESH_RATE_LIMIT=20
AUTH_INVITATION_ACCEPT_RATE_LIMIT=5
AUTH_INVITATION_CREATE_RATE_LIMIT=10
REPOSITORY_SYNC_RATE_LIMIT_TTL_MS=60000
REPOSITORY_SYNC_RATE_LIMIT=5
```

Startup validation rejects non-integer, zero, negative, or excessively large
values. Durations are expressed in milliseconds.

## Reverse proxies

Express uses the direct network peer as the client IP by default. When a
trusted reverse proxy runs on the same host, configure:

```env
TRUST_PROXY=loopback
```

Leave `TRUST_PROXY=false` when clients connect directly. Enabling proxy trust
for an unknown network can allow a client to spoof forwarded IP values and
bypass IP-based throttling.

## Deployment limitation

The current throttler storage is in memory and belongs to one Node.js process.
That provides correct limits for a single API instance. Multiple replicas
would maintain independent counters and therefore require a shared throttler
storage provider, normally Redis, before horizontal production scaling.

## Future policies

Repository indexing, AI generation, and other expensive product operations
will require user-, organization-, quota-, and cost-aware limits. Those
policies are separate from the current IP-based HTTP abuse protection and
should be added when their owning modules are implemented.

## Relevant implementation

```text
src/config/rate-limit.config.ts
src/config/env.validation.ts
src/modules/auth/rate-limit.module.ts
src/modules/auth/auth.controller.ts
src/modules/users/users.controller.ts
src/modules/repositories/repository-branches.controller.ts
src/main.ts
```
