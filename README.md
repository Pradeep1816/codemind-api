# CodeMind

CodeMind is an AI-powered code intelligence platform for understanding,
maintaining, and evolving complex software systems.

It is designed to transform source code, repository metadata, database
structures, APIs, configuration, and documentation into persistent,
searchable knowledge for developers and AI coding agents.

## Vision

> AI should not repeatedly read code. AI should understand the system.

CodeMind will provide an intelligence layer between software repositories and
tools such as Codex, Cursor, Claude, IDEs, and custom AI agents.

```text
Repository
    |
    v
Indexing and parsing
    |
    v
Analysis and knowledge model
    |
    v
Search and optimized AI context
    |
    v
MCP and developer tools
```

## Current Status

CodeMind has completed Phase 3 indexing and code intelligence. Phase 4,
knowledge graph and business-logic extraction, is in progress with its
architecture, persistence foundation, domain concepts, and deterministic
business-rule extraction implemented.

Implemented:

- Modular NestJS backend structure
- Validated and namespaced environment configuration
- PostgreSQL connection through TypeORM
- TypeORM CLI and migration workflow
- Initial organization and RBAC database schema
- Idempotent permission and default-role database seeding
- Transactional organization and first-owner registration
- Argon2id password hashing
- JWT login and bearer-token authentication
- Rotating refresh tokens and database-backed session management
- Current-session, remote-session, and all-session logout
- Refresh-token reuse detection and session-family revocation
- Global and authentication endpoint rate limiting
- Persistent organization-scoped authentication security audit events
- Authenticated current-user endpoint
- Organization-scoped permission authorization guard
- Tenant-scoped organization user list and detail APIs
- One-time, expiring user invitation acceptance
- Tenant-scoped user status and role management APIs
- Active-OWNER continuity protection
- Tenant-scoped repository registration and metadata management
- Tenant-scoped repository membership and branch synchronization APIs
- Persistent repository synchronization and branch health reporting
- Internal GitHub HTTPS and allow-listed local Git clone/fetch service
- Durable, tenant-scoped indexing job creation and status APIs
- Branch commit snapshotting and active indexing-job concurrency protection
- Isolated per-job indexing workspace preparation and targeted cleanup
- Bounded Git-tree file discovery with transactional active/deleted inventory
- Incremental Git-blob detection and immutable SHA-256 content versions
- Centralized source-language detection with parser-support classification
- Bounded TypeScript/JavaScript parsing with normalized syntax metadata
- Version-scoped, tenant-aware code symbol persistence
- Version-scoped import, export, and inheritance dependency graph
- Durable indexing lifecycle with atomic claims, leases, progress, cancellation,
  retries, and expired-job recovery
- PostgreSQL-backed background indexing worker with incremental completion
  markers and graceful shutdown
- Focused indexing/parser service tests and a deterministic PostgreSQL E2E
  pipeline covering incremental, full, retry, cancellation, and recovery flows
- Tenant-scoped Phase 3 snapshot streaming for downstream analysis
- Bounded immutable source reads tied to persisted commit and blob identities
- Versioned TypeScript/JavaScript analyzers for decorator, constructor
  injection, and unresolved call-site facts with source evidence
- Stable analysis fact identities, content fingerprints, diagnostics, and
  resource limits
- Migration-backed knowledge builds, immutable graph snapshots, typed nodes,
  edges, evidence, errors, and atomic current-snapshot publication
- Repository-wide architecture classification and bounded call resolution for
  modules, controllers, services, repositories, entities, providers, and
  configuration components
- Evidence-backed `contains`, `depends_on`, and resolved `calls` graph
  projection with explicit unresolved and ambiguous call results
- Evidence-backed domain concepts from entities, domain types, boundary types,
  and service boundaries
- Deterministic validation, permission, calculation, state-constraint,
  eligibility, and scheduling rule extraction without executing source
- Knowledge projection for component `represents` and `enforces` relationships
- Evidence-backed enum states and explicit state transitions, with
  `transitions_to` edges only when both source and target states are proven
- Explicit event publication and handler extraction with evidence-backed
  `triggers` and `handles` relationships
- Database-aware `GET /health` endpoint
- URI API versioning under `/api/v1`
- Global request validation
- Helmet security headers
- Configurable CORS
- Graceful application shutdown

Not implemented yet:

- Invitation email delivery and invitation resend/revoke APIs
- Password reset, verified email, and MFA
- Organization settings APIs
- Function-call resolution and advanced static analysis
- Knowledge generation and search
- AI provider integration
- MCP server

## Technology

| Area             | Technology                               |
| ---------------- | ---------------------------------------- |
| Runtime          | Node.js and TypeScript                   |
| Backend          | NestJS                                   |
| Database         | PostgreSQL                               |
| ORM              | TypeORM                                  |
| Validation       | class-validator and class-transformer    |
| Password hashing | Argon2id                                 |
| Authentication   | Session-backed JWT access/refresh tokens |
| Authorization    | Organization-scoped RBAC permissions     |
| Rate limiting    | NestJS Throttler                         |
| Security headers | Helmet                                   |
| Testing          | Jest                                     |

## Prerequisites

- Node.js 20 or newer
- Yarn Classic
- PostgreSQL
- A PostgreSQL role allowed to access the CodeMind database

## Quick Start

### 1. Install dependencies

```bash
yarn install
```

### 2. Create the database

Create a PostgreSQL database named `codemind` using pgAdmin or your preferred
PostgreSQL client.

### 3. Configure the environment

```bash
cp .env.example .env
```

Update `.env` with your local PostgreSQL credentials and replace `JWT_SECRET`
and `JWT_REFRESH_SECRET` with different secure values containing at least 32
characters.

Minimum database configuration:

```env
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_USER=postgres
DATABASE_PASSWORD=your_postgres_password
DATABASE_NAME=codemind
DATABASE_SSL=false
```

See [src/config/README.md](src/config/README.md) for all configuration values,
defaults, validation rules, and usage examples.

### 4. Run migrations

```bash
yarn migration:run
```

### 5. Seed permissions and roles

```bash
yarn seed
```

The seed command is idempotent and can be run again after adding an
organization.

### 6. Start development mode

```bash
yarn start:dev
```

The versioned API base URL is:

```text
http://localhost:3000/api/v1
```

## Health Check

The health endpoint is intentionally unversioned so infrastructure can call it
directly:

```bash
curl http://localhost:3000/health
```

Healthy response:

```json
{
  "status": "ok",
  "timestamp": "2026-07-29T10:28:08.986Z",
  "uptime": 104,
  "checks": {
    "database": {
      "status": "up"
    }
  }
}
```

The endpoint executes a lightweight PostgreSQL query. It returns HTTP `200`
when the database is available and HTTP `503` if an established database
connection becomes unavailable.

## Registration

Create an organization and its first user:

```bash
curl -X POST http://localhost:3000/api/v1/auth/register \
  -H 'Content-Type: application/json' \
  -d '{
    "organizationName": "CodeMind Labs",
    "organizationSlug": "codemind-labs",
    "name": "Pradeep Mahto",
    "email": "pradeep@example.com",
    "password": "replace-with-a-secure-password"
  }'
```

`organizationSlug` accepts lowercase letters, numbers, and single hyphens.
Passwords must be between 12 and 128 characters.

A successful request returns HTTP `201`:

```json
{
  "organization": {
    "id": "d777f967-62db-428b-95cd-7d4896ec4754",
    "name": "CodeMind Labs",
    "slug": "codemind-labs"
  },
  "user": {
    "id": "c3d244c3-a37b-46cc-8832-64665fc9ef27",
    "email": "pradeep@example.com",
    "name": "Pradeep Mahto",
    "status": "active",
    "role": "OWNER"
  }
}
```

Registration runs in one database transaction. It creates the organization,
its default roles, the first user, and the user's `OWNER` assignment. A failure
at any stage rolls back the full operation. Password hashes are never returned.

## Authentication

Log in with the registered email and password:

```bash
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{
    "email": "pradeep@example.com",
    "password": "replace-with-a-secure-password"
  }'
```

A successful request returns HTTP `200`:

```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "tokenType": "Bearer",
  "expiresIn": "15m",
  "refreshExpiresIn": "30d",
  "user": {
    "id": "c3d244c3-a37b-46cc-8832-64665fc9ef27",
    "email": "pradeep@example.com",
    "name": "Pradeep Mahto",
    "organization": {
      "id": "d777f967-62db-428b-95cd-7d4896ec4754",
      "name": "CodeMind Labs",
      "slug": "codemind-labs"
    },
    "roles": ["OWNER"]
  }
}
```

Use the access token to retrieve the current authenticated identity:

```bash
curl http://localhost:3000/api/v1/auth/me \
  -H 'Authorization: Bearer <access-token>'
```

Access tokens identify a database-backed session and expire after 15 minutes.
Refresh tokens expire after 30 days and must be used only with the refresh
endpoint. Never send a refresh token as the bearer credential for normal API
requests.

Authentication is secure by default. Only `GET /health`,
`POST /api/v1/auth/register`, `POST /api/v1/auth/login`,
`POST /api/v1/auth/invitations/accept`, and
`POST /api/v1/auth/refresh` are public. The guard verifies the HS256 access
token, verifies its active session, and reloads the user, organization, and
roles from PostgreSQL. Revoked sessions and invited, suspended, or inactive
users and organizations are rejected immediately.

Permission-protected endpoints declare every permission they require:

```typescript
@RequirePermissions('user.read', 'user.manage')
@Post('users')
createUser() {}
```

The global permission guard resolves permissions through the authenticated
user's organization roles. All declared permissions are required. Missing
permissions return HTTP `403`; unexpected authorization-storage failures are
handled by the guard's `try/catch` block and return HTTP `503`.

Test the permission guard using the current user's permission endpoint:

```bash
curl http://localhost:3000/api/v1/auth/me/permissions \
  -H 'Authorization: Bearer <access-token>'
```

This endpoint requires `organization.read`. Every seeded default role includes
that permission. A successful request returns the complete permission-name
list resolved from the user's organization roles.

## Refresh Tokens and Sessions

Exchange the current refresh token for a new access/refresh pair:

```bash
curl -X POST http://localhost:3000/api/v1/auth/refresh \
  -H 'Content-Type: application/json' \
  -d '{"refreshToken":"<current-refresh-token>"}'
```

Every successful refresh rotates the refresh token and increments its
database-backed version. Replace the stored token with the newly returned
refresh token immediately. Reusing an older signed refresh token revokes that
session family and returns HTTP `401`.

The API stores only SHA-256 refresh-token hashes. Access and refresh tokens use
separately configurable signing secrets. `JWT_REFRESH_SECRET` falls back to
`JWT_SECRET` for local backward compatibility, but production must configure a
different refresh secret.

List the current user's active sessions:

```bash
curl http://localhost:3000/api/v1/auth/sessions \
  -H 'Authorization: Bearer <access-token>'
```

The response identifies the current session and includes bounded login
metadata:

```json
[
  {
    "id": "71b26c76-6520-45a0-8a27-bd8f8fe40c3b",
    "current": true,
    "ipAddress": "127.0.0.1",
    "userAgent": "curl/8.7.1",
    "createdAt": "2026-07-30T15:00:00.000Z",
    "lastUsedAt": null,
    "expiresAt": "2026-08-29T15:00:00.000Z"
  }
]
```

Logout the current session:

```bash
curl -X POST http://localhost:3000/api/v1/auth/logout \
  -H 'Authorization: Bearer <access-token>'
```

Logout every session for the current user:

```bash
curl -X POST http://localhost:3000/api/v1/auth/logout-all \
  -H 'Authorization: Bearer <access-token>'
```

Revoke another session owned by the current user:

```bash
curl -X DELETE http://localhost:3000/api/v1/auth/sessions/<session-id> \
  -H 'Authorization: Bearer <access-token>'
```

Logout and remote revocation immediately invalidate access tokens because the
global authentication guard checks session state on every protected request.
Suspending or deactivating a user revokes all their active sessions in the same
database transaction as the status change.

## Rate Limiting and Security Audit

Every HTTP endpoint has a default IP-based limit of 120 requests per 60
seconds. Security-sensitive endpoints use stricter defaults:

| Endpoint                               | Default limit per 60 seconds |
| -------------------------------------- | ---------------------------: |
| `POST /api/v1/auth/register`           |                            3 |
| `POST /api/v1/auth/login`              |                            5 |
| `POST /api/v1/auth/refresh`            |                           20 |
| `POST /api/v1/auth/invitations/accept` |                            5 |
| `POST /api/v1/users/invitations`       |                           10 |

Exceeding a limit returns HTTP `429 Too Many Requests`. The limits and time
window are configurable through environment variables. The current in-memory
storage is suitable for one application instance. A horizontally scaled
deployment must configure shared throttler storage so every instance uses the
same counters.

When CodeMind runs behind a trusted reverse proxy, configure
`TRUST_PROXY=loopback` so the limiter and audit records use the real forwarded
client IP. Leave it as `false` when requests connect directly to the API.

CodeMind persists successful and failed registration, login, refresh,
refresh-token replay, logout, invitation, user-status, and user-role events.
Raw passwords, JWTs, invitation tokens, and refresh tokens are never written
to audit metadata. Unknown email addresses and organization slugs are stored
only as SHA-256 identifiers for failure correlation.

Owners and administrators can list audit events because their seeded roles
include `audit.read`:

```bash
curl 'http://localhost:3000/api/v1/auth/audit-events?page=1&limit=20&eventType=login.failed&outcome=failure' \
  -H 'Authorization: Bearer <access-token>'
```

The endpoint is always scoped to the authenticated organization. Optional
filters are `eventType` and `outcome`; pagination accepts `page` and `limit`
with a maximum limit of 100.

## Organization Users

List users in the authenticated user's organization:

```bash
curl 'http://localhost:3000/api/v1/users?page=1&limit=20&search=owner&status=active' \
  -H 'Authorization: Bearer <access-token>'
```

The optional query parameters are:

- `page`: positive page number; defaults to `1`
- `limit`: number of users from `1` to `100`; defaults to `20`
- `search`: case-insensitive name or email search
- `status`: `invited`, `active`, `inactive`, or `suspended`

A successful response contains password-safe user records and pagination:

```json
{
  "data": [
    {
      "id": "25d8bd53-047b-42d8-9efa-4ecedfe422d3",
      "email": "owner01@example.com",
      "name": "Test Owner",
      "status": "active",
      "roles": ["OWNER"],
      "lastLoginAt": "2026-07-29T13:25:03.000Z",
      "createdAt": "2026-07-29T13:20:11.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 1,
    "totalPages": 1
  }
}
```

Retrieve one user:

```bash
curl http://localhost:3000/api/v1/users/25d8bd53-047b-42d8-9efa-4ecedfe422d3 \
  -H 'Authorization: Bearer <access-token>'
```

Both endpoints require `user.read`. Organization scope comes exclusively from
the authenticated identity. Requesting an ID outside that organization returns
HTTP `404` without revealing whether the user exists.

## User Invitations and Access Management

First list the roles belonging to the authenticated organization:

```bash
curl http://localhost:3000/api/v1/roles \
  -H 'Authorization: Bearer <access-token>'
```

This endpoint requires `role.read` and returns role IDs, names, and
descriptions. Use those IDs when inviting a user:

```bash
curl -X POST http://localhost:3000/api/v1/users/invitations \
  -H 'Authorization: Bearer <access-token>' \
  -H 'Content-Type: application/json' \
  -d '{
    "name": "CodeMind Developer",
    "email": "developer@example.com",
    "roleIds": ["<developer-role-id>"]
  }'
```

Creating an invitation requires both `user.manage` and `role.manage`. The
operation creates the user with `invited` status, assigns only roles from the
authenticated organization, and returns a cryptographically random token once:

```json
{
  "user": {
    "id": "69948ad4-c8ef-4f33-a111-68bb6972b4af",
    "email": "developer@example.com",
    "name": "CodeMind Developer",
    "status": "invited",
    "roles": ["DEVELOPER"],
    "lastLoginAt": null,
    "createdAt": "2026-07-29T15:00:00.000Z"
  },
  "invitationToken": "<one-time-token>",
  "expiresAt": "2026-08-01T15:00:00.000Z"
}
```

PostgreSQL stores only the token's SHA-256 hash. Until email delivery is
implemented, the authenticated caller must securely deliver the returned
one-time token to the invited user. Never log or persist the raw token.
Invitation lifetime is configured with `INVITATION_TTL_HOURS`, which defaults
to 72 hours.

Accept the invitation and set the initial password:

```bash
curl -X POST http://localhost:3000/api/v1/auth/invitations/accept \
  -H 'Content-Type: application/json' \
  -d '{
    "token": "<one-time-token>",
    "password": "replace-with-a-secure-password"
  }'
```

Acceptance is public because the invitation token is the credential. The token
is checked before Argon2 work, locked and checked again in a transaction, then
cleared after use. The user becomes active and can log in normally. Expired,
invalid, or previously used tokens return HTTP `400`.

Suspend or reactivate a user:

```bash
curl -X PATCH http://localhost:3000/api/v1/users/<user-id>/status \
  -H 'Authorization: Bearer <access-token>' \
  -H 'Content-Type: application/json' \
  -d '{"status":"suspended"}'
```

Allowed administrative status values are `active`, `inactive`, and
`suspended`. An invited user must accept the invitation before status can be
managed. This endpoint requires `user.manage`.

Replace all roles assigned to a user:

```bash
curl -X PUT http://localhost:3000/api/v1/users/<user-id>/roles \
  -H 'Authorization: Bearer <access-token>' \
  -H 'Content-Type: application/json' \
  -d '{"roleIds":["<developer-role-id>"]}'
```

Role replacement requires both `user.manage` and `role.manage`. At least one
organization-owned role is required. Status and role mutations are
transactional and tenant-scoped. CodeMind serializes these mutations at the
organization boundary and rejects any operation that would remove or disable
the last active `OWNER`.

## Repository Registration

Register credential-free repository metadata:

```bash
curl -X POST http://localhost:3000/api/v1/repositories \
  -H 'Authorization: Bearer <access-token>' \
  -H 'Content-Type: application/json' \
  -d '{
    "name": "CodeMind API",
    "remoteUrl": "https://github.com/codemind/codemind-api.git",
    "defaultBranch": "main"
  }'
```

Registration requires `repository.create`. CodeMind accepts only HTTPS URLs
without embedded credentials, query parameters, or fragments. Provider type
is detected from the hostname. The same normalized URL cannot be registered
twice in one organization.

List tenant-scoped repositories:

```bash
curl 'http://localhost:3000/api/v1/repositories?page=1&limit=20&provider=github&status=active' \
  -H 'Authorization: Bearer <access-token>'
```

`GET /repositories` and `GET /repositories/:repositoryId` require
`repository.read`. `PATCH /repositories/:repositoryId` updates the name,
default branch, or active/disabled status and requires `repository.create`.
`DELETE /repositories/:repositoryId` requires `repository.delete`.

Add an organization user to a repository:

```bash
curl -X POST http://localhost:3000/api/v1/repositories/101/members \
  -H 'Authorization: Bearer <access-token>' \
  -H 'Content-Type: application/json' \
  -d '{"userId":"<organization-user-id>"}'
```

Membership listing requires `repository.read`. Adding or removing members
requires both `repository.read` and `repository.member.manage`; the default
`OWNER` and `ADMIN` roles receive the management permission. The repository
and target user must belong to the authenticated organization.

Organization ownership always comes from the authenticated identity.
Cross-organization IDs return HTTP `404`.

The internal Git layer can validate and clone credential-free GitHub HTTPS
repositories or allow-listed local repositories. It uses isolated,
organization/repository-derived workspaces, disables hooks and interactive
credentials, enforces protocol and output limits, and fetches branches without
checking out or executing repository code.

Synchronize the registered repository and persist its remote branches:

```bash
curl -X POST http://localhost:3000/api/v1/repositories/101/branches/sync \
  -H 'Authorization: Bearer <access-token>'
```

Synchronization requires `repository.read` and `repository.index`. The first
request clones the repository without a checkout; later requests fetch and
prune remote refs. Concurrent requests for the same repository are coalesced
inside one API process. List persisted active and deleted branch records with:

```bash
curl http://localhost:3000/api/v1/repositories/101/branches \
  -H 'Authorization: Bearer <access-token>'
```

Inspect synchronization, indexing, branch, and Git object-storage health
without performing Git I/O:

```bash
curl http://localhost:3000/api/v1/repositories/101/status \
  -H 'Authorization: Bearer <access-token>'
```

Successful and failed synchronization attempts are recorded. A failed attempt
does not erase the previous successful timestamp or repository size.

See the
[repository data model](docs/03-database/repository-model.md) for its ER
diagram and database constraints.

## Identity and Access Schema

The identity migrations create the six RBAC entities, database-backed
authentication sessions, and persistent authentication audit events:

```text
Organization -> User -> UserRole <- Role <- Organization
                     Role -> RolePermission <- Permission
                     User -> AuthSession
Organization/User/AuthSession -> AuthAuditEvent
```

| Entity           | Responsibility                                       |
| ---------------- | ---------------------------------------------------- |
| `Organization`   | Tenant boundary, plan, and status                    |
| `User`           | Organization user identity and authentication state  |
| `Role`           | Organization-scoped access role                      |
| `Permission`     | Global resource/action capability                    |
| `UserRole`       | Explicit user-to-role assignment                     |
| `RolePermission` | Explicit role-to-permission assignment               |
| `AuthSession`    | Rotating refresh-token and login-session state       |
| `AuthAuditEvent` | Security event actor, subject, session, and metadata |

Database changes must use migrations. TypeORM schema synchronization is
disabled.

Global permissions are seeded once. The `OWNER`, `ADMIN`, `DEVELOPER`, and
`VIEWER` roles are scoped to an organization. The seed runner creates missing
default roles for existing organizations without deleting additional
role-permission assignments.

## Migration Workflow

Create an empty migration:

```bash
yarn migration:create src/database/migrations/AddFeature
```

Generate a migration from entity changes:

```bash
yarn migration:generate src/database/migrations/AddFeature
```

Review the generated SQL before applying it.

```bash
yarn migration:show
yarn migration:run
yarn migration:revert
```

`migration:revert` changes the database and may remove data introduced after
the reverted migration. Use it carefully.

## Project Structure

```text
src/
├── app.module.ts
├── main.ts
├── common/
│   ├── decorators/
│   ├── filters/
│   ├── guards/
│   ├── interceptors/
│   ├── middleware/
│   ├── pipes/
│   └── utils/
├── config/
├── database/
│   ├── data-source.ts
│   ├── database.module.ts
│   ├── migrations/
│   └── seeds/
└── modules/
    ├── auth/
    ├── users/
    │   └── entities/
    ├── organizations/
    │   └── entities/
    ├── repositories/
    ├── indexing/
    ├── parser/
    ├── analysis/
    ├── knowledge/
    ├── search/
    ├── ai/
    ├── documentation/
    ├── mcp/
    └── health/
```

Feature modules own their business rules. Shared technical concerns belong in
`common`, application settings belong in `config`, and persistence
infrastructure belongs in `database`.

See
[docs/01-architecture/backend-structure.md](docs/01-architecture/backend-structure.md)
for module boundaries, dependency rules, naming conventions, and the
development workflow.

## Available Commands

| Command                   | Purpose                                   |
| ------------------------- | ----------------------------------------- |
| `yarn start`              | Start the application                     |
| `yarn start:dev`          | Start in watch mode                       |
| `yarn start:debug`        | Start in debug/watch mode                 |
| `yarn build`              | Build the production output               |
| `yarn start:prod`         | Run the compiled application              |
| `yarn lint`               | Lint and fix TypeScript files             |
| `yarn format`             | Format TypeScript files                   |
| `yarn test`               | Run unit tests                            |
| `yarn test:watch`         | Run unit tests in watch mode              |
| `yarn test:cov`           | Generate test coverage                    |
| `yarn test:e2e:db:create` | Create the isolated PostgreSQL test DB    |
| `yarn test:e2e`           | Run end-to-end tests                      |
| `yarn migration:create`   | Create an empty migration                 |
| `yarn migration:generate` | Generate a migration from entity changes  |
| `yarn migration:show`     | Show applied and pending migrations       |
| `yarn migration:run`      | Apply pending migrations                  |
| `yarn migration:revert`   | Revert the latest migration               |
| `yarn seed`               | Synchronize permissions and default roles |

## Development Checks

Before submitting a change:

```bash
yarn build
yarn lint
yarn test
yarn test:e2e
```

Run `yarn test:e2e:db:create` once before the first E2E run. See
[test/README.md](test/README.md) for database isolation and configuration.

When entities change:

```bash
yarn migration:generate src/database/migrations/DescribeTheChange
yarn migration:run
```

Never enable automatic schema synchronization in production.

## Documentation

- [Vision](docs/00-overview/vision.md)
- [Problem statement](docs/00-overview/problem-statement.md)
- [System overview](docs/01-architecture/system-overview.md)
- [Backend structure](docs/01-architecture/backend-structure.md)
- [Database architecture](docs/03-database/database-architecture.md)
- [API overview](docs/04-api/api-overview.md)
- [Repository API](docs/04-api/repository-api.md)
- [Repository module](docs/02-core-modules/repository.md)
- [Repository schema](docs/03-database/repository-schema.md)
- [Indexing module](docs/02-core-modules/indexing.md)
- [Parser module](docs/02-core-modules/parser.md)
- [Indexing API](docs/04-api/indexing-api.md)
- [Indexing schema](docs/03-database/indexing-strategy.md)
- [Analysis module](docs/02-core-modules/analysis.md)
- [Knowledge module](docs/02-core-modules/knowledge.md)
- [Knowledge graph schema proposal](docs/03-database/knowledge-graph-schema.md)
- [Roadmap](docs/05-roadmap/roadmap.md)
- [Milestones](docs/05-roadmap/milestones.md)
- [Architecture decisions](docs/06-adrs/README.md)

## Security

- Never commit `.env` or real credentials.
- Use a secret manager in production.
- Enable PostgreSQL SSL for remote production databases.
- Restrict CORS to trusted origins.
- Configure trusted proxy handling only for known deployment proxies.
- Use shared rate-limit storage when running multiple API instances.
- Apply and review migrations before deploying application code.
- Validate organization ownership when assigning a role to a user.

## License

CodeMind is private and currently unlicensed for external distribution.
