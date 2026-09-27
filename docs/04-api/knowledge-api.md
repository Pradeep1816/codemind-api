# Knowledge API

## Status

Milestone 4.7 is complete. The API exposes immutable, published knowledge
snapshots and their typed graph through tenant-scoped, read-only endpoints.
Draft snapshots and internal build leases are never visible.

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

The paths above are relative to the base path.

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
- The API is read-only. Knowledge changes only by publishing a new immutable
  snapshot.
- Raw source text, worker ownership, lease tokens, and internal failure stacks
  are not returned.

## Error responses

| Status | Meaning                                                   |
| -----: | --------------------------------------------------------- |
|  `400` | Invalid identifier, pagination, enum filter, or search    |
|  `401` | Access token missing, invalid, or expired                 |
|  `403` | Authenticated role lacks `repository.read`                |
|  `404` | Repository or published graph resource is not accessible |

## Related documentation

- [Knowledge module](../02-core-modules/knowledge.md)
- [Knowledge graph schema](../03-database/knowledge-graph-schema.md)
- [ADR-014: Knowledge and analysis architecture](../06-adrs/014-knowledge-analysis-architecture.md)
