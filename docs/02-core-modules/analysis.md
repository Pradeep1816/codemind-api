# Analysis Module

## Document information

Status: Milestone 4.6 state extraction in progress
Version: 2.4
Owner: CodeMind Engineering
Architecture decision:
[ADR-014](../06-adrs/014-knowledge-analysis-architecture.md)

## Purpose

The analysis module converts Phase 3 structural metadata and bounded immutable
source into normalized technical facts. It bridges syntax-level understanding
and the knowledge graph.

Phase 3 answers:

> Which files, symbols, imports, exports, and inheritance relationships exist?

Analysis answers:

> How do those symbols interact, what architectural roles do they play, and
> which source behaviors may support higher-level knowledge?

## Position in the pipeline

```mermaid
flowchart LR
    Index[(Phase 3 snapshot)] --> Reader[Code intelligence read port]
    Git[Immutable source blobs] --> Source[Bounded source port]
    Reader --> Analysis[AnalysisService]
    Source --> Analysis
    Analysis --> Technical[Technical facts]
    Technical --> Business[Business analyzer family]
    Technical --> Knowledge[Knowledge publication]
    Business --> Knowledge
```

The analysis module produces facts. It does not publish snapshots or expose
public knowledge APIs.

## Inputs

An analysis run targets one successful Phase 3 index job and receives:

- Organization, repository, branch, and target commit identity
- Active indexed files and immutable current file hashes
- Code symbols and source ranges
- Import, export, `extends`, and `implements` dependencies
- Bounded source text only when an analyzer needs body-level syntax
- Analyzer bundle version and semantic configuration digest

Input access uses the exported Phase 3 read/source ports. Analysis services do
not import indexing TypeORM repositories or query Phase 3 tables directly.

## Outputs

Analyzers emit normalized facts in bounded batches. Implemented fact families
include:

- Call sites and repository-wide resolved, unresolved, or ambiguous results
- Framework decorators and route metadata
- Constructor injection and provider relationships
- Module, controller, service, repository, entity, provider, and configuration
  classifications
- Evidence-backed domain concepts from supported declarations
- Validation, permission, calculation, state-constraint, eligibility, and
  scheduling rule candidates

Facts contain stable identity, source evidence, analyzer identity, derivation
type, confidence, and bounded typed properties. They contain no compiler AST
nodes, TypeORM entities, raw source bodies, or generated prose.

## Module boundary

The analysis module owns:

- Analyzer interfaces and registration
- Consumption of the Phase 3 snapshot and immutable-source contracts
- Language/framework-specific analyzers
- Fact normalization and stable identity generation
- Analyzer diagnostics and resource limits
- Technical architecture classification
- The logical business-analyzer family

It does not own:

- Knowledge build lifecycle or graph persistence
- Current-snapshot publication
- Public knowledge APIs
- Search ranking or embeddings
- AI provider calls
- Documentation generation
- Repository synchronization or indexing lifecycle

Dependency direction:

```text
Analysis -> Phase 3 read/source ports
Analysis -X-> Knowledge persistence, Search, AI, MCP
Knowledge orchestrator -> Analysis contracts
```

## Analyzer contract

Milestone 4.2 implements this file-level analyzer contract:

```typescript
interface CodeAnalyzer {
  readonly name: string;
  readonly version: string;

  supports(context: AnalysisFileSupportContext): boolean;

  analyze(
    context: AnalysisFileContext,
  ):
    | Iterable<AnalysisFact | AnalysisDiagnostic>
    | AsyncIterable<AnalysisFact | AnalysisDiagnostic>;
}
```

Synchronous syntax analyzers and future asynchronous analyzers share the same
streaming boundary. `ArchitectureAnalysisService` provides the separate
repository-wide pass: it buffers only bounded Phase 3 metadata, consumes the
file-level fact stream, and emits architecture facts without retaining source
bodies or compiler AST nodes.

## Current implementation

Milestone 4.2 provides:

- `CODE_INTELLIGENCE_READER`, an indexing-owned port that validates tenant,
  repository, successful job, branch inventory, and current file hashes before
  streaming plain file, symbol, and dependency records in bounded batches.
- `IMMUTABLE_SOURCE_READER`, an indexing-owned port that reads the persisted Git
  blob from the exact commit, enforces the file-size limit, verifies object ID
  and byte length, and accepts only UTF-8 source.
- `AnalysisFactFactory`, which validates evidence and confidence, normalizes
  bounded properties, and creates deterministic SHA-256 content fingerprints.
- `AnalysisService`, which selects supported analyzers, enforces snapshot byte,
  per-file fact, per-file diagnostic, evidence-scope, and duplicate-identity
  limits, and streams output without retaining repository source.
- `TypeScriptTechnicalAnalyzer`, version `1.0.0`, which emits deterministic
  decorator, constructor-injection, and call-site facts for TS, TSX, JS, and
  JSX while enforcing a bounded iterative AST walk. Nest module decorators also
  expose bounded identifier-only controller, provider, import, and export
  references.
- `ArchitectureAnalysisService`, version `1.0.0`, which classifies module,
  controller, service, repository, entity, provider, and configuration
  components; resolves supported call and injection targets; and emits
  evidence-backed `contains`, `depends_on`, and `calls` relationships.
- `ArchitectureKnowledgeProjector`, owned by `KnowledgeModule`, which maps
  normalized component and relationship facts into the 4.3 node/edge/evidence
  persistence contract without introducing an Analysis-to-Knowledge dependency.
- `TypeScriptBusinessAnalyzer`, version `1.0.0`, which derives domain concepts
  from entity, type, boundary, and service declarations and derives typed rules
  from guarded outcomes plus recognized rounding calls. It records identifiers
  and operators, but not raw expressions or literal values.
- `BusinessKnowledgeProjector`, owned by `KnowledgeModule`, which merges
  repeated concept evidence, creates domain-concept and business-rule nodes,
  and projects component `represents` and `enforces` relationships.
- `TypeScriptStateAnalyzer`, version `1.0.0`, which emits declared enum states
  and explicit `status`/`state` assignments. It creates a proven source state
  only when an enclosing equality guard compares the same assignment target.
- `StateKnowledgeProjector`, owned by `KnowledgeModule`, which creates state and
  transition nodes, component `enforces` edges, and `transitions_to` edges only
  for transitions with both a proven source and target state.

The read port accepts the current file inventory associated with the requested
successful index job. It rejects a historical job after a later index has
reconciled that branch because Phase 3 does not retain immutable file-membership
rows for every historical job. Phase 4 snapshots will preserve published
knowledge history independently in Milestone 4.3.

## Analysis passes

### Pass 1: Snapshot inventory

- Load the successful index job and immutable commit identity.
- Stream active files, current hashes, symbols, and Phase 3 dependencies.
- Reject cross-tenant, stale, or incomplete snapshot data.

### Pass 2: Source facts

- Read only parser-supported immutable blobs required by enabled analyzers.
- Extract decorators, call sites, injection, conditions, assignments, and
  event/state candidates.
- Preserve exact file/hash/symbol/range evidence.

### Pass 3: Technical resolution

- Resolve calls and injection only when targets are unambiguous.
- Classify architecture roles using explicit framework and naming evidence.
- Preserve unresolved textual facts instead of guessing.

### Pass 4: Business candidates

- Convert supported guarded conditions and rounding calls into rule candidates.
- Normalize concept names from supported declarations and attach matching
  concept identities to rule properties.
- Emit confidence and derivation metadata for every inference.

The knowledge module validates, persists, and publishes the resulting fact set.

## Architecture resolution support

The initial repository-wide resolver supports:

- `this.method()` calls inside one classified class
- Calls through constructor-injected properties such as
  `this.service.execute()`
- Reliably resolved imported functions and static/imported class receivers
- Namespace-import members when Phase 3 resolved the target file
- `super.method()` when Phase 3 resolved the `extends` relationship
- Module containment from identifier-only `controllers` and `providers`
- Module dependencies from identifier-only `imports`

Computed calls, runtime provider factories, unresolved path aliases,
`forwardRef` expressions, and targets with multiple valid symbols remain
explicitly unresolved or ambiguous. Naming suffixes are heuristic; framework
decorators and Phase 3 target identities provide deterministic evidence.

## Business extraction support

The first deterministic business pass supports:

- Entity-decorated classes as direct domain concepts
- Exported classes, interfaces, enums, type aliases, DTO/model/entity boundary
  types, and controller/service/repository names as heuristic concept evidence
- Guarded `throw` and `return` outcomes as validation rules
- Permission, state, eligibility, and scheduling categories when identifiers
  provide explicit category signals
- `Math.round`, `Math.floor`, `Math.ceil`, `Math.trunc`, and `.toFixed()` as
  calculation/rounding rules
- Stable SHA-256 identities and fingerprints with exact immutable evidence
- Architecture-to-concept `represents` and architecture-to-rule `enforces`
  graph projection

The analyzer deliberately does not infer intent from arbitrary branches,
comments, import order, string literals, or name similarity alone. It does not
claim accounting, legal, scheduling, or authorization meaning beyond the
observed condition, outcome, identifiers, and containing symbol. Complex data
flow, interprocedural rule composition, workflows, and events remain Milestone
4.6 work. State extraction currently supports enum members, qualified enum
assignments, and bounded simple string assignments to fields named `status` or
`state`.

## Determinism and confidence

Derivation types have explicit meaning:

| Type              | Meaning                                                                 |
| ----------------- | ----------------------------------------------------------------------- |
| `deterministic`   | Directly represented by syntax or an unambiguous Phase 3 relationship   |
| `heuristic`       | Inferred from a documented, versioned pattern with incomplete certainty |
| `ai_assisted`     | Proposed by a future AI analyzer and always reviewable                  |
| `human_confirmed` | Explicitly approved through a future review workflow                    |

Deterministic results should be reproducible for the same commit, analyzer
bundle, and configuration digest. Heuristics must not be promoted to
deterministic facts merely because their confidence is high.

## Source safety

Repository content is untrusted data. Analyzers must never:

- Import or require repository modules
- Execute package scripts, compilers, tests, hooks, or build tools
- Load repository-defined plugins or configuration as executable code
- Follow paths outside the managed immutable Git snapshot
- Store raw source in facts, errors, logs intended for clients, or API payloads

Source reads enforce Phase 3 path, file-size, total-byte, output, and Git command
limits. New analyzers must add their own fact-count, recursion-depth, runtime,
and batch-size limits.

## Error behavior

Syntax diagnostics may produce partial technical facts when their ranges remain
valid. Operational source, analyzer, resolution, or validation failures are
reported as sanitized diagnostics to the knowledge-build lifecycle.

The build orchestrator decides whether a diagnostic is retryable or terminal.
Analyzers never update build status directly and never hide a failed source
read as an empty successful result.

## Implemented module structure

```text
src/modules/analysis/
├── analyzers/
│   ├── business/
│   │   ├── typescript-business.analyzer.ts
│   │   └── typescript-state.analyzer.ts
│   └── typescript/
│       └── typescript-technical.analyzer.ts
├── architecture/
│   └── architecture-analysis.service.ts
├── enums/
├── interfaces/
│   └── code-analyzer.interface.ts
├── types/
│   ├── analysis-context.types.ts
│   ├── analysis-fact.types.ts
│   └── analysis-diagnostic.types.ts
├── analysis-fact.factory.ts
├── analysis.service.ts
└── analysis.module.ts

src/modules/indexing/
├── ports/
│   ├── code-intelligence-reader.port.ts
│   └── immutable-source-reader.port.ts
└── readers/
    ├── code-intelligence-reader.service.ts
    └── immutable-source-reader.service.ts
```

Tests sit next to the services and analyzers they verify. Future analyzer
families are introduced only with implemented behavior.

## Milestone 4.2 acceptance criteria

Status: Complete

- A tenant-scoped read port streams one successful Phase 3 snapshot.
- An immutable-source port returns bounded content for the target commit.
- Analyzer contracts define identity, version, evidence, confidence, and
  diagnostics without ORM coupling.
- TypeScript/JavaScript call, decorator, and injection fixtures establish the
  first technical facts.
- Unsupported or ambiguous relationships remain explicit and unresolved.
- Analyzer resource limits and failure ownership are documented and tested.
- No Phase 4 database migration is created until the fact contract is stable.
