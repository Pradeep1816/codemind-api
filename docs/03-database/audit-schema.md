# Authentication Audit Schema

## Document information

Module: Authentication
Status: Implemented foundation
Version: 1.0
Owner: CodeMind Engineering Team

## Purpose

The authentication audit foundation records security-sensitive identity and
access events in PostgreSQL. It supports incident investigation, organization
administration, and future monitoring without retaining reusable credentials.

This table covers authentication and organization-user lifecycle events. A
future product-wide audit module may extend the model for repository,
knowledge, AI, worker, and MCP activity.

## Data flow

```text
Authentication or user-management operation
    |
    v
Application service
    |
    v
AuthAuditService
    |
    v
AuthAuditRepository
    |
    v
auth_audit_events
```

Successful registration, invitation, status, and role mutations write their
audit event through the same TypeORM transaction as the business change.
Login, refresh, replay detection, and logout use best-effort audit writes so an
observability outage does not block credential verification or revocation.

## Table: `auth_audit_events`

| Column | Type | Nullable | Purpose |
|---|---|---:|---|
| `id` | `uuid` | No | Event identifier |
| `organization_id` | `uuid` | Yes | Tenant associated with the event |
| `actor_user_id` | `uuid` | Yes | User that performed the operation |
| `subject_user_id` | `uuid` | Yes | User affected by the operation |
| `session_id` | `uuid` | Yes | Session associated with the event |
| `event_type` | `varchar(80)` | No | Stable machine-readable event name |
| `outcome` | `varchar(20)` | No | `success` or `failure` |
| `ip_address` | `varchar(45)` | Yes | Bounded request IP |
| `user_agent` | `varchar(512)` | Yes | Bounded client user agent |
| `metadata` | `jsonb` | Yes | Event-specific non-secret context |
| `created_at` | `timestamptz` | No | Database creation time |

Organization, actor, subject, and session foreign keys use `ON DELETE SET
NULL`. This preserves an event when a referenced identity is later removed.

## Event types

```text
registration.succeeded
registration.failed
login.succeeded
login.failed
refresh.succeeded
refresh.failed
refresh.reuse_detected
logout
logout.all
session.revoked
invitation.created
invitation.accepted
user.status_changed
user.roles_changed
```

## Metadata rules

Audit metadata may include status transitions, role names, revoked-session
counts, and a stable failure reason. It must never include:

- Plaintext passwords or password hashes
- Raw access or refresh tokens
- Raw invitation tokens
- JWT signing secrets
- Database credentials

For an unknown registration or login identity, CodeMind stores only a
normalized SHA-256 identifier. This allows repeated-failure correlation
without retaining the submitted email or organization slug in audit metadata.

## Indexes

| Index | Purpose |
|---|---|
| `(organization_id, created_at)` | Tenant-scoped event timeline |
| `(actor_user_id)` | Actor investigation |
| `(subject_user_id)` | Affected-user investigation |
| `(event_type, created_at)` | Event-category monitoring |

## Organization API

`GET /api/v1/auth/audit-events` requires `audit.read`. The organization ID is
always taken from the authenticated identity.

Supported query parameters:

- `page`, default `1`
- `limit`, default `20`, maximum `100`
- `eventType`, one of the defined event names
- `outcome`, `success` or `failure`

The default `OWNER` and `ADMIN` roles include `audit.read`. `DEVELOPER` and
`VIEWER` do not.

## Relevant implementation

```text
src/modules/auth/audit/
src/database/migrations/1785425000000-AddAuthAuditEvents.ts
src/database/seeds/permissions.seed.ts
src/database/seeds/roles.seed.ts
```
