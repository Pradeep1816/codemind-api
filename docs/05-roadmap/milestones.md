# CodeMind Delivery Milestones

## Current delivery state

| Phase | Status |
|---|---|
| Phase 1 — Platform & Identity | Complete |
| Phase 2 — Repository Management | Complete |
| Phase 3 — Indexing & Code Intelligence | In progress |
| Phases 4–7 | Planned |
| Phase 8 | Future |

Milestones 3.1 through 3.3 are implemented. They define the indexing data model,
durable queued-job API, immutable commit verification, and isolated job
workspace lifecycle, plus bounded Git-tree discovery and transactional file
inventory. The E2E and new Phase 3 test passes are explicitly deferred.
Milestone 3.4 incremental hashing is next.

## Phase 1 — Platform & Identity

Status: Complete

Acceptance outcomes:

- NestJS application starts with validated configuration.
- PostgreSQL connects through migration-managed TypeORM metadata.
- Health reports API and database state.
- Users register and authenticate within an organization.
- Passwords use Argon2id.
- Access and rotating refresh tokens are session-backed.
- Permissions and role assignments are organization scoped.
- Invitations and user administration enforce tenant and OWNER rules.
- Authentication operations are rate-limited and audited.

## Phase 2 — Repository Management

Status: Complete

### 2.1 Repository foundation

- Repository, member, and branch entities
- Auto-increment internal IDs
- Organization, user, and branch relationships
- Migration-backed constraints and indexes

### 2.2 Repository CRUD

- Register, list, retrieve, update, and delete APIs
- HTTPS URL validation and provider detection
- Tenant scope and repository permissions

### 2.3 Membership

- Add, list, and remove repository members
- Organization-user checks
- Duplicate protection

### 2.4 Git integration

- Hardened Git command boundary
- Credential-free GitHub HTTPS sources
- Allow-listed local development sources
- Clone/fetch and branch inspection

### 2.5 Branch management

- List and synchronize branches
- Persist commit SHAs and deleted-branch lifecycle
- Coalesce same-process concurrent synchronizations

### 2.6 Repository health

- Persist sync attempt/success state and Git object size
- Report branch and latest indexing timestamps without Git I/O

### 2.7 Tests

- Unit, authorization, tenant isolation, and real PostgreSQL E2E coverage

### 2.8 Documentation

- Repository API, module, ER model, schema, and Git security ADR

## Phase 3 — Indexing & Code Intelligence

Status: In progress

Goal: transform an exact Git commit into versioned file, symbol, and dependency
metadata without executing repository code.

### 3.1 Indexing foundation

Status: Implemented; E2E regression deferred

Implemented structure:

```text
src/modules/indexing/
├── discovery/
│   ├── file-discovery.constants.ts
│   ├── file-discovery.errors.ts
│   ├── file-discovery.service.ts
│   └── file-discovery.types.ts
├── dto/
│   ├── index-status.dto.ts
│   ├── list-index-jobs-query.dto.ts
│   └── start-index.dto.ts
├── entities/
│   ├── file-hash.entity.ts
│   ├── index-job.entity.ts
│   ├── indexed-file.entity.ts
│   └── indexing-error.entity.ts
├── enums/
├── indexing.controller.ts
├── file-inventory.service.ts
├── indexing.module.ts
├── indexing.repository.ts
├── indexing.service.spec.ts
├── indexing.service.ts
└── workspace/
    ├── indexing-workspace.errors.ts
    ├── indexing-workspace.service.ts
    └── indexing-workspace.types.ts
```

Acceptance criteria:

- Job, file, content-version, and error entities exist.
- Jobs target one organization, repository, branch, and immutable commit.
- `incremental` and `full` modes are explicit.
- Only one queued/running job exists per branch.
- Create/list/detail APIs enforce JWT, permissions, and tenant scope.
- Disabled repositories and deleted/unsynchronized branches are rejected.
- Migrations apply cleanly with no TypeORM schema drift.
- Service rules have focused unit coverage.
- ADR, module, API, schema, and roadmap documentation agree.

### 3.2 Git workspace manager

Status: Implemented; tests deferred

Deliver:

- `INDEXING_WORKSPACE_ROOT` validated configuration
- Service-derived `<organization>/<repository>/<job>` paths
- `source/`, `metadata/`, and `cache/` lifecycle
- Immutable target-commit verification against the hardened Git object cache
- Traversal/symlink containment protection
- Cleanup and storage-budget policies
- No repository code, hooks, build steps, or package scripts executed

The workspace service prepares empty `source`, `metadata`, and `cache`
directories. Milestone 3.3 scans immutable Git-tree metadata without a
checkout. Milestone 3.4 reads only selected blobs for hashing and may
materialize bounded source when a later parser requires it.

### 3.3 File discovery

Status: Implemented; tests deferred

Deliver:

- Git-tree or safely materialized source scanning
- Central supported-extension registry
- Default ignores for `.git`, `node_modules`, `dist`, `build`, and `coverage`
- Normalized relative paths
- File-count, path, depth, file-size, total-byte, and timeout limits
- Batched writes to `indexed_files`

### 3.4 Incremental indexing

Status: Next

Deliver the ADR-012 hybrid strategy:

- Target-commit no-op detection
- Git blob identity for cheap unchanged-file checks
- SHA-256 content identity for durable versions
- Added, changed, unchanged, and deleted classification
- Idempotent `file_hashes` persistence
- Full rebuild mode

### 3.5 Language detection

Status: Planned

Initial parsed languages:

- TypeScript
- TSX
- JavaScript
- JSX

Inventory-only formats may include JSON, Markdown, YAML, and other bounded text
files. Future adapters add Python, Java, Go, PHP, and C#.

### 3.6 Parser engine

Status: Planned

Deliver:

- Language-specific `SourceParser` interface
- TypeScript Compiler API adapter for TS/JS
- Plain normalized parser results with no ORM coupling
- Syntax diagnostics and per-file failure isolation
- Bounded source input and parser execution

### 3.7 Symbol extraction

Status: Planned

Create version-scoped symbol metadata for:

- Classes and interfaces
- Functions and methods
- Enums and type aliases
- Imports and exports
- Names, qualified names, signatures, and source ranges

### 3.8 Dependency graph

Status: Planned

Create directed relationships for:

- Imports and exports
- Extends and implements
- Calls when resolution is reliable
- Resolved file/symbol targets and unresolved textual targets

### 3.9 Index job system

Status: API foundation delivered early; lifecycle expansion planned

Current endpoints:

```text
POST /api/v1/repositories/:repositoryId/index-jobs
GET  /api/v1/repositories/:repositoryId/index-jobs
GET  /api/v1/repositories/:repositoryId/index-jobs/:jobId
```

Remaining work:

- Cancellation and retry use cases
- Atomic lifecycle transitions
- Lease/heartbeat ownership fields
- Repository health integration

### 3.10 Background processing

Status: Planned

Deliver:

- PostgreSQL-authoritative job claiming
- `SKIP LOCKED` for multiple workers
- At-least-once, idempotent processing
- Bounded retries and expired-lease recovery
- BullMQ/Redis only as an optional delivery notification layer
- Progress, error, and terminal-state updates

### 3.11 Tests

Status: Continuous

Add coverage with each slice:

- Workspace and Git security tests
- Scanner ignore, limit, and path-safety tests
- Hash/change-planner tests
- Parser fixture and malformed-source tests
- Symbol and dependency extraction tests
- Job transition, retry, cancellation, and recovery tests
- PostgreSQL integration and cross-tenant authorization tests

Only service unit specs are added for the current indexing foundation; no
controller or DTO unit spec files are created.

### 3.12 Documentation

Status: In progress throughout Phase 3

Maintain:

- `docs/02-core-modules/indexing.md`
- `docs/03-database/indexing-strategy.md`
- `docs/04-api/indexing-api.md`
- `docs/06-adrs/012-indexing-engine.md`
- This roadmap and milestone tracker

## Phase 3 completion gate

Phase 3 is complete when a synchronized TypeScript/JavaScript repository can
be safely indexed end-to-end and CodeMind can persist:

- Active and deleted file inventory
- Commit, Git blob, and SHA-256 provenance
- Extracted symbols and normalized source ranges
- Dependency relationships
- Progress, file failures, retries, and terminal job state

The resulting metadata must be tenant-scoped, migration-backed, searchable by
the next phase, and covered by unit plus PostgreSQL integration tests.

## Later phases

### Phase 4 — Knowledge Graph & Business Logic

Resolve code relationships into architecture, workflows, business rules,
domain concepts, and versioned documentation.

### Phase 5 — Search Engine

Add lexical, symbol, graph, and semantic retrieval with permission-aware hybrid
ranking and source provenance.

### Phase 6 — AI Assistant (RAG)

Use bounded retrieved context for repository Q&A, explanations, impact
analysis, reviews, and migration assistance.

### Phase 7 — MCP Server

Expose permission-scoped CodeMind resources and tools to IDEs and external AI
agents.

### Phase 8 — Enterprise & Observability

Add SSO/SCIM, administration, quotas, billing, retention, metrics, tracing,
alerts, SLOs, backup/recovery, and multi-region operational controls.
