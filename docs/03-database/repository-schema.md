# Repository Database Schema

## Document information

Status: Foundation and branch lifecycle implemented
Version: 2.1
Owner: CodeMind Engineering

## Purpose

This document records the PostgreSQL schema implemented for repository
registration, repository memberships, and Git branches.

The complete relationship diagram, field definitions, and lifecycle rules are
in [Repository Data Model](repository-model.md).

## Tables

### `repositories`

Stores organization-owned repository metadata.

Primary key:

- `id` — auto-increment integer

Foreign keys:

- `organization_id -> organizations.id` with `ON DELETE RESTRICT`
- `created_by_user_id -> users.id` with `ON DELETE SET NULL`

Indexes:

- Unique `(organization_id, remote_url)`
- `(organization_id, status, created_at)`
- `(created_by_user_id)`

### `repository_members`

Stores user access grants for individual repositories.

Primary key:

- `id` — auto-increment integer

Foreign keys:

- `repository_id -> repositories.id` with `ON DELETE CASCADE`
- `user_id -> users.id` with `ON DELETE CASCADE`
- `added_by_user_id -> users.id` with `ON DELETE SET NULL`

Indexes:

- Unique `(repository_id, user_id)`
- `(user_id)`
- `(added_by_user_id)`

### `repository_branches`

Stores the last known branch state from the Git provider.

Primary key:

- `id` — auto-increment integer

Foreign keys:

- `repository_id -> repositories.id` with `ON DELETE CASCADE`

Indexes:

- Unique `(repository_id, name)`
- `(repository_id, status)`
- `(last_indexed_at)`

Synchronization upserts observed branches as `active`, updates changed commit
SHAs, and marks missing remote branches as `deleted`. It never hard-deletes a
branch during synchronization and does not change `last_indexed_at`.

## PostgreSQL enums

```text
repository_provider:
  github | gitlab | bitbucket | generic

repository_status:
  active | disabled

repository_branch_status:
  active | deleted
```

## Migration

The schema is managed by:

```text
src/database/migrations/1785510000000-AddRepositories.ts
```

TypeORM schema synchronization remains disabled. Apply reviewed changes only
through the migration workflow.
