# Knowledge API

## Status

Milestone 4.8 is complete. The API accepts asynchronous knowledge builds and
exposes immutable, published knowledge snapshots through tenant-scoped
endpoints. Draft graph content and internal worker lease tokens are never
visible.

## Base path

```text
/api/v1/repositories/:repositoryId/knowledge
```

Every request requires a bearer access token and the `repository.read`
permission. Organization scope comes from the authenticated session; clients
cannot supply or override it.

## Endpoints

| Method | Path                                                   | Purpose                                  |
| ------ | ------------------------------------------------------ | ---------------------------------------- |
| `GET`  | `/snapshots`                                           | List published snapshot history          |
| `GET`  | `/snapshots/current?branchId=:branchId`                | Get the current snapshot for one branch  |
| `GET`  | `/snapshots/:snapshotId`                               | Get one historical published snapshot    |
| `GET`  | `/snapshots/:snapshotId/nodes`                         | List and filter knowledge nodes           |
| `GET`  | `/snapshots/:snapshotId/nodes/:nodeId`                 | Get a node with evidence summaries        |
| `GET`  | `/snapshots/:snapshotId/edges`                         | List and filter knowledge relationships   |
| `GET`  | `/snapshots/:snapshotId/edges/:edgeId`                 | Get a relationship with evidence summaries |
| `POST` | `/builds`                                              | Queue a build from a successful index job   |
| `GET`  | `/builds`                                              | List build history and progress             |
| `GET`  | `/builds/:buildId`                                     | Get one build and its progress              |
| `POST` | `/builds/:buildId/cancel`                              | Request cooperative cancellation            |
| `POST` | `/builds/:buildId/retry`                               | Requeue a failed or cancelled build         |

The paths above are relative to the base path.

## Background knowledge builds

Build mutations additionally require `knowledge.manage`. Queueing returns
`202 Accepted` immediately; a PostgreSQL-backed worker claims and processes the
build outside the HTTP request lifecycle.

```http
POST /api/v1/repositories/2/knowledge/builds
Authorization: Bearer <access-token>
Content-Type: application/json

{
  "sourceIndexJobId": 4
}
```

The source indexing job must belong to the same organization and repository
and have status `succeeded`. Only one queued or running knowledge build is
allowed for a repository branch.

```json
{
  "id": 11,
  "repositoryId": 2,
  "branchId": 3,
  "sourceIndexJobId": 4,
  "trigger": "manual",
  "status": "running",
  "phase": "analyzing",
  "targetCommitSha": "8e008e725d9e411c5bff3a713b91afeaf4613f13",
  "analyzerBundleVersion": "phase4-v1",
  "progress": {
    "percentage": 100,
    "totalFiles": 42,
    "processedFiles": 42,
    "failedFiles": 0,
    "emittedFacts": 229,
    "persistedNodes": 93,
    "persistedEdges": 136,
    "currentFile": null
  },
  "attemptCount": 1,
  "maxAttempts": 3,
  "failure": null
}
```

Lifecycle states are:

```text
queued
  -> running: preparing -> analyzing -> validating -> publishing
  -> succeeded: finished

running -> queued     (automatic retry)
running -> failed     (terminal error or attempts exhausted)
queued/running -> cancelled
```

Cancellation is cooperative. A queued build is cancelled immediately; a
running worker observes the request at a heartbeat checkpoint. Retry is
available only for `failed` or `cancelled` builds and reuses the same invisible
draft with idempotent fact writes.

The worker records bounded diagnostics, persists nodes and edges in configured
batches, verifies evidence completeness, and publishes in one transaction. If
the branch advanced during analysis, the completed snapshot remains historical
and is not selected as the branch's current snapshot.

## Snapshot history

```http
GET /api/v1/repositories/2/knowledge/snapshots?page=1&limit=20&branchId=3
Authorization: Bearer <access-token>
```

`branchId` is optional for history and required for the current-snapshot
endpoint. Results include only `published` snapshots and are ordered newest
first. Each snapshot identifies the immutable commit, source indexing job,
analyzer bundle, configuration digest, and publication state.

Snapshot detail also returns graph totals:

```json
{
  "id": 7,
  "repositoryId": 2,
  "branchId": 3,
  "knowledgeBuildId": 11,
  "sourceIndexJobId": 4,
  "targetCommitSha": "8e008e725d9e411c5bff3a713b91afeaf4613f13",
  "analyzerBundleVersion": "4.6.0",
  "configurationDigest": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "status": "published",
  "isCurrent": true,
  "publishedAt": "2026-09-20T10:01:00.000Z",
  "supersededAt": null,
  "createdAt": "2026-09-20T10:00:00.000Z",
  "graph": {
    "nodes": 42,
    "edges": 61
  }
}
```

Only one snapshot can be current per branch. A historical snapshot remains
queryable after it is superseded.

## Knowledge nodes

```http
GET /api/v1/repositories/2/knowledge/snapshots/7/nodes?kind=workflow&search=appointment&page=1&limit=20
Authorization: Bearer <access-token>
```

Supported node kinds are:

- `architectural_component`
- `domain_concept`
- `business_rule`
- `workflow`
- `workflow_step`
- `state`
- `state_transition`
- `domain_event`
- `event_handler`

`kind` and `search` are optional. Search matches the bounded human-readable
node name. List responses omit evidence to keep pagination predictable; node
detail includes up to 100 evidence summaries plus `evidenceTotal` and
`evidenceTruncated` metadata.

## Knowledge relationships

```http
GET /api/v1/repositories/2/knowledge/snapshots/7/edges?kind=calls&nodeId=31&page=1&limit=20
Authorization: Bearer <access-token>
```

Supported relationship kinds are `contains`, `depends_on`, `calls`, `handles`,
`represents`, `enforces`, `triggers`, `precedes`, and `transitions_to`.

`nodeId` optionally restricts results to relationships where the node is the
source or target. Every relationship includes bounded source and target node
references. Relationship detail includes the same capped evidence summary and
total metadata as node detail.

## Evidence summaries

Evidence responses identify immutable provenance without returning raw source:

```json
{
  "id": 41,
  "role": "call_site",
  "file": {
    "id": 51,
    "path": "src/doctor.service.ts",
    "hash": {
      "id": 52,
      "algorithm": "sha256",
      "value": "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
    }
  },
  "symbol": {
    "id": 53,
    "name": "schedule",
    "qualifiedName": "DoctorService.schedule",
    "kind": "method"
  },
  "range": {
    "startLine": 10,
    "startColumn": 3,
    "startOffset": 100,
    "endLine": 10,
    "endColumn": 24,
    "endOffset": 121
  }
}
```

The symbol or range may be `null` when the analyzer evidence applies to a file
or configuration rather than one exact symbol or source span.

## Pagination and validation

List endpoints return:

```json
{
  "data": [],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 0,
    "totalPages": 0
  }
}
```

`page` defaults to `1`. `limit` defaults to `20` and is capped at `100`.
Identifiers must be positive integers, node and edge kinds must be known enum
values, and node-name search is limited to 200 characters.

## Security and visibility

- Repository and snapshot queries always include the authenticated
  organization scope.
- Draft snapshots are invisible even when their numeric ID is known.
- Cross-organization repository, snapshot, node, and edge identifiers return
  `404 Not Found`.
- Published graph APIs are read-only. Build endpoints only create or control
  draft work; graph content changes only through atomic snapshot publication.
- Raw source text, worker ownership, lease tokens, and internal failure stacks
  are not returned.

## Error responses

| Status | Meaning                                                   |
| -----: | --------------------------------------------------------- |
|  `400` | Invalid identifier, pagination, enum filter, or search    |
|  `401` | Access token missing, invalid, or expired                 |
|  `403` | Authenticated role lacks `repository.read`                |
|  `404` | Repository or published graph resource is not accessible |
|  `409` | Source job/build state conflicts with the requested action |

## Related documentation

- [Knowledge module](../02-core-modules/knowledge.md)
- [Knowledge graph schema](../03-database/knowledge-graph-schema.md)
- [ADR-014: Knowledge and analysis architecture](../06-adrs/014-knowledge-analysis-architecture.md)
