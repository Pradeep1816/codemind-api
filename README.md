# CodeMind

CodeMind is an AI-powered code intelligence platform for understanding,
maintaining, and evolving complex software systems.

It is designed to transform source code, repository metadata, database
structures, APIs, configuration, and documentation into persistent,
searchable knowledge for developers and AI coding agents.

## Vision

> AI should not repeatedly read code. AI should understand the system.

CodeMind will provide an intelligence layer between software repositories and
tools such as Codex, Cursor, Claude, IDEs, and custom AI agents.

```text
Repository
    |
    v
Indexing and parsing
    |
    v
Analysis and knowledge model
    |
    v
Search and optimized AI context
    |
    v
MCP and developer tools
```

## Current Status

CodeMind is in the backend-foundation milestone.

Implemented:

- Modular NestJS backend structure
- Validated and namespaced environment configuration
- PostgreSQL connection through TypeORM
- TypeORM CLI and migration workflow
- Initial organization and RBAC database schema
- Database-aware `GET /health` endpoint
- URI API versioning under `/api/v1`
- Global request validation
- Helmet security headers
- Configurable CORS
- Graceful application shutdown

Not implemented yet:

- Registration, login, and JWT authentication
- User and organization APIs
- Repository connection and Git integration
- Indexing, parsing, and static analysis
- Knowledge generation and search
- AI provider integration
- MCP server

## Technology

| Area             | Technology                            |
| ---------------- | ------------------------------------- |
| Runtime          | Node.js and TypeScript                |
| Backend          | NestJS                                |
| Database         | PostgreSQL                            |
| ORM              | TypeORM                               |
| Validation       | class-validator and class-transformer |
| Security headers | Helmet                                |
| Testing          | Jest                                  |

## Prerequisites

- Node.js 20 or newer
- Yarn Classic
- PostgreSQL
- A PostgreSQL role allowed to access the CodeMind database

## Quick Start

### 1. Install dependencies

```bash
yarn install
```

### 2. Create the database

Create a PostgreSQL database named `codemind` using pgAdmin or your preferred
PostgreSQL client.

### 3. Configure the environment

```bash
cp .env.example .env
```

Update `.env` with your local PostgreSQL credentials and replace
`JWT_SECRET` with a secure value containing at least 32 characters.

Minimum database configuration:

```env
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_USER=postgres
DATABASE_PASSWORD=your_postgres_password
DATABASE_NAME=codemind
DATABASE_SSL=false
```

See [src/config/README.md](src/config/README.md) for all configuration values,
defaults, validation rules, and usage examples.

### 4. Run migrations

```bash
yarn migration:run
```

### 5. Start development mode

```bash
yarn start:dev
```

The versioned API base URL is:

```text
http://localhost:3000/api/v1
```

## Health Check

The health endpoint is intentionally unversioned so infrastructure can call it
directly:

```bash
curl http://localhost:3000/health
```

Healthy response:

```json
{
  "status": "ok",
  "timestamp": "2026-07-29T10:28:08.986Z",
  "uptime": 104,
  "checks": {
    "database": {
      "status": "up"
    }
  }
}
```

The endpoint executes a lightweight PostgreSQL query. It returns HTTP `200`
when the database is available and HTTP `503` if an established database
connection becomes unavailable.

## Identity and Access Schema

The first migration creates six application entities:

```text
Organization
   |       |
   v       v
 User    Role
   |       |
   +-> UserRole
           |
           v
    RolePermission
           |
           v
      Permission
```

| Entity           | Responsibility                                      |
| ---------------- | --------------------------------------------------- |
| `Organization`   | Tenant boundary, plan, and status                   |
| `User`           | Organization user identity and authentication state |
| `Role`           | Organization-scoped access role                     |
| `Permission`     | Global resource/action capability                   |
| `UserRole`       | Explicit user-to-role assignment                    |
| `RolePermission` | Explicit role-to-permission assignment              |

Database changes must use migrations. TypeORM schema synchronization is
disabled.

## Migration Workflow

Create an empty migration:

```bash
yarn migration:create src/database/migrations/AddFeature
```

Generate a migration from entity changes:

```bash
yarn migration:generate src/database/migrations/AddFeature
```

Review the generated SQL before applying it.

```bash
yarn migration:show
yarn migration:run
yarn migration:revert
```

`migration:revert` changes the database and may remove data introduced after
the reverted migration. Use it carefully.

## Project Structure

```text
src/
├── app.module.ts
├── main.ts
├── common/
│   ├── decorators/
│   ├── filters/
│   ├── guards/
│   ├── interceptors/
│   ├── middleware/
│   ├── pipes/
│   └── utils/
├── config/
├── database/
│   ├── data-source.ts
│   ├── database.module.ts
│   ├── entities/
│   └── migrations/
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
    ├── mcp/
    └── health/
```

Feature modules own their business rules. Shared technical concerns belong in
`common`, application settings belong in `config`, and persistence
infrastructure belongs in `database`.

See
[docs/01-architecture/backend-structure.md](docs/01-architecture/backend-structure.md)
for module boundaries, dependency rules, naming conventions, and the
development workflow.

## Available Commands

| Command                   | Purpose                                  |
| ------------------------- | ---------------------------------------- |
| `yarn start`              | Start the application                    |
| `yarn start:dev`          | Start in watch mode                      |
| `yarn start:debug`        | Start in debug/watch mode                |
| `yarn build`              | Build the production output              |
| `yarn start:prod`         | Run the compiled application             |
| `yarn lint`               | Lint and fix TypeScript files            |
| `yarn format`             | Format TypeScript files                  |
| `yarn test`               | Run unit tests                           |
| `yarn test:watch`         | Run unit tests in watch mode             |
| `yarn test:cov`           | Generate test coverage                   |
| `yarn test:e2e`           | Run end-to-end tests                     |
| `yarn migration:create`   | Create an empty migration                |
| `yarn migration:generate` | Generate a migration from entity changes |
| `yarn migration:show`     | Show applied and pending migrations      |
| `yarn migration:run`      | Apply pending migrations                 |
| `yarn migration:revert`   | Revert the latest migration              |

## Development Checks

Before submitting a change:

```bash
yarn build
yarn lint
yarn test
```

When entities change:

```bash
yarn migration:generate src/database/migrations/DescribeTheChange
yarn migration:run
```

Never enable automatic schema synchronization in production.

## Documentation

- [Vision](docs/00-overview/vision.md)
- [Problem statement](docs/00-overview/problem-statement.md)
- [System overview](docs/01-architecture/system-overview.md)
- [Backend structure](docs/01-architecture/backend-structure.md)
- [Database architecture](docs/03-database/database-architecture.md)
- [API overview](docs/04-api/api-overview.md)
- [Roadmap](docs/05-roadmap/roadmap.md)
- [Milestones](docs/05-roadmap/milestones.md)
- [Architecture decisions](docs/06-adrs/README.md)

## Security

- Never commit `.env` or real credentials.
- Use a secret manager in production.
- Enable PostgreSQL SSL for remote production databases.
- Restrict CORS to trusted origins.
- Apply and review migrations before deploying application code.
- Validate organization ownership when assigning a role to a user.

## License

CodeMind is private and currently unlicensed for external distribution.
