# Indexing Schema and Persistence Strategy

## Document information

Status: Milestone 3.8 schema implemented; dependency migration pending
Version: 2.3
Owner: CodeMind Engineering
Architecture decision: [ADR-012](../06-adrs/012-indexing-engine.md)

## Goal

Indexing must survive process restarts and preserve the exact Git snapshot that
produced code metadata. PostgreSQL is the source of truth for jobs, file
inventory, content versions, progress, and sanitized failures. A future queue
may notify workers, but it is not the durable record of work.

The schema through Milestone 3.8 contains:

- `index_jobs` for durable orchestration
- `indexed_files` for stable branch/path inventory
- `file_hashes` for immutable content observations
- `code_symbols` for normalized declarations tied to content versions
- `code_dependencies` for versioned imports, exports, and inheritance edges
- `indexing_errors` for operational failure records

All high-volume indexing records use auto-increment integer IDs. Organization
and user references retain UUIDs.

## Entity relationship diagram

```mermaid
erDiagram
    ORGANIZATIONS ||--o{ INDEX_JOBS : owns
    USERS o|--o{ INDEX_JOBS : requests
    REPOSITORIES ||--o{ INDEX_JOBS : contains
    REPOSITORY_BRANCHES ||--o{ INDEX_JOBS : targets

    ORGANIZATIONS ||--o{ INDEXED_FILES : owns
    REPOSITORIES ||--o{ INDEXED_FILES : contains
    REPOSITORY_BRANCHES ||--o{ INDEXED_FILES : inventories
    INDEX_JOBS o|--o{ INDEXED_FILES : last_seen_by

    ORGANIZATIONS ||--o{ FILE_HASHES : owns
    INDEXED_FILES ||--o{ FILE_HASHES : versions
    INDEX_JOBS o|--o{ FILE_HASHES : observes

    ORGANIZATIONS ||--o{ CODE_SYMBOLS : owns
    REPOSITORIES ||--o{ CODE_SYMBOLS : contains
    REPOSITORY_BRANCHES ||--o{ CODE_SYMBOLS : scopes
    INDEXED_FILES ||--o{ CODE_SYMBOLS : declares
    FILE_HASHES ||--o{ CODE_SYMBOLS : versions
    INDEX_JOBS o|--o{ CODE_SYMBOLS : observes

    ORGANIZATIONS ||--o{ CODE_DEPENDENCIES : owns
    REPOSITORIES ||--o{ CODE_DEPENDENCIES : contains
    REPOSITORY_BRANCHES ||--o{ CODE_DEPENDENCIES : scopes
    INDEXED_FILES ||--o{ CODE_DEPENDENCIES : sources
    FILE_HASHES ||--o{ CODE_DEPENDENCIES : versions
    CODE_SYMBOLS o|--o{ CODE_DEPENDENCIES : source_symbol
    INDEXED_FILES o|--o{ CODE_DEPENDENCIES : target_file
    FILE_HASHES o|--o{ CODE_DEPENDENCIES : target_version
    CODE_SYMBOLS o|--o{ CODE_DEPENDENCIES : target_symbol
    INDEX_JOBS o|--o{ CODE_DEPENDENCIES : observes

    ORGANIZATIONS ||--o{ INDEXING_ERRORS : owns
    INDEX_JOBS ||--o{ INDEXING_ERRORS : records
    INDEXED_FILES o|--o{ INDEXING_ERRORS : affects
```

Organization IDs are intentionally repeated on high-volume tables. They make
tenant-scoped queries and indexes explicit. Application services must derive
the value from authenticated/job context and keep it consistent with the
referenced repository, branch, job, and file.

## `index_jobs`

| Column | Type | Null | Purpose |
|---|---|:---:|---|
| `id` | serial integer | No | Internal job identity |
| `organization_id` | UUID | No | Tenant boundary |
| `repository_id` | integer | No | Parent repository |
| `branch_id` | integer | No | Target branch |
| `requested_by_user_id` | UUID | Yes | Requesting user; null after user deletion or for future system work |
| `trigger` | `index_job_trigger` | No | `manual` or future `repository_sync` |
| `mode` | `indexing_mode` | No | `incremental` or `full` |
| `status` | `index_job_status` | No | Durable lifecycle state |
| `target_commit_sha` | varchar(64) | No | Immutable Git commit selected at creation |
| `total_files` | integer | No | Planned files |
| `processed_files` | integer | No | Successful files |
| `skipped_files` | integer | No | Reused, ignored, or unsupported files |
| `failed_files` | integer | No | Files with processing failures |
| `attempt_count` | integer | No | Worker attempts |
| `failure_code` | varchar(100) | Yes | Stable terminal error code |
| `failure_message` | varchar(1000) | Yes | Sanitized terminal summary |
| `started_at` | timestamptz | Yes | Latest processing start |
| `completed_at` | timestamptz | Yes | Terminal completion time |
| `created_at` | timestamptz | No | Queue time |
| `updated_at` | timestamptz | No | Last lifecycle update |

### Job constraints

Only one active job is allowed for a repository branch:

```sql
CREATE UNIQUE INDEX uq_index_jobs_active_repository_branch
ON index_jobs (repository_id, branch_id)
WHERE status IN ('queued', 'running');
```

The application performs an early duplicate check for a useful `409`; the
partial unique index remains authoritative when requests race.

Counters must be non-negative and obey:

```text
processed_files + skipped_files + failed_files <= total_files
```

## `indexed_files`

`indexed_files` represents the stable path identity inside one repository
branch. Content changes create `file_hashes`; they do not replace the file ID.

| Column | Type | Null | Purpose |
|---|---|:---:|---|
| `id` | serial integer | No | File/path identity |
| `organization_id` | UUID | No | Tenant boundary |
| `repository_id` | integer | No | Parent repository |
| `branch_id` | integer | No | Parent branch |
| `last_seen_job_id` | integer | Yes | Most recent job that observed this path |
| `current_file_hash_id` | integer | Yes | Current immutable content version after hashing |
| `path` | varchar(1024) | No | Repository-relative normalized path |
| `extension` | varchar(32) | Yes | Lowercase extension without interpretation |
| `language` | varchar(64) | Yes | `typescript`, `javascript`, `json`, `markdown`, or `yaml`; null before detection |
| `size_bytes` | integer | No | Current observed content size |
| `status` | `indexed_file_status` | No | `active` or `deleted` |
| `last_seen_commit_sha` | varchar(64) | No | Commit that last observed the current path state |
| `created_at` | timestamptz | No | First observation |
| `updated_at` | timestamptz | No | Latest inventory change |

The unique key is:

```text
UNIQUE (branch_id, path)
```

Paths use `/` separators, have no leading slash, and cannot contain traversal
segments or NUL bytes. The scanner owns those validation rules before
persistence. Missing paths are marked `deleted` instead of immediately
removed, allowing downstream symbol and relationship cleanup to be explicit.

## `file_hashes`

`file_hashes` stores immutable content observations. It separates stable path
identity from content version identity.

`indexed_files.current_file_hash_id` points to the content version currently
observed at that path. The explicit pointer is required when a path changes and
later returns to an older hash; creation order alone cannot identify current
content reliably.

| Column | Type | Null | Purpose |
|---|---|:---:|---|
| `id` | serial integer | No | Content-version identity |
| `organization_id` | UUID | No | Tenant boundary |
| `indexed_file_id` | integer | No | Stable file/path identity |
| `observed_by_job_id` | integer | Yes | First job that persisted the version |
| `algorithm` | `file_hash_algorithm` | No | Currently `sha256` |
| `value` | varchar(128) | No | Lowercase digest |
| `git_blob_oid` | varchar(64) | No | Git object ID used for cheap change detection |
| `size_bytes` | integer | No | Hashed content size |
| `created_at` | timestamptz | No | First observation time |

The uniqueness rule is:

```text
UNIQUE (indexed_file_id, algorithm, value)
```

If a file returns to content seen earlier, the existing content version can be
reused. The tenant/algorithm/value index supports future parser-artifact reuse
without removing tenant scope.

## `code_symbols`

`code_symbols` stores normalized declarations from one immutable file content
version. The row never contains a TypeScript compiler node or source body.

| Column | Type | Null | Purpose |
|---|---|:---:|---|
| `id` | serial integer | No | Stable internal symbol identity |
| `organization_id` | UUID | No | Tenant boundary |
| `repository_id` | integer | No | Parent repository for scoped queries |
| `branch_id` | integer | No | Parent branch |
| `indexed_file_id` | integer | No | Stable branch/path identity |
| `file_hash_id` | integer | No | Immutable content version |
| `observed_by_job_id` | integer | Yes | Most recent job that reconciled the symbol |
| `name` | varchar(255) | No | Declaration name |
| `qualified_name` | varchar(512) | No | Name including containing declarations |
| `kind` | `code_symbol_kind` | No | Normalized declaration kind |
| `visibility` | `code_symbol_visibility` | Yes | Explicit/effective member visibility; null when not applicable |
| `exported` | boolean | No | Declaration has an export modifier |
| `default_export` | boolean | No | Declaration is the module default export |
| `signature` | varchar(2000) | Yes | Bounded declaration header without the implementation body |
| `documentation` | varchar(4000) | Yes | Bounded normalized JSDoc summary |
| `start_line`, `end_line` | integer | No | One-based source lines |
| `start_column`, `end_column` | integer | No | One-based source columns |
| `start_offset`, `end_offset` | integer | No | Zero-based source offsets |
| `created_at`, `updated_at` | timestamptz | No | Persistence lifecycle |

The parser identity key is:

```text
UNIQUE (file_hash_id, kind, qualified_name, start_offset)
```

A safe retry loads symbols for the file hash, updates matching rows in place,
inserts new declarations, and deletes stale declarations in one transaction.
This preserves auto-increment IDs for unchanged identities while allowing a
parser upgrade to reconcile output. Position checks require positive lines and
columns, non-negative offsets, and an end position not before its start.

Before persistence, the repository verifies that:

- The job is still `running` for the organization, repository, branch, and
  target commit.
- The file belongs to that tenant/repository/branch and remains active.
- `indexed_files.current_file_hash_id` is the parsed content version.
- The file hash matches the expected Git blob and byte size.

This ownership recheck prevents a stale parser result from overwriting current
metadata. `INDEXING_MAX_SYMBOLS_PER_FILE` bounds one reconciliation; the
default is 10,000, and writes use batches of 250 rows.

## `code_dependencies`

`code_dependencies` stores directed normalized relationships owned by one
immutable source file version. Original textual targets remain available even
when a file or symbol cannot be resolved.

| Column | Type | Null | Purpose |
|---|---|:---:|---|
| `id` | serial integer | No | Stable internal relationship identity |
| `organization_id` | UUID | No | Tenant boundary |
| `repository_id` | integer | No | Parent repository |
| `branch_id` | integer | No | Parent branch |
| `source_indexed_file_id` | integer | No | Source path identity |
| `source_file_hash_id` | integer | No | Immutable source content version |
| `source_symbol_id` | integer | Yes | Source declaration for inheritance edges |
| `observed_by_job_id` | integer | Yes | Most recent reconciling job |
| `identity_hash` | varchar(64) | No | SHA-256 of the normalized relationship identity |
| `kind` | `code_dependency_kind` | No | `import`, `export`, `extends`, or `implements` |
| `module_specifier` | varchar(1024) | Yes | Original module target such as `./user.service` |
| `target_name` | varchar(512) | Yes | Imported, exported, or inherited textual name |
| `local_name` | varchar(255) | Yes | Local binding or export alias |
| `type_only` | boolean | No | Type-only import/export marker |
| `target_indexed_file_id` | integer | Yes | Reliably resolved target path |
| `target_file_hash_id` | integer | Yes | Resolved immutable target version |
| `target_symbol_id` | integer | Yes | Unambiguous resolved target declaration |
| Source range columns | integer | No | One-based lines/columns and zero-based offsets |
| `created_at`, `updated_at` | timestamptz | No | Persistence lifecycle |

The stable reconciliation key is:

```text
UNIQUE (source_file_hash_id, identity_hash)
```

The identity hash covers relationship kind, original module, textual target,
local alias, type-only state, and source offset. Resolution IDs are excluded,
so a later successful resolution updates the same row instead of creating a
new relationship.

The first resolver supports deterministic repository-relative TS, TSX, JS,
JSX, and JSON candidates. It maps `.js` source imports to `.ts`/`.tsx` when
present and supports directory `index` files. Bare packages, path aliases,
paths outside the repository, and ambiguous symbols remain unresolved. This
policy prefers a textual edge over an incorrect graph edge.

Persistence rechecks running-job ownership and the current source file hash.
Every resolved target file must be active in the same organization,
repository, and branch, and its target hash must still be current. Symbol IDs
must belong to their declared source or target file version. Reconciliation
uses 250-row writes and is capped by
`INDEXING_MAX_DEPENDENCIES_PER_FILE` (20,000 by default).

## `indexing_errors`

`indexing_errors` preserves bounded, sanitized failures for operations and
file-level diagnostics.

| Column | Type | Null | Purpose |
|---|---|:---:|---|
| `id` | serial integer | No | Error identity |
| `organization_id` | UUID | No | Tenant boundary |
| `index_job_id` | integer | No | Owning job |
| `indexed_file_id` | integer | Yes | Affected file, when applicable |
| `phase` | `indexing_error_phase` | No | Pipeline stage |
| `code` | varchar(100) | No | Stable machine-readable code |
| `message` | varchar(1000) | No | Sanitized explanation |
| `retryable` | boolean | No | Whether retry policy may retry |
| `attempt_number` | integer | No | Attempt that recorded the failure |
| `created_at` | timestamptz | No | Failure time |

The message must not contain source content, credentials, absolute workspace
paths, raw Git output, or stack traces. Those belong in access-controlled
application logs.

Supported error phases are `discovery`, `materialization`, `hashing`,
`parsing`, `persistence`, and `finalization`.

## Enum catalog

| Enum | Values |
|---|---|
| `index_job_status` | `queued`, `running`, `succeeded`, `failed`, `cancelled` |
| `index_job_trigger` | `manual`, `repository_sync` |
| `indexing_mode` | `incremental`, `full` |
| `indexed_file_status` | `active`, `deleted` |
| `file_hash_algorithm` | `sha256` |
| `code_symbol_kind` | `class`, `interface`, `function`, `method`, `enum`, `type_alias` |
| `code_symbol_visibility` | `public`, `protected`, `private` |
| `code_dependency_kind` | `import`, `export`, `extends`, `implements` |
| `indexing_error_phase` | `discovery`, `materialization`, `hashing`, `parsing`, `persistence`, `finalization` |

`succeeded` intentionally means that all required metadata for the target
commit was committed. It is more precise than a generic `completed` state.

## Index catalog

| Table/index fields | Purpose |
|---|---|
| Jobs: organization, repository, created | Repository job history |
| Jobs: organization, status, created | Tenant operations queries |
| Jobs: branch | Branch history |
| Jobs: requester | Audit lookup |
| Files: organization, repository, status | Tenant repository inventory |
| Files: branch, status | Active/deleted branch inventory |
| Files: last-seen job | Job reconciliation |
| Hashes: organization, algorithm, value | Tenant-scoped content reuse |
| Hashes: Git blob ID | Incremental candidate lookup |
| Symbols: file hash, kind, qualified name, offset | Idempotent parser identity |
| Symbols: organization, repository, kind | Tenant repository kind lookup |
| Symbols: organization, repository, name | Tenant repository name lookup |
| Symbols: branch, indexed file, file hash | Scoped graph and version traversal |
| Symbols: observed job | Job reconciliation/audit lookup |
| Dependencies: source hash, identity hash | Stable retry-safe identity |
| Dependencies: organization, repository, kind | Tenant graph queries |
| Dependencies: source file/hash/symbol | Outgoing graph traversal |
| Dependencies: target file/hash/symbol | Incoming graph traversal |
| Dependencies: observed job | Job reconciliation/audit lookup |
| Errors: organization, job, created | Ordered job diagnostics |
| Errors: file | File diagnostics |

## Foreign-key deletion rules

| Parent | Child | Behavior |
|---|---|---|
| Organization | All indexing tables | `RESTRICT` |
| Repository | Jobs and files | `CASCADE` |
| Branch | Jobs and files | `CASCADE` |
| User | Requested job | `SET NULL` |
| Job | Last-seen file / observed hash | `SET NULL` |
| Job | Indexing error | `CASCADE` |
| Indexed file | Hash versions | `CASCADE` |
| File hash | Indexed-file current pointer | `SET NULL` |
| Repository / branch / indexed file / file hash | Code symbol | `CASCADE` |
| Job | Observed symbol | `SET NULL` |
| Repository / branch / source file / source hash | Code dependency | `CASCADE` |
| Source/target symbol, target file/hash, observed job | Code dependency reference | `SET NULL` |
| Indexed file | Error reference | `SET NULL` |

Branch synchronization marks missing remote branches as `deleted`; it does
not normally delete branch rows. Repository deletion removes its operational
indexing data as one aggregate.

## Incremental decision model

ADR-012 defines a hybrid strategy:

```text
same target commit + incremental mode -> no-op success
same path + same Git blob ID          -> reuse content version
new blob + known SHA-256              -> reuse parser artifact when valid
new SHA-256                            -> parse new content version
missing previous path                  -> mark indexed file deleted
```

Git object IDs avoid reading most unchanged blobs. SHA-256 remains the durable
cross-Git-format content identity and is computed while bounded content is
read.

## Transaction boundaries

The API creates a queued job with one short database write after tenant and
branch validation. No clone, fetch, filesystem, parser, or AI work occurs in
that request transaction.

Future workers will:

1. Claim a job in a short atomic transaction.
2. Scan/hash/parse outside a transaction.
3. Commit inventory and content versions in bounded idempotent batches.
4. Mark deleted paths only after the scan result is durable.
5. Set `succeeded` only after every required batch commits.

Long-running processing must never hold a database connection or row lock.

## Migrations

The indexing schema is introduced through additive migrations:

```text
1785610000000-AddIndexJobs.ts
1785620000000-CompleteIndexingFoundation.ts
1785630000000-AddCurrentFileHash.ts
1785640000000-AddCodeSymbols.ts
1785650000000-AddCodeDependencies.ts
```

The split is intentional: the durable job/API slice landed first, the ADR
expanded Phase 3.1 to the complete inventory, hash, error, and mode model,
incremental processing added the explicit current-content pointer, Milestone
3.7 added immutable version-scoped symbol metadata, and Milestone 3.8 added
retry-safe directed dependency relationships.

Commands:

```bash
yarn migration:show
yarn migration:run
yarn migration:revert
yarn typeorm schema:log -d src/database/data-source.ts
```

After all migrations are applied, `schema:log` must generate no SQL.
