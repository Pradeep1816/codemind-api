# Repository API

## Document information

Status: Phase 2 repository API complete
Version: 2.0
Owner: CodeMind Engineering

## Base path

```text
/api/v1/repositories
```

All repository endpoints require a bearer access token. Organization scope is
derived from the authenticated user and cannot be supplied by clients.

Requests and responses use JSON except successful delete operations, which
return no body. Timestamps use ISO 8601 UTC strings. The API returns plain
resource objects; it does not wrap successful responses in a `data` envelope.

```http
Authorization: Bearer <access-token>
Content-Type: application/json
```

## Endpoints

| Method | Path | Success | Required permission |
|---|---|---:|---|
| `POST` | `/repositories` | `201` | `repository.create` |
| `GET` | `/repositories` | `200` | `repository.read` |
| `GET` | `/repositories/:repositoryId` | `200` | `repository.read` |
| `PATCH` | `/repositories/:repositoryId` | `200` | `repository.create` |
| `DELETE` | `/repositories/:repositoryId` | `204` | `repository.delete` |
| `POST` | `/repositories/:repositoryId/members` | `201` | `repository.read`, `repository.member.manage` |
| `GET` | `/repositories/:repositoryId/members` | `200` | `repository.read` |
| `DELETE` | `/repositories/:repositoryId/members/:userId` | `204` | `repository.read`, `repository.member.manage` |
| `GET` | `/repositories/:repositoryId/branches` | `200` | `repository.read` |
| `POST` | `/repositories/:repositoryId/branches/sync` | `201` | `repository.read`, `repository.index` |
| `GET` | `/repositories/:repositoryId/status` | `200` | `repository.read` |

Persisted repository IDs are positive integers. Non-integer route values return
`400`; integer values that do not identify a tenant-owned repository return
`404`. User IDs are UUID v4 values.

Permissions are cumulative. When an endpoint lists two permissions, the caller
must hold both. Default OWNER and ADMIN roles can manage repositories;
DEVELOPER can read, create, update, and synchronize; VIEWER has read-only
access. Custom roles are evaluated from their permission assignments rather
than their names.

Repository membership is stored for future repository-specific access policy.
In the current phase, read/list authorization is organization-wide and is not
filtered by membership.

## Repository response

Create, retrieve, and update operations return the following shape:

```json
{
  "id": 101,
  "name": "CodeMind API",
  "provider": "github",
  "remoteUrl": "https://github.com/codemind/codemind-api.git",
  "defaultBranch": "main",
  "status": "active",
  "createdAt": "2026-08-01T10:00:00.000Z",
  "updatedAt": "2026-08-01T10:00:00.000Z"
}
```

| Field | Type | Values or meaning |
|---|---|---|
| `id` | integer | Repository identifier |
| `name` | string | Organization-facing name |
| `provider` | string | `github`, `gitlab`, `bitbucket`, or `generic` |
| `remoteUrl` | string | Normalized credential-free HTTPS URL |
| `defaultBranch` | string or null | Configured or Git-detected default branch |
| `status` | string | `active` or `disabled` |
| `createdAt` | string | Creation timestamp |
| `updatedAt` | string | Last metadata or health update timestamp |

## Register repository

```http
POST /api/v1/repositories
```

```json
{
  "name": "CodeMind API",
  "remoteUrl": "https://github.com/codemind/codemind-api.git",
  "defaultBranch": "main"
}
```

The remote URL must use HTTPS and cannot include credentials, query
parameters, or a fragment. The provider is detected from the hostname.
`defaultBranch` is optional. Unknown request properties are rejected.

Registration is metadata-only: it performs no outbound Git request. A trailing
slash is removed before the URL uniqueness check. Registering the same
normalized URL twice in one organization returns `409`; another organization
may register the same URL independently.

Successful registration returns `201` and the repository response above.

## List repositories

```http
GET /api/v1/repositories?page=1&limit=20&search=api&provider=github&status=active
```

`page` defaults to `1`; `limit` defaults to `20` and cannot exceed `100`.
`search` performs a case-insensitive partial match against name and remote URL.
`provider` and `status` require exact enum values.

Response:

```json
{
  "data": [
    {
      "id": 101,
      "name": "CodeMind API",
      "provider": "github",
      "remoteUrl": "https://github.com/codemind/codemind-api.git",
      "defaultBranch": "main",
      "status": "active",
      "createdAt": "2026-08-01T10:00:00.000Z",
      "updatedAt": "2026-08-01T10:00:00.000Z"
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

Results are ordered by creation time descending, then repository ID ascending.
An empty result returns `data: []` and `totalPages: 0`.

## Get repository

```http
GET /api/v1/repositories/101
```

Returns the repository response. Unknown and cross-organization repository IDs
return the same `404` response.

## Update repository

```http
PATCH /api/v1/repositories/101
```

```json
{
  "name": "CodeMind Backend",
  "defaultBranch": "develop",
  "status": "active"
}
```

At least one mutable field is required. Remote URL and organization ownership
cannot be changed. `name`, `defaultBranch`, and `status` are optional in the
DTO, but an empty object returns `400`. The response contains the complete
updated repository.

Disabling a repository prevents branch synchronization but does not prevent
read, update, status, or deletion operations.

## Delete repository

```http
DELETE /api/v1/repositories/101
```

Successful deletion returns `204` with no response body. PostgreSQL cascades
the deletion to repository membership and branch rows. The managed Git
workspace is not currently removed by this endpoint; workspace retention and
cleanup belongs to a later operational milestone.

## Add repository member

```http
POST /api/v1/repositories/101/members
```

```json
{
  "userId": "25d8bd53-047b-42d8-9efa-4ecedfe422d3"
}
```

Response:

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

The target user must belong to the authenticated organization. A duplicate
membership returns HTTP `409`.

## List repository members

```http
GET /api/v1/repositories/101/members
```

Members are ordered by user name, email, and membership ID.
The response is a JSON array of the same member shape returned by the add
operation. An unshared repository returns an empty array.

## Remove repository member

```http
DELETE /api/v1/repositories/101/members/25d8bd53-047b-42d8-9efa-4ecedfe422d3
```

A successful removal returns HTTP `204`.

## Synchronize repository branches

```http
POST /api/v1/repositories/101/branches/sync
Authorization: Bearer <access-token>
```

The first request creates an isolated no-checkout clone. Later requests fetch
and prune remote branches. The client cannot provide a source URL, workspace
path, organization ID, or branch list; all synchronization inputs come from
the tenant-scoped repository record.

Response:

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

Observed branches become `active`; missing branches become `deleted` rather
than being removed. A restored branch becomes active again. Synchronization
updates commit SHAs and the detected repository default branch but preserves
`lastIndexedAt` for the indexing milestone.

The default rate limit is five synchronization requests per IP in 60 seconds.
The limit is configurable. Same-repository requests received by one API process
share a single in-flight Git operation; this is not a distributed lock across
multiple API processes.

## List repository branches

```http
GET /api/v1/repositories/101/branches
Authorization: Bearer <access-token>
```

This returns the same response shape from PostgreSQL without cloning or
fetching. Both active and deleted branch records are included.

## Get repository status

```http
GET /api/v1/repositories/101/status
Authorization: Bearer <access-token>
```

```json
{
  "repositoryId": 101,
  "status": "active",
  "sync": {
    "status": "succeeded",
    "lastAttemptedAt": "2026-08-01T10:00:00.000Z",
    "lastSyncedAt": "2026-08-01T10:00:01.000Z"
  },
  "indexing": {
    "lastIndexedAt": null
  },
  "branches": {
    "total": 2,
    "active": 2,
    "deleted": 0
  },
  "repositorySizeBytes": 16384
}
```

This endpoint reads persisted health only and never triggers Git activity.
Before the first synchronization, sync status is `never` and the timestamps
and size are null. After a failed attempt, status is `failed`, while
`lastSyncedAt` and size continue to represent the previous success.

`lastIndexedAt` is the latest successful index timestamp among all persisted
branches. It remains null until the indexing milestone updates branch records.
Repository size represents Git object storage, not a checked-out working tree.

## Error behavior

NestJS HTTP exceptions currently use this shape:

```json
{
  "message": "Repository was not found",
  "error": "Not Found",
  "statusCode": 404
}
```

Validation errors use `message` as an array of validation messages. Responses
never include SQL, filesystem paths, Git command output, tokens, or stored
credentials.

| Status | Meaning |
|---:|---|
| `400` | Invalid route value, user UUID, query, body, or empty update |
| `401` | Missing or invalid access token |
| `403` | Required permission is missing |
| `404` | Tenant-scoped repository, user, or membership was not found |
| `409` | Repository URL or repository membership already exists |
| `422` | Registered source is not supported by the Git execution policy |
| `429` | Repository synchronization rate limit was exceeded |
| `503` | Git command or managed workspace is temporarily unavailable |

Cross-organization resources intentionally return `404` to avoid disclosing
their existence.

## Git workflow boundary

Registering a repository does not make an outbound connection or start a
clone. Only the explicit synchronization endpoint starts Git work, and no Git
workspace path is accepted from an API client.

Current Git execution supports public, credential-free GitHub HTTPS sources
through this API. GitLab, Bitbucket, and generic HTTPS hosts can be registered
as metadata but return `422` when synchronization is requested.

Private GitHub URLs can also be registered as metadata, but synchronization
cannot authenticate yet and normally returns `503`. Credentials must never be
embedded in `remoteUrl`; a future credential-reference design will add private
repository support without persisting secrets in repository metadata.

The internal Git service can validate explicitly allow-listed absolute local
paths for controlled deployments. The public repository DTO accepts HTTPS
URLs only, so local paths cannot currently be registered through this API.

## Verification coverage

The PostgreSQL E2E suite verifies:

- Bearer authentication and DTO validation
- Create, duplicate detection, list, retrieve, update, and delete behavior
- Organization isolation across CRUD, membership, branch, and status routes
- OWNER, DEVELOPER, and VIEWER permission behavior
- Repository membership lifecycle
- Successful and failed synchronization health persistence

See [../../test/README.md](../../test/README.md) for the isolated test database
workflow.
