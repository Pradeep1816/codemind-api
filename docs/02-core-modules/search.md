# Search Module

## Purpose

The Search module turns published Phase 3 and Phase 4 data into a small,
rankable retrieval projection. It answers where relevant code or knowledge is
located; it does not generate AI answers and it does not replace the indexing
or knowledge sources of truth.

Status: Phase 5 in progress. Architecture, persistence, projection building,
and exact/lexical retrieval are implemented; graph expansion is next.

## Responsibilities

The module owns:

- Versioned search projections and atomic publication
- Search-document construction from files, symbols, and knowledge nodes
- Exact identifier, path, and PostgreSQL full-text retrieval
- Bounded graph-aware result expansion
- Deterministic ranking, deduplication, filtering, and score explanations
- Tenant, repository, branch, and commit scope in every result
- A stable retrieval contract for the web application, AI, and MCP modules

The module does not own:

- Git access or source parsing
- Structural symbol/dependency truth
- Knowledge extraction or knowledge-graph truth
- Repository authorization policy definitions
- AI prompts, completions, or conversation state
- Embeddings until a measured retrieval need justifies them

## Dependency direction

```mermaid
flowchart LR
    Repositories[Repository authorization]
    Indexing[Phase 3 read ports]
    Knowledge[Published knowledge read service]
    Search[Search module]
    API[Search API]
    Web[Web application]
    AI[Phase 6 AI]
    MCP[Phase 7 MCP]

    Repositories --> Search
    Indexing --> Search
    Knowledge --> Search
    Search --> API
    API --> Web
    Search --> AI
    Search --> MCP
```

Search may consume exported read services or ports. Indexing and Knowledge
must never import Search.

## Projection lifecycle

```mermaid
stateDiagram-v2
    [*] --> draft: create for published knowledge snapshot
    draft --> draft: build and validate documents
    draft --> published: atomic publish
    published --> published: mark historical/current
    published --> [*]
```

One search index targets exactly one successful index job and published
knowledge snapshot. Documents remain invisible until publication. A published
index is immutable, and only one index can be current for a branch.

If the branch advances while a projection is being built, the projection can
be published as historical but cannot replace the current branch index.

## Search document types

| Source type      | Authoritative record | Typical searchable content                          |
| ---------------- | -------------------- | --------------------------------------------------- |
| `file`           | Indexed file + hash  | Path, language, and bounded source/document text    |
| `symbol`         | Code symbol          | Name, qualified name, kind, signature, and docs     |
| `knowledge_node` | Knowledge node       | Name, summary, kind, and bounded derived properties |

Every document keeps foreign-key provenance to its source record. Business
rules and workflows are `knowledge_node` documents whose `kind` describes the
specific knowledge family.

## Initial query flow

```mermaid
sequenceDiagram
    participant Client
    participant API as Search API
    participant Auth as Repository authorization
    participant Query as Query service
    participant DB as PostgreSQL

    Client->>API: repository + branch + query + filters
    API->>Auth: verify organization and repository access
    Auth-->>API: authorized scope
    API->>Query: normalized bounded query
    Query->>DB: current published index
    Query->>DB: exact + full-text candidates
    Query->>DB: optional bounded graph neighbors
    Query-->>API: ranked results with provenance
    API-->>Client: paginated source-grounded results
```

The query service will use parameterized SQL and a fixed sort tiebreaker. It
will not accept raw `tsquery`, SQL fragments, or client-provided ranking
expressions.

## Planned module layout

```text
src/modules/search/
├── dto/                 # API validation (Milestone 5.7)
├── entities/            # search indexes and documents
├── enums/               # persisted search states and source kinds
├── projection/          # document builders (Milestone 5.3)
├── ranking/             # deterministic score fusion (Milestone 5.6)
├── repositories/        # persistence and read queries
├── services/            # build and query orchestration
├── search.controller.ts # Milestone 5.7
└── search.module.ts
```

Folders are added only with their owning milestone; empty placeholders are not
kept in source control.

## Milestones

| Milestone | Outcome                                            | Status   |
| --------: | -------------------------------------------------- | -------- |
|       5.1 | Architecture, boundaries, ranking and engine ADR   | Complete |
|       5.2 | Versioned search-index and document schema         | Complete |
|       5.3 | Projection builder and atomic publication          | Complete |
|       5.4 | Exact identifier, path, symbol, and lexical search | Complete |
|       5.5 | Bounded dependency and knowledge-graph expansion   | Next     |
|       5.6 | Ranking, deduplication, filters, and explanations  | Planned  |
|       5.7 | Tenant-scoped search APIs                          | Planned  |
|       5.8 | Web search experience                              | Planned  |
|       5.9 | Quality, security, performance tests and docs      | Planned  |

## Implemented projection behavior

Milestone 5.3 builds one deterministic projection from a published knowledge
snapshot and its successful Phase 3 index job:

- Reads current file versions through the Phase 3 code-intelligence port
- Reads bounded immutable UTF-8 blobs through the hardened source-reader port
- Normalizes camelCase, PascalCase, snake_case, paths, and punctuation into
  lexical terms without executing source code
- Produces one file document, one document per symbol, and one document per
  knowledge node
- Extracts bounded scalar terms from knowledge properties
- Enforces per-document, total-byte, total-document, and batch limits
- Serializes builds per branch with a PostgreSQL advisory lock
- Clears retryable drafts, upserts deterministic batches, and publishes in one
  transaction
- Reuses an identical published projection by indexer version and configuration
  digest
- Publishes a historical projection without selecting it as current when its
  branch or knowledge snapshot has advanced

The service is exported for the retrieval/API orchestration added by later
milestones. Search projection building is not exposed as an HTTP endpoint yet.

## Implemented lexical query behavior

Milestone 5.4 searches only the current published index for an explicitly
scoped organization, repository, and branch.

Candidate signals are:

- Exact symbol identifier
- Exact document title
- Exact repository-relative path
- Identifier and title prefix
- Path containment
- Weighted PostgreSQL full-text match

Exact identifier, title, and path matches receive the strongest deterministic
weights. Full-text rank is then added, followed by stable source-type, title,
and document-ID tiebreakers. Responses include each match signal and immutable
file/hash/symbol/knowledge-node provenance.

Queries support optional source-type, language, and kind filters plus bounded
pagination. Query text is trimmed, length checked, and normalized with the same
technical-token rules used by projection building. SQL remains parameterized;
clients cannot provide raw `tsquery`, SQL, or ranking expressions.

The query service is an internal exported boundary until the permission-guarded
HTTP endpoints are added in Milestone 5.7.
