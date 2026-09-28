# CodeMind Delivery Milestones

## Current delivery state

| Phase                                      | Status   |
| ------------------------------------------ | -------- |
| Phase 1 — Platform & Identity              | Complete |
| Phase 2 — Repository Management            | Complete |
| Phase 3 — Indexing & Code Intelligence     | Complete |
| Phase 4 — Knowledge Graph & Business Logic | Complete |
| Phase 5 — Search Engine                    | In progress |
| Phases 6–7                                 | Planned  |
| Phase 8                                    | Future   |

Milestones 3.1 through 3.12 are implemented. They define the indexing data model,
durable queued-job API, immutable commit verification, and isolated job
workspace lifecycle, plus bounded Git-tree discovery and transactional file
inventory. Incremental mode skips unchanged Git blobs and persists SHA-256
content versions in bounded batches. A centralized registry now persists
language and parser capability, normalized TS/JS parsing through the
TypeScript Compiler API, version-scoped symbol persistence, and the initial
dependency graph. Milestone 3.9 adds atomic claims, leases, phase/progress
tracking, bounded automatic retries, cancellation, recovery, and manual retry
history. Milestone 3.10 now executes the complete pipeline through a
PostgreSQL-backed background worker with heartbeats, cooperative cancellation,
incremental completion markers, and graceful shutdown. Milestone 3.11 adds
focused service tests and a real-PostgreSQL pipeline suite for authorization,
initial/full/incremental indexing, changed and deleted files, atomic claims,
cancellation, lease recovery, bounded retries, and performance smoke limits.
Milestone 3.12 completes the module, parser, API, schema, ADR, roadmap, and
Phase 4 handoff documentation.

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

Status: Complete

Goal: transform an exact Git commit into versioned file, symbol, and dependency
metadata without executing repository code.

### 3.1 Indexing foundation

Status: Implemented; covered by the Milestone 3.11 suite

Implemented structure:

```text
src/modules/indexing/
├── content/
│   ├── content-hash.errors.ts
│   ├── content-hash.service.ts
│   └── content-hash.types.ts
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
├── language/
│   ├── language-detection.errors.ts
│   ├── language-detection.service.ts
│   ├── language-detection.types.ts
│   └── language-registry.constants.ts
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

Status: Implemented; covered by the Milestone 3.11 suite

Deliver:

- `INDEXING_WORKSPACE_ROOT` validated configuration
- Service-derived `<organization>/<repository>/<job>` paths
- `source/`, `metadata/`, and `cache/` lifecycle
- Immutable target-commit verification against the hardened Git object cache
- Traversal/symlink containment protection
- Safe workspace reset and validated cleanup operations
- File-count, byte, path, and depth input budgets
- No repository code, hooks, build steps, or package scripts executed

The workspace service prepares empty `source`, `metadata`, and `cache`
directories. The current pipeline scans immutable Git-tree metadata without a
checkout and reads only selected blobs. `source/` remains reserved for a future
adapter that requires bounded materialization.

### 3.3 File discovery

Status: Implemented; covered by the Milestone 3.11 suite

Deliver:

- Git-tree or safely materialized source scanning
- Central supported-extension registry
- Default ignores for `.git`, `node_modules`, `dist`, `build`, and `coverage`
- Normalized relative paths
- File-count, path, depth, file-size, and total-byte limits
- Batched writes to `indexed_files`

### 3.4 Incremental indexing

Status: Implemented; covered by the Milestone 3.11 suite

Deliver the ADR-012 hybrid strategy:

- Immutable target-commit verification on every run
- Git blob identity for cheap unchanged-file checks
- SHA-256 content identity for durable versions
- Added, changed, unchanged, and deleted classification
- Idempotent `file_hashes` persistence
- Full rebuild mode

### 3.5 Language detection

Status: Implemented; covered by the Milestone 3.11 suite

Initial parsed languages:

- TypeScript
- TSX
- JavaScript
- JSX

Inventory-only formats may include JSON, Markdown, YAML, and other bounded text
files. Future adapters add Python, Java, Go, PHP, and C#.

### 3.6 Parser engine

Status: Implemented; covered by the Milestone 3.11 suite

Deliver:

- Language-specific `SourceParser` interface
- TypeScript Compiler API adapter for TS/JS
- Plain normalized parser results with no ORM coupling
- Syntax diagnostics without executing repository source
- Bounded source input and parser execution

The adapter extracts normalized classes, interfaces, functions, methods,
enums, type aliases, imports, exports, source ranges, and syntax diagnostics.
Those results are persisted by Milestone 3.7.

### 3.7 Symbol extraction

Status: Implemented; covered by the Milestone 3.11 suite

Create version-scoped symbol metadata for:

- Classes and interfaces
- Functions and methods
- Enums and type aliases
- Imports and exports
- Names, qualified names, signatures, and source ranges

Symbols use auto-increment IDs and immutable `file_hash_id` ownership. Safe
retries preserve matching IDs, insert new output, and atomically remove stale
output after verifying running-job and tenant ownership.

### 3.8 Dependency graph

Status: Implemented; covered by the Milestone 3.11 suite

Create directed relationships for:

- Imports and exports
- Extends and implements
- Calls when resolution is reliable
- Resolved file/symbol targets and unresolved textual targets

The first graph slice resolves deterministic relative TS/JS modules and local
symbols. Bare packages, path aliases, ambiguous declarations, and unsupported
targets remain safely unresolved with their original text. Function calls are
deferred until semantic resolution is reliable.

### 3.9 Index job system

Status: Implemented; covered by the Milestone 3.11 suite

Current endpoints:

```text
POST /api/v1/repositories/:repositoryId/index-jobs
GET  /api/v1/repositories/:repositoryId/index-jobs
GET  /api/v1/repositories/:repositoryId/index-jobs/:jobId
POST /api/v1/repositories/:repositoryId/index-jobs/:jobId/cancel
POST /api/v1/repositories/:repositoryId/index-jobs/:jobId/retry
```

Delivered:

- Separate durable status and detailed processing phase
- Atomic `SKIP LOCKED` claims with private lease-token fencing
- Heartbeats, monotonic progress, terminal transitions, and attempt ceilings
- Cooperative cancellation and bounded expired-lease recovery
- Automatic retry scheduling and manual retry ancestry
- Branch `lastIndexedAt` update after current-commit success

### 3.10 Background processing

Status: Implemented; migration and pipeline verified by the Milestone 3.11 suite

Delivered:

- Worker polling and end-to-end pipeline orchestration
- Periodic heartbeats and cooperative cancellation checks between batches
- At-least-once, idempotent processing through the lifecycle contract
- BullMQ/Redis only as an optional delivery notification layer
- Startup and scheduled expired-lease recovery invocation
- `202 Accepted` job creation outside the processing lifecycle
- Current-file and derived-percentage progress reporting
- Per-hash analysis completion for restart-safe incremental reuse
- Environment-controlled polling and graceful shutdown

### 3.11 Tests

Status: Implemented

Delivered coverage:

- Workspace and Git security tests
- Scanner ignore, limit, and path-safety tests
- Hash/change-planner tests
- Parser fixture and malformed-source tests
- Symbol and dependency extraction tests
- Job transition, retry, cancellation, and recovery tests
- PostgreSQL integration and cross-tenant authorization tests
- Initial, unchanged, modified, deleted, and explicit full-index workflows
- Concurrent claims, cancellation, expired-lease recovery, and retry exhaustion
- A bounded small-fixture duration, throughput, and heap-growth smoke check

Only service unit specs and pipeline E2E tests are added; no controller or DTO
unit spec files are created.

### 3.12 Documentation

Status: Complete

Final documentation set:

- `docs/02-core-modules/indexing.md`
- `docs/02-core-modules/parser.md`
- `docs/03-database/indexing-strategy.md`
- `docs/04-api/indexing-api.md`
- `docs/06-adrs/012-indexing-engine.md`
- `docs/06-adrs/013-parser-architecture.md`
- This roadmap and milestone tracker

## Phase 3 completion gate

Phase 3 is complete. A synchronized TypeScript/JavaScript repository can be
safely indexed end-to-end, and CodeMind persists:

- Active and deleted file inventory
- Commit, Git blob, and SHA-256 provenance
- Extracted symbols and normalized source ranges
- Dependency relationships
- Progress, file failures, retries, and terminal job state

The resulting metadata is tenant-scoped, migration-backed, ready for Phase 4
consumption, and covered by unit plus PostgreSQL integration tests.

Verification commands:

```bash
yarn build
yarn eslint "{src,apps,libs,test}/**/*.ts"
yarn test --runInBand
yarn test:e2e --runInBand
```

## Phase 4 — Knowledge Graph & Business Logic

Status: Complete

Goal: derive commit-scoped technical and business knowledge from successful
Phase 3 snapshots without duplicating structural truth.

### 4.1 Architecture foundation

Status: Complete

Delivered:

- ADR-014 module boundaries and dependency direction
- PostgreSQL-first typed adjacency graph decision
- Immutable knowledge snapshots tied to successful index jobs
- Mandatory file/hash/symbol/range evidence
- Deterministic and heuristic derivation classification
- Business extraction as an analysis subdomain
- Canonical analysis, business, knowledge, and schema documents
- Legacy schema drafts explicitly marked superseded

No entities, migrations, workers, or APIs are introduced in this architecture
milestone.

### 4.2 Analysis foundation

Status: Complete

Delivered:

- Tenant-scoped read-only Phase 3 snapshot port with stale-inventory detection
- Bounded immutable-source port with commit, blob, size, and UTF-8 validation
- Versioned synchronous/asynchronous technical analyzer contract
- Normalized fact, evidence, confidence, diagnostic, identity, and fingerprint
  types without ORM coupling
- TypeScript/JavaScript decorator, constructor-injection, call-site, computed
  target, and unresolved-target fixtures
- Snapshot source-byte, per-file AST-node, fact, diagnostic, property-payload,
  duplicate identity, and evidence-scope limits
- Focused service and analyzer coverage without Phase 4 persistence or APIs

### 4.3 Knowledge persistence foundation

Status: Complete

Delivered:

- Knowledge-build lifecycle entities
- Immutable snapshot, node, edge, evidence, and error entities
- Evidence link tables, constraints, and indexes
- Reviewed TypeORM migrations and zero schema drift
- Atomic publication and current-snapshot selection
- PostgreSQL integration coverage for publication, evidence, immutability, and
  branch-move behavior

### 4.4 Call graph and architecture extraction

Status: Complete

Delivered:

- Reliably resolved call edges
- Module, controller, service, repository, entity, provider, and configuration
  classifications
- Component containment and dependency relationships
- Explicit unresolved/ambiguous targets
- Bounded repository-wide file, symbol, dependency, and output accumulation
- Knowledge projection for architecture nodes, relationships, and evidence

### 4.5 Domain concepts and business rules

Status: Complete

Delivered:

- Evidence-backed domain concepts
- Validation, permission, calculation, state, eligibility, and scheduling rules
- Deterministic identity and content fingerprints
- Clear heuristic confidence and unsupported cases
- Domain/rule node projection plus component `represents` and `enforces` edges
- Bounded AST traversal without source execution or raw-expression persistence

### 4.6 Workflows, events, states, and transitions

Status: Complete

Deliver:

- Ordered workflow and workflow-step facts
- Domain events and handlers
- State values and evidence-backed transitions
- Bounded traversal with explicit branch limitations

Implemented so far:

- Enum and explicit-assignment state facts
- Equality-guarded transitions with unknown-source preservation
- State and transition knowledge nodes with immutable evidence
- Proven `transitions_to` and containing-component `enforces` relationships
- Literal-topic and constructed-type event publications
- `OnEvent` and `EventsHandler` contracts with unresolved dynamic preservation
- Domain-event/event-handler nodes plus proven `triggers` and `handles` edges
- Route-backed workflows with deterministic direct-call step ordering
- Workflow/step nodes plus `contains`, `precedes`, and resolved `calls` edges
- Snapshot, total-step, and per-workflow resource limits
- Explicit exclusion of unresolved, ambiguous, recursive, and branch-sensitive
  steps

### 4.7 Knowledge APIs

Status: Complete

Deliver repository-scoped APIs for:

- Current and historical snapshots
- Architecture components and relationships
- Domain concepts and business rules
- Workflows, states, events, and transitions
- Evidence summaries

Implemented:

- Published snapshot history and current-branch snapshot lookup
- Snapshot graph totals
- Paginated node queries with kind and name filters
- Paginated relationship queries with kind and endpoint filters
- Node and relationship detail with immutable evidence summaries
- Tenant-scoped `404` behavior and complete draft-snapshot exclusion

### 4.8 Background processing

Status: Complete

Deliver:

- Durable PostgreSQL worker claims and leases
- Progress, retries, cancellation, recovery, and graceful shutdown
- Unpublished batch persistence and atomic publication
- Current-snapshot race protection when branches advance

Implemented:

- Tenant-scoped build create, list, detail, cancel, and retry APIs
- PostgreSQL `SKIP LOCKED` claims with renewable ownership leases
- Configurable polling, heartbeat, retry, and expired-lease recovery policies
- Full analysis/projector assembly with deterministic identity conflict checks
- Bounded retry-safe node/edge batches and durable analyzer diagnostics
- Cooperative cancellation and graceful worker shutdown
- Evidence validation and atomic publication of invisible draft snapshots
- Historical publication without current-snapshot replacement after branch movement

### 4.9 Tests and documentation

Status: Complete

Delivered:

- Analyzer fixtures and malformed/ambiguous source tests
- Publication, evidence, lifecycle, and tenant-isolation tests
- PostgreSQL E2E coverage for the claimed processor, lifecycle, persistence,
  publication, and query boundaries
- Retry-idempotent batches and conflicting identity rollback
- Foreign source-evidence rejection, draft invisibility, and cross-tenant reads
- Bounded 100-node/99-edge PostgreSQL persistence baseline
- API, module, schema, ADR, and roadmap completion review

## Phase 4 completion gate

Phase 4 is complete when CodeMind can generate and query an immutable knowledge
snapshot containing architecture, domain, rule, workflow, state, and event
facts for a supported TypeScript/JavaScript repository, with evidence for every
published node and edge.

The result is tenant-scoped, commit-scoped, reproducible by analyzer version,
migration-backed, atomically published, and covered by unit plus PostgreSQL
integration tests.

## Phase 5 — Search Engine

Status: In progress

Goal: retrieve a small, relevant, permission-scoped set of source and knowledge
records for developers and downstream AI consumers.

### 5.1 Architecture foundation

Status: Complete

Delivered:

- PostgreSQL-first search strategy and module boundaries
- Versioned, atomically published search projections
- Exact, lexical, symbol, and graph retrieval sequence
- Deterministic ranking and source-provenance requirements
- Explicit deferral criteria for embeddings and external search engines

### 5.2 Search document model

Status: Complete

Delivered:

- Search-index and search-document entities
- Migration-backed enums, foreign keys, checks, B-tree and GIN indexes
- File, symbol, and knowledge-node source provenance
- Tenant/commit/source-scope validation triggers
- Database-maintained weighted full-text vectors
- Draft visibility and published-content immutability rules

### 5.3 Search projection builder

Status: Next

Build bounded, retry-safe file, symbol, and knowledge documents and publish a
complete search index atomically.

### 5.4–5.9 Retrieval and delivery

Planned:

- Exact identifier, path, symbol, and lexical retrieval
- Bounded dependency and knowledge-graph expansion
- Ranking, deduplication, filters, and score explanations
- Tenant-scoped search APIs and web experience
- Quality corpus, security, PostgreSQL integration, and performance tests

## Later phases

### Phase 6 — AI Assistant (RAG)

Use bounded retrieved context for repository Q&A, explanations, impact
analysis, reviews, and migration assistance.

### Phase 7 — MCP Server

Expose permission-scoped CodeMind resources and tools to IDEs and external AI
agents.

### Phase 8 — Enterprise & Observability

Add SSO/SCIM, administration, quotas, billing, retention, metrics, tracing,
alerts, SLOs, backup/recovery, and multi-region operational controls.
