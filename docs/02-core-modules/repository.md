# Repository Module

## Document information

Status: Repository CRUD, membership, Git, and branch APIs implemented
Version: 2.3
Owner: CodeMind Engineering

## Purpose

The repository module owns the software repositories registered with
CodeMind. It establishes the organization boundary and stable repository
identity required by future cloning, indexing, parsing, analysis, search, and
knowledge features.

Registering a repository stores metadata only. An authorized caller can later
start explicit branch synchronization; source indexing does not start yet.

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
- Validate GitHub HTTPS and allow-listed local Git sources
- Clone without checkout and fetch branch updates in isolated workspaces
- Detect default branches, commit SHAs, and remote branch state
- List persisted branch state inside the authenticated organization
- Clone or fetch on an explicit, rate-limited synchronization request
- Atomically activate observed branches and mark missing branches as deleted
- Preserve `lastIndexedAt` while Git state changes
- Coalesce concurrent sync requests for one repository in one API process
- Return `404` for cross-organization IDs

Next:

- Repository health and size reporting
- Git credential references
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
RepositoriesController / RepositoryMembersController / RepositoryBranchesController
    |
    v
RepositoriesService / RepositoryMembersService / RepositoryBranchesService
    |
    v
RepositoriesRepository / RepositoryMembersRepository / RepositoryBranchesRepository
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

This validation prevents credentials from being persisted. The internal Git
service initially permits outbound operations only for exact `github.com`
HTTPS URLs. Although registration recognizes other provider metadata, GitLab,
Bitbucket, and generic HTTPS execution remain unsupported until explicit
provider policies are implemented.

## Git service and synchronization

`GitService` remains an internal infrastructure capability. The branch service
exposes its safe synchronization workflow through a protected endpoint. Git
supports:

- Source validation without shell interpolation
- Credential-free GitHub HTTPS repositories
- Local repositories contained by `GIT_LOCAL_REPOSITORIES_ROOT`
- Clone into `<workspaceRoot>/<organizationId>/<repositoryId>`
- Fetch/prune of remote branches
- Default branch, head commit, and remote branch discovery

Git commands run through `execFile` with argument arrays. Global and system
Git configuration, credential helpers, terminal prompts, hooks, SSH, HTTP,
the Git protocol, and external protocol helpers are disabled. A validated
local source enables the file protocol only for that operation.

Clones use `--no-checkout` and never execute repository code. A temporary
directory is atomically renamed after a successful clone and safely removed
after failure. Command timeout, output size, clone depth, workspace root, and
the optional local-source root are environment controlled.

The first synchronization clones the remote; later requests fetch and prune
remote refs. Same-repository requests share one in-flight operation inside a
single Node.js process. Database persistence then locks the tenant-scoped
repository row and updates its default branch and all branch lifecycle changes
in one transaction. The Git operation intentionally occurs before the short
database transaction.

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
| `GET` | `/repositories/:repositoryId/branches` | `repository.read` | List persisted branches |
| `POST` | `/repositories/:repositoryId/branches/sync` | `repository.read`, `repository.index` | Clone/fetch and persist branches |

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

### Branches

```http
POST /api/v1/repositories/101/branches/sync
```

The endpoint returns the complete persisted branch state:

```json
{
  "repositoryId": 101,
  "defaultBranch": "main",
  "branches": [
    {
      "id": 301,
      "name": "main",
      "commitSha": "6fe725f0c1914fbb4ad1123fc791bca9b40a3bd8",
      "status": "active",
      "lastIndexedAt": null,
      "createdAt": "2026-08-01T10:00:00.000Z",
      "updatedAt": "2026-08-01T10:00:00.000Z"
    }
  ]
}
```

`GET /repositories/:repositoryId/branches` returns the same shape without
performing Git I/O. Deleted remote branches remain visible with
`status: "deleted"`; a later reappearance restores them to `active`.
Disabled repositories return `409` on sync. Unsupported Git sources return
`422`, transient Git/workspace failures return `503`, and rate-limit excess
returns `429`.

## Module structure

```text
src/modules/repositories/
├── dto/
├── entities/
│   ├── repository.entity.ts
│   ├── repository-member.entity.ts
│   └── repository-branch.entity.ts
├── git/
│   ├── git-command.service.ts
│   ├── git.constants.ts
│   ├── git.errors.ts
│   ├── git.service.ts
│   └── git.types.ts
├── repositories/
│   ├── repositories.repository.ts
│   ├── repository-members.repository.ts
│   └── repository-branches.repository.ts
├── repositories.controller.ts
├── repository-members.controller.ts
├── repository-branches.controller.ts
├── repositories.service.ts
├── repository-members.service.ts
├── repository-branches.service.ts
└── repositories.module.ts
```

## Next implementation slice

Milestone 2.6 should provide repository health without performing a Git sync:

```text
GET /repositories/:repositoryId/status
    -> last successful sync signal
    -> last indexed timestamp
    -> active/deleted branch counts
    -> repository workspace size
```

The health slice needs an explicit persisted sync timestamp before it can
report a durable `lastSync` value across processes.
