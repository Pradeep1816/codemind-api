# Search API

## Status

Milestones 5.7 and 5.8 are complete. The API builds or reuses a branch's current
search projection and exposes it through authenticated, tenant-scoped
retrieval.

## Build the current search index

```http
POST /api/v1/repositories/:repositoryId/search/indexes
Authorization: Bearer <access-token>
Content-Type: application/json

{
  "branchId": 3
}
```

The caller must have `repository.read`, `repository.index`, and `search.use`.
The server resolves the branch's current published knowledge snapshot, builds
and atomically publishes its projection, or reuses an identical published
projection. The operation is retry safe and returns `201 Created` with document
counts and immutable source identifiers.

If the branch does not have a published knowledge snapshot, the endpoint
returns `404 Not Found` without creating a partial search index.

## Search the current index

```http
GET /api/v1/repositories/:repositoryId/search
Authorization: Bearer <access-token>
```

The caller must have both `repository.read` and `search.use`. Organization
scope is always taken from the access token; an organization identifier is not
accepted in the path, query string, or body.

## Query parameters

| Parameter    | Required | Default | Rules                                       |
| ------------ | -------- | ------- | ------------------------------------------- |
| `branchId`   | Yes      | —       | Positive integer                            |
| `query`      | Yes      | —       | Trimmed non-empty text, maximum 200 chars   |
| `page`       | No       | `1`     | Positive integer                            |
| `limit`      | No       | `20`    | Integer from 1 through 100                  |
| `sourceType` | No       | —       | `file`, `symbol`, or `knowledge_node`       |
| `language`   | No       | —       | Supported indexing language enum            |
| `kind`       | No       | —       | `file`, symbol kind, or knowledge-node kind |

Unknown query parameters are rejected. Clients cannot provide raw PostgreSQL
`tsquery`, ranking weights, graph depth, organization scope, or SQL fragments.

Example:

```http
GET /api/v1/repositories/2/search?branchId=3&query=calculateRoundingWindow&sourceType=symbol&language=typescript&kind=method&page=1&limit=10
Authorization: Bearer <access-token>
```

## Response

The response identifies the immutable search index and commit, echoes the
normalized query and filters, and returns one deduplicated ranked list.

```json
{
  "searchIndex": {
    "id": 9,
    "repositoryId": 2,
    "branchId": 3,
    "knowledgeSnapshotId": 7,
    "sourceIndexJobId": 4,
    "targetCommitSha": "8e008e725d9e411c5bff3a713b91afeaf4613f13",
    "indexerVersion": "phase5-v1",
    "publishedAt": "2026-09-28T10:00:00.000Z"
  },
  "query": {
    "original": "calculateRoundingWindow",
    "normalized": "calculate rounding window"
  },
  "filters": {
    "sourceType": "symbol",
    "language": "typescript",
    "kind": "method"
  },
  "data": [
    {
      "id": 41,
      "sourceType": "symbol",
      "title": "DoctorScheduleService.calculateRoundingWindow",
      "contentPreview": "calculate rounding window ...",
      "path": "src/doctor-schedule.service.ts",
      "language": "typescript",
      "kind": "method",
      "score": 201.666667,
      "match": {
        "exactIdentifier": true,
        "exactTitle": false,
        "exactPath": false,
        "titlePrefix": false,
        "identifierPrefix": true,
        "pathContains": false,
        "lexical": true
      },
      "source": {
        "indexedFileId": 11,
        "fileHashId": 12,
        "codeSymbolId": 13,
        "knowledgeNodeId": null
      },
      "metadata": {},
      "ranking": {
        "lexicalScore": 201.666667,
        "graphScore": 0,
        "totalScore": 201.666667,
        "signals": [
          {
            "source": "exact",
            "name": "exactIdentifier",
            "contribution": 120,
            "description": "Exact symbol identifier match"
          }
        ]
      }
    }
  ],
  "ranking": {
    "candidateCount": 2,
    "deduplicatedCount": 2,
    "returnedCount": 2,
    "truncated": false
  },
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 2,
    "totalPages": 1
  }
}
```

`pagination.total` and `totalPages` describe direct lexical matches. Graph
neighbors are bounded expansions of those lexical seeds and are described by
`ranking` and `graphExpansion` metadata rather than counted as independently
pageable lexical matches.

## Security and visibility

- Missing, invalid, or expired access tokens return `401 Unauthorized`.
- Missing any permissions required by the selected operation returns `403
Forbidden`.
- A repository belonging to another organization returns `404 Not Found`.
- Only the current published search index for the requested branch is visible.
- Draft, historical, and partially built search indexes are never selected.
- Every result contains immutable source provenance and the indexed commit.
- Search input and filters are validated and all database queries are
  parameterized.

## Errors

| Status | Meaning                                                  |
| -----: | -------------------------------------------------------- |
|  `400` | Invalid query, identifier, filter, pagination, or field  |
|  `401` | Access token missing, invalid, or expired                |
|  `403` | A required repository or search permission is missing    |
|  `404` | Repository, knowledge snapshot, or search index missing  |
|  `503` | Authorization or another required service is unavailable |
