# Indexing Job API

## Status

Phase 3.1 implemented. These endpoints create and inspect durable jobs. They do
not execute indexing yet; jobs remain `queued` until the worker slice lands.

## Base path

```text
/api/v1/repositories/:repositoryId/index-jobs
```

All requests require a bearer access token. The organization scope comes from
the authenticated session and cannot be supplied in the request.

## Endpoints

| Method | Path | Permissions | Purpose |
|---|---|---|---|
| `POST` | `/repositories/:repositoryId/index-jobs` | `repository.read`, `repository.index` | Queue a branch snapshot |
| `GET` | `/repositories/:repositoryId/index-jobs` | `repository.read` | List repository jobs |
| `GET` | `/repositories/:repositoryId/index-jobs/:jobId` | `repository.read` | Get one job |

## Queue a job

```http
POST /api/v1/repositories/2/index-jobs
Authorization: Bearer <access-token>
Content-Type: application/json
```

```json
{
  "branchId": 1,
  "mode": "incremental"
}
```

The branch must be active and must have a commit SHA from a successful branch
synchronization. `mode` is optional and defaults to `incremental`; use `full`
to request a future complete rebuild once workers are implemented.

Successful response (`201 Created`):

```json
{
  "id": 1,
  "repositoryId": 2,
  "branchId": 1,
  "requestedByUserId": "25d8bd53-047b-42d8-9efa-4ecedfe422d3",
  "trigger": "manual",
  "mode": "incremental",
  "status": "queued",
  "targetCommitSha": "8e008e725d9e411c5bff3a713b91afeaf4613f13",
  "progress": {
    "totalFiles": 0,
    "processedFiles": 0,
    "skippedFiles": 0,
    "failedFiles": 0
  },
  "attemptCount": 0,
  "failure": null,
  "startedAt": null,
  "completedAt": null,
  "createdAt": "2026-08-01T12:00:00.000Z",
  "updatedAt": "2026-08-01T12:00:00.000Z"
}
```

The server copies `targetCommitSha` from the branch. A client cannot select an
arbitrary commit or set job lifecycle fields.

Only one `queued` or `running` job can exist for a repository branch. A second
request returns `409 Conflict` until the current job reaches a terminal state.

## List jobs

```http
GET /api/v1/repositories/2/index-jobs?page=1&limit=20&status=queued
Authorization: Bearer <access-token>
```

Query parameters:

| Parameter | Required | Default | Rules |
|---|:---:|---:|---|
| `page` | No | `1` | Positive integer |
| `limit` | No | `20` | Integer from 1 to 100 |
| `status` | No | All | `queued`, `running`, `succeeded`, `failed`, or `cancelled` |

Response:

```json
{
  "data": [
    {
      "id": 1,
      "repositoryId": 2,
      "branchId": 1,
      "requestedByUserId": "25d8bd53-047b-42d8-9efa-4ecedfe422d3",
      "trigger": "manual",
      "mode": "incremental",
      "status": "queued",
      "targetCommitSha": "8e008e725d9e411c5bff3a713b91afeaf4613f13",
      "progress": {
        "totalFiles": 0,
        "processedFiles": 0,
        "skippedFiles": 0,
        "failedFiles": 0
      },
      "attemptCount": 0,
      "failure": null,
      "startedAt": null,
      "completedAt": null,
      "createdAt": "2026-08-01T12:00:00.000Z",
      "updatedAt": "2026-08-01T12:00:00.000Z"
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

## Get one job

```http
GET /api/v1/repositories/2/index-jobs/1
Authorization: Bearer <access-token>
```

The response uses the same job object as create and list.

## Error responses

| Status | Meaning |
|---:|---|
| `400` | Invalid repository/job/branch ID, query, or body |
| `401` | Access token missing, invalid, or expired |
| `403` | Authenticated role lacks a required permission |
| `404` | Repository, branch, or job is missing or outside the organization |
| `409` | Repository disabled, branch deleted/unsynchronized, or active job exists |

Cross-organization IDs are intentionally returned as `404` to avoid resource
disclosure.

## Test sequence

1. Register a repository.
2. Synchronize branches with
   `POST /api/v1/repositories/:repositoryId/branches/sync`.
3. Copy an active branch `id` from the response.
4. Queue a job with the `POST` endpoint above.
5. List and retrieve the job.

Until Phase 3.2, seeing `status: "queued"` is the expected behavior.
