# Repository Module

## Document information

Status: Repository CRUD and membership implemented
Version: 2.1
Owner: CodeMind Engineering

## Purpose

The repository module owns the software repositories registered with
CodeMind. It establishes the organization boundary and stable repository
identity required by future cloning, indexing, parsing, analysis, search, and
knowledge features.

The current slice manages repository metadata only. Registering a repository
does not clone it or start indexing.

## Responsibilities

Implemented:

- Register a credential-free HTTPS Git repository
- Detect GitHub, GitLab, Bitbucket, or generic HTTPS providers
- Prevent duplicate remote URLs inside one organization
- List and filter organization repositories
- Retrieve one organization repository
- Update display name, default branch, and active/disabled status
- Delete an organization repository
- Preserve the creating user when available
- Add, list, and remove organization-user repository memberships
- Enforce membership management through `repository.member.manage`
- Persist branch names, commit SHAs, lifecycle status, and index timestamps
- Return `404` for cross-organization IDs

Next:

- Branch synchronization and listing APIs
- Git credential references
- Clone and fetch adapter
- Durable indexing jobs
- File inventory and content hashes
- Incremental indexing

Not owned by this module:

- AST parsing
- Static analysis
- Embeddings
- Knowledge extraction
- AI answers

## Request flow

```text
Authenticated request
    |
    v
Global JWT and permission guards
    |
    v
RepositoriesController / RepositoryMembersController
    |
    v
RepositoriesService / RepositoryMembersService
    |
    v
RepositoriesRepository / RepositoryMembersRepository
    |
    v
PostgreSQL
```

Controllers obtain `organizationId` and the creating user ID from
`CurrentUser`. Clients never submit an organization ID.

## Domain model

### `RepositoryEntity`

| Field | Type | Purpose |
|---|---|---|
| `id` | Auto-increment integer | Stable repository identity |
| `organizationId` | UUID | Mandatory tenant boundary |
| `createdByUserId` | UUID or null | User that registered the repository |
| `name` | varchar(160) | Organization-facing display name |
| `provider` | enum | `github`, `gitlab`, `bitbucket`, or `generic` |
| `remoteUrl` | varchar(2048) | Normalized credential-free HTTPS Git URL |
| `defaultBranch` | varchar(255) or null | Configured branch, if known |
| `status` | enum | `active` or `disabled` |
| `createdAt` | timestamptz | Creation time |
| `updatedAt` | timestamptz | Last metadata change |

### `RepositoryMemberEntity`

| Field | Type | Purpose |
|---|---|---|
| `id` | Auto-increment integer | Membership identity |
| `repositoryId` | Integer | Repository receiving the access grant |
| `userId` | UUID | User receiving access |
| `addedByUserId` | UUID or null | User that created the grant |
| `createdAt` | timestamptz | Grant creation time |

### `RepositoryBranchEntity`

| Field | Type | Purpose |
|---|---|---|
| `id` | Auto-increment integer | Branch identity |
| `repositoryId` | Integer | Parent repository |
| `name` | varchar(255) | Full branch name |
| `commitSha` | varchar(64) or null | Last observed Git object ID |
| `status` | enum | `active` or `deleted` |
| `lastIndexedAt` | timestamptz or null | Last successful indexing time |
| `createdAt` | timestamptz | First observation time |
| `updatedAt` | timestamptz | Last metadata update |

### Constraints

- `UNIQUE (organization_id, remote_url)`
- `UNIQUE (repository_id, user_id)` for memberships
- `UNIQUE (repository_id, name)` for branches
- Organization foreign key uses `ON DELETE RESTRICT`
- Creating-user foreign key uses `ON DELETE SET NULL`
- Repository deletion cascades to memberships and branches
- Organization, status, and creation time are indexed for tenant lists

The same remote URL may be registered in different organizations because each
tenant owns its own future index and knowledge.

See
[Repository Data Model](../03-database/repository-model.md)
for the complete field definitions, deletion behavior, and ER diagram.

## URL policy

Registration accepts only HTTPS URLs that:

- Include a host and repository path
- Do not contain a username or password
- Do not contain query parameters or fragments
- Fit within 2,048 characters

URLs are normalized before uniqueness checks. Trailing slashes and default
HTTPS ports are removed by the URL parser. Repository URLs are immutable after
creation. Changing a remote source requires deleting and registering a new
repository identity.

This validation prevents credentials from being persisted. The future Git
adapter must additionally enforce network allow/deny rules before making any
outbound connection.

## API contract

Base path:

```text
/api/v1/repositories
```

| Method | Path | Permission | Purpose |
|---|---|---|---|
| `POST` | `/repositories` | `repository.create` | Register repository metadata |
| `GET` | `/repositories` | `repository.read` | List organization repositories |
| `GET` | `/repositories/:repositoryId` | `repository.read` | Retrieve one repository |
| `PATCH` | `/repositories/:repositoryId` | `repository.create` | Update mutable metadata |
| `DELETE` | `/repositories/:repositoryId` | `repository.delete` | Delete repository |
| `POST` | `/repositories/:repositoryId/members` | `repository.read`, `repository.member.manage` | Add member |
| `GET` | `/repositories/:repositoryId/members` | `repository.read` | List members |
| `DELETE` | `/repositories/:repositoryId/members/:userId` | `repository.read`, `repository.member.manage` | Remove member |

### Register

```json
{
  "name": "CodeMind API",
  "remoteUrl": "https://github.com/codemind/codemind-api.git",
  "defaultBranch": "main"
}
```

`defaultBranch` is optional. The provider is derived from the URL hostname and
cannot be supplied by the client.

Successful response:

```json
{
  "id": 101,
  "name": "CodeMind API",
  "provider": "github",
  "remoteUrl": "https://github.com/codemind/codemind-api.git",
  "defaultBranch": "main",
  "status": "active",
  "createdAt": "2026-07-31T10:00:00.000Z",
  "updatedAt": "2026-07-31T10:00:00.000Z"
}
```

Duplicate registration inside the organization returns HTTP `409`.

### List

Optional query parameters:

- `page`, default `1`
- `limit`, default `20`, maximum `100`
- `search`, matched against name and remote URL
- `provider`, one of the supported providers
- `status`, `active` or `disabled`

### Update

At least one mutable field is required:

```json
{
  "name": "CodeMind Backend",
  "defaultBranch": "develop",
  "status": "disabled"
}
```

The remote URL and organization cannot be changed.

### Delete

Successful deletion returns HTTP `204`. An unknown or cross-organization ID
returns HTTP `404`.

### Membership

Add an organization user:

```json
{
  "userId": "25d8bd53-047b-42d8-9efa-4ecedfe422d3"
}
```

Successful response:

```json
{
  "id": 201,
  "user": {
    "id": "25d8bd53-047b-42d8-9efa-4ecedfe422d3",
    "email": "developer@example.com",
    "name": "Developer",
    "status": "active",
    "roles": ["DEVELOPER"]
  },
  "addedByUserId": "b916fed6-c0e1-4537-9dab-4fe9b40c0333",
  "createdAt": "2026-07-31T12:00:00.000Z"
}
```

The repository and target user must belong to the authenticated organization.
Duplicate membership returns HTTP `409`. Unknown repositories, users, and
memberships return HTTP `404`. Successful removal returns HTTP `204`.

The membership table records repository-specific sharing. Repository CRUD is
still controlled by organization roles and permissions; using membership to
filter repository reads is a separate authorization policy decision.

## Module structure

```text
src/modules/repositories/
├── dto/
├── entities/
│   ├── repository.entity.ts
│   ├── repository-member.entity.ts
│   └── repository-branch.entity.ts
├── repositories/
│   ├── repositories.repository.ts
│   └── repository-members.repository.ts
├── repositories.controller.ts
├── repository-members.controller.ts
├── repositories.service.ts
├── repository-members.service.ts
└── repositories.module.ts
```

## Next implementation slice

Milestone 2.4 should place Git operations behind a dedicated adapter:

```text
Registered repository
    -> validate source and outbound destination
    -> clone or fetch into an isolated workspace
    -> resolve the default branch and commit
    -> synchronize repository branch records
```

Git operations must never execute repository code.
