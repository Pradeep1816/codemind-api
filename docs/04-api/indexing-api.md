# Indexing Job API

## Status

Milestone 3.10 implemented; tests are deferred to Milestone 3.11. The API
returns immediately after creating durable work, while a PostgreSQL-backed
worker executes the indexing pipeline in the background.

## Base path

```text
/api/v1/repositories/:repositoryId/index-jobs
```

All requests require a bearer access token. The organization scope comes from
the authenticated session and cannot be supplied by a client.

## Endpoints

| Method | Path                                                   | Permissions                           | Purpose                      |
| ------ | ------------------------------------------------------ | ------------------------------------- | ---------------------------- |
| `POST` | `/repositories/:repositoryId/index-jobs`               | `repository.read`, `repository.index` | Queue a branch snapshot      |
| `GET`  | `/repositories/:repositoryId/index-jobs`               | `repository.read`                     | List repository job history  |
| `GET`  | `/repositories/:repositoryId/index-jobs/:jobId`        | `repository.read`                     | Get one job and its progress |
| `POST` | `/repositories/:repositoryId/index-jobs/:jobId/cancel` | `repository.read`, `repository.index` | Request cancellation         |
| `POST` | `/repositories/:repositoryId/index-jobs/:jobId/retry`  | `repository.read`, `repository.index` | Retry a failed/cancelled job |

## Job representation

```json
{
  "id": 12,
  "repositoryId": 2,
  "branchId": 1,
  "requestedByUserId": "25d8bd53-047b-42d8-9efa-4ecedfe422d3",
  "trigger": "manual",
  "mode": "incremental",
  "status": "running",
  "phase": "building_graph",
  "targetCommitSha": "8e008e725d9e411c5bff3a713b91afeaf4613f13",
  "retryOfJobId": null,
  "progress": {
    "percentage": 51,
    "totalFiles": 1200,
    "processedFiles": 500,
    "skippedFiles": 120,
    "failedFiles": 0,
    "processedSymbols": 4500,
    "processedDependencies": 3800,
    "currentFile": "src/modules/payments/payment.service.ts"
  },
  "attemptCount": 1,
  "maxAttempts": 3,
  "failure": null,
  "startedAt": "2026-08-07T10:30:00.000Z",
  "completedAt": null,
  "lastHeartbeatAt": "2026-08-07T10:31:00.000Z",
  "nextAttemptAt": null,
  "cancellationRequestedAt": null,
  "createdAt": "2026-08-07T10:29:58.000Z",
  "updatedAt": "2026-08-07T10:31:00.000Z"
}
```

`status` describes the durable lifecycle: `queued`, `running`, `succeeded`,
`failed`, or `cancelled`. The more detailed `phase` is one of `queued`,
`preparing`, `discovering`, `hashing`, `extracting_symbols`, `building_graph`,
`finalizing`, or `finished`. The legacy `analyzing` value remains readable for
jobs created before the two-pass worker phases. The API never exposes the
internal worker identity or lease token.

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

The branch must be active and have a commit SHA from successful branch
synchronization. `mode` defaults to `incremental`; `full` requests a complete
rebuild. The server copies the target commit from trusted branch state.

The successful response is `202 Accepted`. It contains the queued job; Git,
hashing, parsing, and persistence never run inside the HTTP request.

Only one `queued` or `running` job can exist for a repository branch. A second
request returns `409 Conflict` until the active job becomes terminal.

## List jobs

```http
GET /api/v1/repositories/2/index-jobs?page=1&limit=20&status=running
Authorization: Bearer <access-token>
```

| Parameter | Required | Default | Rules                        |
| --------- | :------: | ------: | ---------------------------- |
| `page`    |    No    |     `1` | Positive integer             |
| `limit`   |    No    |    `20` | Integer from 1 to 100        |
| `status`  |    No    |     All | Any durable lifecycle status |

The response contains `data` and pagination metadata: `page`, `limit`, `total`,
and `totalPages`.

## Get one job

```http
GET /api/v1/repositories/2/index-jobs/12
Authorization: Bearer <access-token>
```

The response uses the job representation above and is suitable for progress
polling. `lastHeartbeatAt` shows worker liveness when the job is running.
`progress.percentage` is derived from accounted files and is not stored
separately. `progress.currentFile` is populated while one file is being parsed.

## Cancel a job

```http
POST /api/v1/repositories/2/index-jobs/12/cancel
Authorization: Bearer <access-token>
```

A queued job becomes `cancelled` immediately. A running job records
`cancellationRequestedAt` and remains `running` until its worker acknowledges
the request. Expired-lease recovery also finalizes pending cancellation.
Repeating cancellation for an already cancelled job is safe. Succeeded and
failed jobs return `409 Conflict`.

## Retry a job

```http
POST /api/v1/repositories/2/index-jobs/12/retry
Authorization: Bearer <access-token>
```

Only failed or cancelled jobs can be manually retried. Retry creates a new
queued row with `retryOfJobId` pointing to the original job and preserves the
same branch, mode, and immutable target commit. Historical rows are never
rewritten. The repository and branch must still be active, and no active job
may already exist for that branch.

## Retry and lease behavior

Workers claim jobs atomically and receive a private lease token. Heartbeats
extend the lease. A retryable failure returns the same job to `queued` until
`maxAttempts` is reached; `nextAttemptAt` exposes the retry delay. Expired
leases are recovered in bounded batches and either requeued, failed, or
cancelled. All file, hash, symbol, and dependency writes recheck the lease.

## Background execution

```mermaid
flowchart LR
    API[POST index job] -->|202 Accepted| DB[(PostgreSQL jobs)]
    DB -->|SKIP LOCKED claim| Worker[Indexing worker]
    Worker --> Discover[Discover files]
    Discover --> Hash[Hash changes]
    Hash --> Analyze[Parse symbols and dependencies]
    Analyze --> Persist[(Persist metadata)]
    Persist --> Complete[Succeeded]
```

The built-in worker polls PostgreSQL. `INDEXING_WORKER_ENABLED=false` disables
processing in API-only deployments. Multiple application instances may safely
poll because claims use row locks and private fencing tokens. BullMQ/Redis may
later reduce polling latency, but PostgreSQL remains the source of truth.

## Error responses

| Status | Meaning                                                                        |
| -----: | ------------------------------------------------------------------------------ |
|  `400` | Invalid repository/job/branch ID, query, or body                               |
|  `401` | Access token missing, invalid, or expired                                      |
|  `403` | Authenticated role lacks a required permission                                 |
|  `404` | Repository, branch, or job is missing or outside the organization              |
|  `409` | Lifecycle transition is invalid, resource is disabled, or an active job exists |

Cross-organization IDs intentionally return `404` to avoid resource
disclosure.
