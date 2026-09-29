This document defines the complete CodeMind API contract.

It maps directly to future NestJS modules:

src/
├── auth/
├── users/
├── organizations/
├── repositories/
├── indexing/
├── parser/
├── analysis/
├── knowledge/
├── search/
├── ai/
├── documentation/
├── mcp/
└── jobs/

# CodeMind API Endpoints

## 1. Introduction

This document defines all public API endpoints exposed by
CodeMind.

The API is organized by business capability:

Authentication

Users

Organizations

Repositories

Indexing

Analysis

Search

Knowledge

AI

Documentation

MCP

Jobs

All APIs follow:

/api/v1/{resource}

Example:

GET /api/v1/repositories

---

# 2. Common API Format

## Request Headers

Required:

Authorization: Bearer <token>

Content-Type: application/json

Optional:

X-Request-ID

X-Organization-ID

---

## Success Response

Format:

````json
{
 "success": true,
 "data": {}
}
Error Response
{
 "success": false,
 "error": {
    "code":"RESOURCE_NOT_FOUND",
    "message":"Repository does not exist"
 }
}
3. Authentication APIs

Base path:

/api/v1/auth

Register User
POST /auth/register


Purpose:

Create a new CodeMind user.

Request:

{
 "name":"Pradeep",
 "email":"user@example.com",
 "password":"password"
}

Response:

{
 "userId":"usr_123",
 "message":"Account created"
}
Login
POST /auth/login


Purpose:

Authenticate user.

Request:

{
 "email":"user@example.com",
 "password":"password"
}

Response:

{
 "accessToken":"jwt",
 "refreshToken":"token"
}
Refresh Token
POST /auth/refresh

Logout
POST /auth/logout

Password Reset
POST /auth/password-reset

4. User APIs

Base path:

/api/v1/users

Get Current User
GET /users/me


Response:

{
"id":"usr_123",
"name":"Developer",
"email":"user@example.com"
}
Update Profile
PATCH /users/me

Get User Activity
GET /users/me/activity


Returns:

Repository activity
AI usage
Search history
5. Organization APIs

Base path:

/api/v1/organizations

Create Organization
POST /organizations


Request:

{
"name":"Engineering Team"
}
Get Organization
GET /organizations/{id}

List Members
GET /organizations/{id}/members

Invite Member
POST /organizations/{id}/members/invite

Remove Member
DELETE /organizations/{id}/members/{userId}

## 6. Repository APIs

Base path: `/api/v1/repositories`

Repository registration stores tenant-scoped metadata. Explicit branch
synchronization clones or fetches the remote repository; it does not index
source files.

| Method | Path | Permission |
|---|---|---|
| `POST` | `/repositories` | `repository.create` |
| `GET` | `/repositories` | `repository.read` |
| `GET` | `/repositories/{repositoryId}` | `repository.read` |
| `PATCH` | `/repositories/{repositoryId}` | `repository.create` |
| `DELETE` | `/repositories/{repositoryId}` | `repository.delete` |
| `POST` | `/repositories/{repositoryId}/members` | `repository.read`, `repository.member.manage` |
| `GET` | `/repositories/{repositoryId}/members` | `repository.read` |
| `DELETE` | `/repositories/{repositoryId}/members/{userId}` | `repository.read`, `repository.member.manage` |
| `GET` | `/repositories/{repositoryId}/branches` | `repository.read` |
| `POST` | `/repositories/{repositoryId}/branches/sync` | `repository.read`, `repository.index` |
| `GET` | `/repositories/{repositoryId}/status` | `repository.read` |

Registration request:

```json
{
  "name": "payment-service",
  "remoteUrl": "https://github.com/company/payment-service.git",
  "defaultBranch": "main"
}
````

The URL must use HTTPS and cannot contain credentials, query parameters, or a
fragment. List filters include `page`, `limit`, `search`, `provider`, and
`status`.

Organization scope comes only from the authenticated identity. Unknown and
cross-organization IDs return HTTP `404`.

Membership mutations accept only users belonging to the authenticated
organization. Adding the same user twice returns HTTP `409`.

Branch synchronization supports credential-free GitHub HTTPS repositories and
allow-listed local sources. It returns active and deleted persisted branch
records. Unsupported sources return HTTP `422`; temporary Git/workspace
failures return `503`; the endpoint-specific rate limit returns `429`.

Repository status reads persisted synchronization state, latest branch index
time, active/deleted branch counts, and Git object-storage size. It does not
perform Git or indexing work.

7. Repository Analysis APIs

Base path:

/api/v1/repositories/{id}/analysis

Get Repository Overview
GET /repositories/{id}/analysis

Returns:

Languages
Frameworks
Architecture
Dependencies
Generate Architecture Map
POST /repositories/{id}/analysis/architecture

8. Indexing Job APIs

Base path:

```text
/api/v1/repositories/{repositoryId}/index-jobs
```

| Method | Path                                                     | Purpose                                  |
| ------ | -------------------------------------------------------- | ---------------------------------------- |
| `POST` | `/repositories/{repositoryId}/index-jobs`                | Queue one synchronized branch snapshot   |
| `GET`  | `/repositories/{repositoryId}/index-jobs`                | List repository jobs                     |
| `GET`  | `/repositories/{repositoryId}/index-jobs/{jobId}`        | Read one job                             |
| `POST` | `/repositories/{repositoryId}/index-jobs/{jobId}/cancel` | Request cancellation                     |
| `POST` | `/repositories/{repositoryId}/index-jobs/{jobId}/retry`  | Retry failed/cancelled work as a new job |

Create body:

```json
{
  "branchId": 1,
  "mode": "incremental"
}
```

New jobs return `202 Accepted` after durable storage with `status: "queued"`.
The PostgreSQL-backed worker claims and executes them asynchronously with
phase/current-file progress, heartbeats, cancellation, and bounded retries.

See [Indexing Job API](indexing-api.md) for the complete contract.

9. Parser APIs

Base path:

/api/v1/parser

Parse File
POST /parser/file

Used internally by indexing workers.

Request:

{
"fileId":"file_123"
}

Returns:

AST
Symbols
Imports
Functions 10. Search APIs

Base path:

/api/v1/repositories/{repositoryId}/search

Build Current Search Index
POST /repositories/{repositoryId}/search/indexes

Required permissions:

- repository.read
- repository.index
- search.use

Request:

{
"branchId":2
}

Repository Search
GET /repositories/{repositoryId}/search

Required permissions:

- repository.read
- search.use

Required query parameters:

- branchId
- query

Optional query parameters:

- page
- limit
- sourceType
- language
- kind

Example:

?branchId=2&query=payment%20calculation&sourceType=symbol

Response:

{
"data": [
{
"title": "PaymentService.calculateTotal",
"path": "src/payment/payment.service.ts",
"sourceType": "symbol",
"score": 201.5,
"ranking": {
"lexicalScore": 201.5,
"graphScore": 0,
"totalScore": 201.5
}
}
]
}

See [Search API](search-api.md) for validation, response metadata, security,
and error details.

11. Knowledge APIs

Base path:

/api/v1/repositories/{repositoryId}/knowledge

Knowledge represents immutable, evidence-backed technical and business
understanding extracted from a repository.

List Published Snapshots
GET /repositories/{repositoryId}/knowledge/snapshots

Get Current Branch Snapshot
GET /repositories/{repositoryId}/knowledge/snapshots/current?branchId={branchId}

List Snapshot Nodes
GET /repositories/{repositoryId}/knowledge/snapshots/{snapshotId}/nodes

List Snapshot Relationships
GET /repositories/{repositoryId}/knowledge/snapshots/{snapshotId}/edges

Node and relationship detail endpoints include immutable evidence summaries.
See `docs/04-api/knowledge-api.md` for filters, response contracts, and
authorization behavior.

12. AI APIs

Base path:

/api/v1/ai

Ask CodeMind
POST /ai/chat

Request:

{
"repositoryId":"repo_123",

"question":
"Explain payment flow"
}

Response:

{
"answer":
"The payment flow starts from..."
}
Explain Code
POST /ai/explain

Impact Analysis
POST /ai/impact-analysis

Example:

Question:

What happens if InvoiceService changes?

13. Documentation APIs

Base path:

/api/v1/documentation

Generate Documentation
POST /documentation/generate

Generates:

README
Architecture docs
API docs
Business docs
Get Generated Documents
GET /documentation/{repositoryId}

14. MCP APIs

Base path:

/api/v1/mcp

MCP exposes CodeMind intelligence to AI tools.

Search Code Tool
POST /mcp/tools/search-code

Explain Module Tool
POST /mcp/tools/explain-module

Business Logic Discovery Tool
POST /mcp/tools/find-business-rule

15. Job APIs

Base path:

/api/v1/jobs

Used for async operations.

Get Job Status
GET /jobs/{id}

Response:

{
"id":"job_123",

"status":"completed",

"result":"..."
}
List Jobs
GET /jobs

16. Health APIs
    Application Health
    GET /health

Response:

{
"status":"healthy",

"database":"connected",

"queue":"connected"
} 17. Future API Modules

Future:

/api/v1/code-review

/api/v1/test-generation

/api/v1/refactoring

/api/v1/security-analysis

/api/v1/migrations

18. Endpoint Design Principles
    Resource Based

Use nouns:

/repositories

/users

/jobs

Not:

/getRepositories

Async First

Long operations use:

Job Queue

-

Status API

Stable Contracts

API changes must maintain compatibility.

Conclusion

CodeMind APIs expose software intelligence capabilities
through a secure and scalable interface.

The endpoint architecture maps directly to backend modules,
allowing clean NestJS implementation.

Final principle:

"Every capability should have a clear API boundary."
