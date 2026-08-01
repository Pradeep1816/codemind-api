# ADR-012: Indexing Engine Architecture

## Status

Accepted

## Date

2026-08-01

## Context

CodeMind must transform an untrusted Git repository into durable file,
symbol, and relationship metadata that search and AI features can query. The
pipeline is CPU-, filesystem-, and database-intensive and can outlive an HTTP
request or API process.

The design must support:

- Organization isolation
- Reproducible processing of an exact Git commit
- Restart-safe job tracking
- Incremental re-indexing
- TypeScript and JavaScript first, with more languages later
- Safe handling of repository-controlled paths and content
- Independent evolution of scanning, parsing, analysis, search, and AI
- Multiple API and worker processes without duplicate active work

ADR-011 already establishes a hardened, no-checkout Git object workspace. The
indexing engine must extend that boundary without weakening it or executing
repository code.

## Decision summary

CodeMind will use:

1. A persistent organization/repository Git object cache plus isolated,
   disposable per-job processing workspaces.
2. PostgreSQL as the source of truth for indexing jobs and metadata.
3. An at-least-once background-worker model with idempotent, atomic job claims.
4. A language-specific parser interface, with the TypeScript Compiler API as
   the first TypeScript/JavaScript adapter.
5. A hybrid incremental strategy: Git commit and blob identities for cheap
   change discovery, plus SHA-256 content hashes for durable parser-artifact
   identity.
6. Version-aware file, symbol, and relationship metadata in PostgreSQL.

## 1. Repository and workspace storage

### Persistent Git object cache

The existing `GitService` remains the only component allowed to clone or fetch
repository sources. Its managed clone is stored under:

```text
<GIT_WORKSPACE_ROOT>/<organizationId>/<repositoryId>/
```

This clone is the persistent Git object cache. It is created with
`--no-checkout`, uses the source restrictions defined in ADR-011, and is
updated only through the repository synchronization workflow.

### Per-job processing workspace

Each worker attempt receives a service-derived path:

```text
<INDEXING_WORKSPACE_ROOT>/<organizationId>/<repositoryId>/<jobId>/
├── source/
├── metadata/
└── cache/
```

- `source/` contains only files selected from the job's target commit.
- `metadata/` contains bounded temporary manifests and scanner output.
- `cache/` contains disposable parser artifacts local to that attempt.

The API never accepts a workspace path. Every identifier used in a path is
validated, and every resolved path must remain inside the configured root.
Directories use owner-only permissions where supported.

The worker processes the immutable `index_jobs.target_commit_sha`; it never
checks out a mutable branch name. Source materialization reads the Git tree and
blobs for that commit through argument-array Git commands. It rejects absolute
paths, traversal segments, NUL bytes, paths over configured limits, and entries
that would escape through symbolic links. Repository code, hooks, package
scripts, build tools, and language runtimes are never executed.

The job workspace is removed after terminal completion. It may be retained for
a short configurable diagnostic window after failure, but it is not a source
of truth. PostgreSQL and the Git object cache are durable.

### Horizontal scaling consequence

API and worker replicas must see the same Git object cache, or a worker must be
able to hydrate it from the registered remote before claiming work. The first
deployment may use one worker and local persistent storage. Shared storage or
worker-local hydration is required before multiple worker hosts are enabled.

## 2. Job triggering and tracking

PostgreSQL stores every job before any queue message is sent. The initial
manual trigger requires an authenticated user with `repository.read` and
`repository.index`.

Job creation validates:

1. Repository belongs to the authenticated organization and is active.
2. Branch belongs to that repository and is active.
3. Branch has a commit SHA from synchronization.
4. No job for that branch is currently `queued` or `running`.

The branch SHA is copied into `target_commit_sha`. A branch moving later does
not alter existing work.

The lifecycle is:

```text
queued -> running -> succeeded
   |         |  `-> failed
   |         `----> cancelled
   `--------------> cancelled
```

`succeeded` is used instead of the ambiguous word `completed`; it means all
required metadata for the target commit was committed successfully.

The initial API contract is repository-scoped:

```text
POST /api/v1/repositories/:repositoryId/index-jobs
GET  /api/v1/repositories/:repositoryId/index-jobs
GET  /api/v1/repositories/:repositoryId/index-jobs/:jobId
```

This differs intentionally from a global `/index-jobs` collection: including
the repository in the route makes authorization and tenant-resource scoping
explicit. A future organization operations endpoint may aggregate jobs across
repositories.

### Queue and worker semantics

The initial worker may poll PostgreSQL. BullMQ/Redis can later reduce dispatch
latency, but a Redis message is a notification, not the durable job record.

Workers provide at-least-once delivery:

- Claim a queued row atomically in a short transaction.
- Use row locking with `SKIP LOCKED` when multiple workers exist.
- Record attempt number, worker lease, and heartbeat.
- Perform Git and parsing work outside the claim transaction.
- Recheck ownership before progress or terminal updates.
- Recover expired leases according to a bounded retry policy.
- Make persisted file/version writes idempotent.

The partial unique index on repository and branch prevents duplicate active
jobs across API replicas. It does not prevent terminal history.

## 3. Parser architecture

Parsing uses a language-specific port rather than controller or worker code
calling a parser library directly.

Conceptual contract:

```ts
interface SourceParser {
  supports(language: SourceLanguage): boolean;
  parse(input: ParseSourceInput): Promise<ParseSourceResult>;
}
```

`ParseSourceInput` includes stable file/version identity, normalized path,
language, and bounded source content. `ParseSourceResult` contains normalized
symbols, imports, exports, and syntax diagnostics. It contains no TypeORM
entities and performs no database writes.

The first adapter uses the TypeScript Compiler API for TypeScript, TSX,
JavaScript, and JSX. It provides mature syntax handling and precise source
positions without executing code. The `typescript` package must be a runtime
dependency when this adapter is implemented.

Future Python, Java, Go, PHP, and C# adapters implement the same contract.
Tree-sitter may be used inside those adapters, but its node types must not leak
into CodeMind's normalized domain model.

Parser failures are isolated to a file where possible. One unsupported or
malformed file should not abort an otherwise useful repository index unless a
configured failure threshold is crossed.

## 4. Incremental indexing

CodeMind uses both Git identity and SHA-256 rather than choosing only one.

### Commit identity

The job's target commit makes the complete run reproducible. If the latest
successful job for a branch already targets the same commit and a forced full
mode was not requested, the job can finish without scanning content again.

### Git blob identity

Git tree discovery provides blob object IDs without reading every unchanged
file. Matching path and blob ID normally means the content is unchanged and
can reuse the previous file version.

### SHA-256 content identity

When a new blob is read, CodeMind computes SHA-256 while enforcing content-size
limits. SHA-256 is the durable identity for parser artifact reuse and detects
identical content across Git object formats or repositories.

The decision flow is:

```text
same target commit and incremental mode -> no-op success
same path and Git blob ID               -> reuse version
new blob, existing SHA-256              -> reuse parsed content where valid
new SHA-256                              -> parse and persist new version
missing previous path                   -> mark file deleted
```

Full mode ignores prior reuse decisions and rebuilds active metadata for the
target commit. Incremental mode is the default.

## 5. Metadata model

### `index_jobs`

Owns durable orchestration state: organization, repository, branch, target
commit, trigger, indexing mode, lifecycle, counters, attempts, errors, and
timestamps.

### `indexed_files`

Represents the stable normalized path inside a repository branch. It stores
repository/branch ownership, path, extension, detected language, current
lifecycle (`active` or `deleted`), current immutable file-hash identity,
last-seen job/commit, and timestamps.

Uniqueness:

```text
UNIQUE (branch_id, normalized_path)
```

### `file_hashes`

Represents an immutable content version observed for an indexed file. It
stores the owning file, discovering job, Git blob ID, SHA-256 value, byte size,
and observation time. Parser artifacts reference this version so history is
not overwritten when a path changes.

### `indexing_errors`

Stores sanitized operational failures linked to a job and optionally a file.
It records processing phase, stable error code, bounded message, retryability,
attempt number, and timestamp. It never stores source content, credentials,
raw command output, or stack traces intended only for application logs.

### `code_symbols`

Represents normalized declarations for a file version: name, qualified name,
kind, visibility, source range, signature, and optional documentation. Symbol
identity is scoped to the immutable file version.

### `dependencies`

Represents directed relationships such as `import`, `export`, `extends`,
`implements`, and later `calls`. Both unresolved textual targets and resolved
file/symbol targets are supported because repositories can be partially
understood.

## 6. Persistence boundaries

- Controllers use application services and never TypeORM repositories.
- Indexing services own job and processing rules.
- Persistence adapters own queries and transactions.
- Parser adapters return plain normalized results.
- Workers coordinate services but do not embed SQL or parser-specific logic.
- Parser, analysis, knowledge, search, and AI modules may consume indexing
  outputs; the indexing module does not depend on those downstream modules.

Large runs are committed in bounded batches. A database transaction must not
span clone/fetch, source materialization, hashing, or parsing. The terminal job
transition occurs only after all required batches and deletion markers are
durable.

## 7. File discovery policy

The first scanner supports:

- `.ts`, `.tsx`, `.js`, `.jsx`
- Configuration and knowledge files such as `.json`, `.md`, `.yaml`, `.yml`
  as inventory-only until a parser supports them

It ignores at minimum:

- `.git`
- `node_modules`
- `dist`
- `build`
- `coverage`

Ignore rules are centralized and testable. Repository `.gitignore` rules may
augment platform defaults but cannot re-enable paths blocked by CodeMind's
security policy. Limits apply to file count, individual file size, total bytes,
path length, nesting depth, and processing time.

## Alternatives considered

### Index synchronously in the API request

Rejected because indexing can exceed request timeouts, holds resources too
long, and cannot recover cleanly after an API restart.

### Redis/BullMQ as the source of truth

Rejected. Queue infrastructure may be temporarily unavailable or lose
retention history. PostgreSQL remains authoritative; queue delivery is
reconstructable.

### Mutable branch checkout

Rejected because the branch can advance during processing and checkout can
materialize repository-controlled behavior. Jobs target immutable commits and
use controlled Git tree/blob reads.

### SHA-256 every file on every run

Rejected as the only change detector because it requires reading all content.
Git blob IDs cheaply eliminate most unchanged reads; SHA-256 remains the
portable durable content identity.

### Git blob ID only

Rejected as the only durable hash because repositories may use different Git
object formats and cross-repository parser reuse benefits from a standard
content digest.

### One universal parser implementation

Rejected because languages expose different syntax and semantics. A shared
interface with language-specific adapters keeps the normalized model stable
without forcing a lowest-common-denominator parser.

## Consequences

### Benefits

- Every index is tied to an exact reproducible commit.
- Jobs and progress survive API, queue, and worker restarts.
- Work can scale horizontally with atomic claims and idempotent writes.
- Unchanged Git blobs avoid unnecessary content reads and parser work.
- Parser libraries can evolve independently per language.
- PostgreSQL provides a consistent tenant-aware metadata source for search and
  AI phases.

### Costs and trade-offs

- Persistent Git caches and per-job workspaces require storage lifecycle and
  quota management.
- Dual Git/SHA-256 identities add metadata and implementation complexity.
- Worker leases, retries, cancellation, and cleanup require explicit state
  machines.
- TypeScript must become a production dependency for the first parser adapter.
- Very large repositories require batching and enforced resource budgets.

## Delivery mapping

| Phase 3 milestone | ADR decision applied |
|---|---|
| 3.1 Foundation | Durable job, file/version, error entities and enums |
| 3.2 Git workspace | Persistent object cache plus safe per-job workspace |
| 3.3 File discovery | Central ignore policy, normalized paths, resource limits |
| 3.4 Incremental indexing | Commit + Git blob + SHA-256 strategy |
| 3.5 Language detection | Central language registry, TS/JS first |
| 3.6 Parser engine | `SourceParser` port and language adapters |
| 3.7 Symbols | Version-scoped normalized symbol records |
| 3.8 Dependencies | Directed, optionally unresolved relationships |
| 3.9 Job system | Repository-scoped API and durable lifecycle |
| 3.10 Background processing | PostgreSQL claims; optional BullMQ notification |
| 3.11 Tests | Scanner, parser, Git boundary, job, and integration coverage |
| 3.12 Documentation | Module, schema, API, and ADR maintained together |
