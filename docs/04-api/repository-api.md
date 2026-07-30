# Repository API

## Document information

Status: Repository CRUD and membership implemented
Version: 1.0
Owner: CodeMind Engineering

## Base path

```text
/api/v1/repositories
```

All repository endpoints require a bearer access token. Organization scope is
derived from the authenticated user and cannot be supplied by clients.

## Endpoints

| Method | Path | Required permission |
|---|---|---|
| `POST` | `/repositories` | `repository.create` |
| `GET` | `/repositories` | `repository.read` |
| `GET` | `/repositories/:repositoryId` | `repository.read` |
| `PATCH` | `/repositories/:repositoryId` | `repository.create` |
| `DELETE` | `/repositories/:repositoryId` | `repository.delete` |
| `POST` | `/repositories/:repositoryId/members` | `repository.read`, `repository.member.manage` |
| `GET` | `/repositories/:repositoryId/members` | `repository.read` |
| `DELETE` | `/repositories/:repositoryId/members/:userId` | `repository.read`, `repository.member.manage` |

Repository IDs are positive integers. User IDs are UUID v4 values.

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

## List repositories

```http
GET /api/v1/repositories?page=1&limit=20&search=api&provider=github&status=active
```

`page` defaults to `1`; `limit` defaults to `20` and cannot exceed `100`.

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
cannot be changed.

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

## Remove repository member

```http
DELETE /api/v1/repositories/101/members/25d8bd53-047b-42d8-9efa-4ecedfe422d3
```

A successful removal returns HTTP `204`.

## Error behavior

| Status | Meaning |
|---:|---|
| `400` | Invalid repository ID, user UUID, query, or body |
| `401` | Missing or invalid access token |
| `403` | Required permission is missing |
| `404` | Tenant-scoped repository, user, or membership was not found |
| `409` | Repository URL or repository membership already exists |

Cross-organization resources intentionally return `404` to avoid disclosing
their existence.
