# Backend Structure

## Document Information

Status: Draft  
Version: 1.0  
Category: Architecture  
Owner: CodeMind Engineering Team

## 1. Purpose

This document defines the structure and development rules for the CodeMind
NestJS backend.

Its goals are to:

- Keep feature ownership clear.
- Prevent tight coupling between modules.
- Make the codebase easy to navigate.
- Provide consistent naming and file organization.
- Allow features to grow without turning the application into a monolith.

## 2. NestJS Architecture

The backend follows a modular NestJS architecture. Each business capability is
implemented as a feature module and exposes only the providers required by
other modules.

The application is organized into four main areas:

| Area | Responsibility |
|---|---|
| `app.module.ts` | Composes the application and imports top-level modules |
| `common/` | Reusable technical utilities with no business ownership |
| `config/` and `database/` | Application infrastructure and persistence setup |
| `modules/` | Business capabilities and product features |

The request flow is:

```text
Request
  |
  v
Controller
  |
  v
Application Service
  |
  v
Domain/Persistence Provider
  |
  v
Response
```

Controllers handle transport concerns. Services coordinate use cases.
Repositories and adapters communicate with databases or external systems.

## 3. Top-Level Folder Convention

```text
src/
├── app.module.ts
├── main.ts
│
├── common/
│   ├── decorators/
│   ├── filters/
│   ├── guards/
│   ├── interceptors/
│   ├── middleware/
│   ├── pipes/
│   └── utils/
│
├── config/
├── database/
│
└── modules/
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
    └── mcp/
```

### 3.1 `common/`

`common/` contains framework-level building blocks that can be used across the
application.

Code belongs in `common/` only when it:

- Has no business-domain ownership.
- Is useful to more than one feature module.
- Does not depend on a feature module.

Business logic must not be placed in `common/`.

### 3.2 `config/`

`config/` owns:

- Environment variable loading.
- Typed configuration definitions.
- Configuration validation.
- Application-wide infrastructure settings.

Feature-specific configuration should remain inside the owning module unless
it is required during application bootstrap.

### 3.3 `database/`

`database/` owns shared persistence infrastructure:

- Database connection setup.
- Migration configuration.
- Transaction support.
- Base persistence helpers.

Feature entities, repository interfaces, and queries remain inside their
owning feature modules.

### 3.4 `modules/`

Each directory under `modules/` represents one business or platform
capability. A module owns its controllers, services, data model, persistence,
events, and tests.

## 4. Feature Module Structure

A module starts small and adds directories only when they are needed.

```text
modules/repositories/
├── repositories.module.ts
├── repositories.controller.ts
├── repositories.service.ts
├── dto/
│   ├── create-repository.dto.ts
│   └── repository-response.dto.ts
├── entities/
│   └── repository.entity.ts
├── repositories/
│   ├── repository.repository.ts
│   └── typeorm-repository.repository.ts
├── events/
├── adapters/
└── tests/
```

Not every module must contain every directory. Empty architectural layers
should not be created in advance.

### Responsibilities

| Component | Responsibility |
|---|---|
| Module | Declares providers, controllers, imports, and public exports |
| Controller | HTTP or protocol handling and input validation |
| Service | Application use cases and business coordination |
| DTO | Transport input and output contracts |
| Entity | Persisted feature state |
| Repository | Persistence abstraction and implementation |
| Adapter | Integration with Git, AI, storage, or another external system |
| Event | Cross-module notification contract |

## 5. Module Boundaries

The current feature modules own the following capabilities:

| Module | Ownership |
|---|---|
| `auth` | Authentication, tokens, sessions, and authorization entry points |
| `users` | User profiles and user lifecycle |
| `organizations` | Tenancy, role definitions, and organization boundaries |
| `repositories` | Repository registration, Git metadata, branches, and status |
| `indexing` | File discovery, change detection, and indexing jobs |
| `parser` | Language parsing, AST processing, and symbol extraction |
| `analysis` | Dependencies, call graphs, data flow, and static analysis |
| `knowledge` | Knowledge entities, relationships, rules, and workflows |
| `search` | Keyword, semantic, symbol, and relationship search |
| `ai` | Model access, context assembly, prompts, and AI responses |
| `documentation` | Generated technical and business documentation |
| `mcp` | MCP tools, resources, prompts, and protocol transport |

A module is the sole owner of its data and business rules. Other modules must
use its exported service, facade, contract, or event instead of accessing its
internal providers directly.

## 6. Dependency Rules

### 6.1 Allowed Dependencies

Dependencies point from orchestration layers toward the capability they use.
The intended processing direction is:

```text
repositories
     |
     v
 indexing ---> parser ---> analysis ---> knowledge ---> search
                                               |           |
                                               v           v
                                        documentation     ai
                                               \           /
                                                v         v
                                                    mcp
```

This diagram describes capability flow, not permission for unrestricted
imports. Prefer events for long-running pipeline transitions.

### 6.2 Mandatory Rules

1. `common/`, `config/`, and `database/` must never import feature modules.
2. A feature module may import another module only through its exported public
   providers.
3. Controllers must not access database clients or repositories directly.
4. A module must not import another module's internal file by path.
5. Cross-module database queries are not allowed. Call the owning module or
   consume its event.
6. Circular module dependencies are not allowed. `forwardRef()` is not an
   architectural solution and requires an explicit architecture review.
7. Long-running indexing and analysis operations must use jobs or events
   instead of blocking HTTP requests.
8. External SDKs must be wrapped by an adapter owned by the relevant module.
9. MCP is a transport layer. It must call application services and must not
   duplicate business logic.
10. AI output must not become trusted domain state without validation and
    evidence.
11. Services must not call TypeORM entity repositories directly. Entity reads
    and writes belong in a repository provider owned by the feature module.
12. Application services may define a transaction boundary for a use case, but
    every query inside that transaction must still go through a repository.
13. Repository providers are internal implementation details and must not be
    exported when the module's service can expose the required capability.
14. Tenant scope must come from the authenticated identity, never from a
    client-supplied organization ID.
15. Invitation tokens must be persisted only as hashes and consumed once
    inside a transaction.
16. Role and user-status mutations must preserve at least one active
    organization `OWNER`.

### 6.3 Public Module API

A module exports the smallest practical interface:

```typescript
@Module({
  providers: [RepositoriesService],
  exports: [RepositoriesService],
})
export class RepositoriesModule {}
```

Internal repositories, adapters, and helper services should not be exported
unless another module has a justified use case.

## 7. Naming Conventions

### Files and Directories

- Use `kebab-case` for file and directory names.
- Use a NestJS role suffix for framework components.
- Use singular names for one entity and plural names for feature modules.

Examples:

```text
repositories.module.ts
repositories.controller.ts
repositories.service.ts
create-repository.dto.ts
repository.entity.ts
repository.repository.ts
github.adapter.ts
index-completed.event.ts
```

### TypeScript Symbols

- Classes, enums, and types use `PascalCase`.
- Variables, functions, and methods use `camelCase`.
- Constants use `UPPER_SNAKE_CASE`.
- Boolean names begin with `is`, `has`, `can`, or `should`.
- Interfaces describe a capability and should not use an `I` prefix.

Examples:

```typescript
class RepositoriesService {}
interface RepositoryStore {}
enum RepositoryStatus {}
const DEFAULT_PAGE_SIZE = 25;
const isIndexingComplete = true;
```

### NestJS Classes

| Type | Pattern |
|---|---|
| Module | `RepositoriesModule` |
| Controller | `RepositoriesController` |
| Service | `RepositoriesService` |
| Guard | `OrganizationAccessGuard` |
| Interceptor | `RequestLoggingInterceptor` |
| Filter | `HttpExceptionFilter` |
| DTO | `CreateRepositoryDto` |
| Entity | `RepositoryEntity` |

## 8. Application Bootstrap

`main.ts` is responsible only for global application setup:

- Creating the NestJS application.
- Applying global validation, filters, interceptors, and middleware.
- Configuring API prefixes and versioning.
- Starting the server.

`app.module.ts` is the composition root. It imports infrastructure and feature
modules but should not contain business logic.

## 9. Development Workflow

When adding a feature:

1. Identify the module that owns the capability.
2. Define the input, output, and module boundary.
3. Add or update the application service.
4. Implement persistence or external adapters behind an abstraction.
5. Add the controller, job handler, event handler, or MCP transport.
6. Export only the providers required by another module.
7. Add unit tests for business behavior.
8. Add integration or end-to-end tests for important boundaries.
9. Run formatting, linting, tests, and the production build.
10. Update architecture or API documentation when a contract changes.

Recommended validation:

```bash
yarn format
yarn lint
yarn test
yarn test:e2e
yarn build
```

## 10. Change Guidelines

- Start with the smallest structure that supports the feature.
- Keep pull requests focused on one capability.
- Avoid creating generic shared abstractions before there are multiple real
  consumers.
- Record significant architecture changes as an ADR.
- Update this document when module ownership or dependency direction changes.
