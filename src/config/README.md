# Configuration

This directory contains CodeMind's application configuration and environment
validation.

The root `ConfigModule` loads the environment once, validates it during
application startup, and exposes namespaced configuration through NestJS.

## Files

| File                   | Responsibility                                                    | Namespace    |
| ---------------------- | ----------------------------------------------------------------- | ------------ |
| `config.module.ts`     | Loads, validates, caches, and globally exposes configuration      | —            |
| `env.validation.ts`    | Defines required variables, defaults, types, and validation rules | —            |
| `app.config.ts`        | Application identity and runtime settings                         | `app`        |
| `database.config.ts`   | PostgreSQL connection settings                                    | `database`   |
| `jwt.config.ts`        | JWT signing and expiration settings                               | `jwt`        |
| `invitation.config.ts` | User-invitation expiration settings                               | `invitation` |
| `rate-limit.config.ts` | Global and authentication endpoint request limits                 | `rateLimit`  |
| `git.config.ts`        | Git workspace, local-source, timeout, and clone settings          | `git`        |
| `indexing.config.ts`   | Indexing workspace, limits, leases, and retry policy              | `indexing`   |
| `analysis.config.ts`   | Analysis source, fact, diagnostic, and property limits            | `analysis`   |
| `knowledge.config.ts`  | Knowledge versions, batches, leases, retries, and worker policy   | `knowledge`  |
| `ai.config.ts`         | AI provider connection settings                                   | `ai`         |

## Environment Setup

Copy the root example file and replace its development placeholders:

```bash
cp .env.example .env
```

Do not commit `.env` or real credentials.

## Environment Variables

### Application

| Variable           | Required | Default       | Description                                       |
| ------------------ | -------: | ------------- | ------------------------------------------------- |
| `APP_NAME`         |       No | `codemind`    | Application name                                  |
| `APP_HOST`         |       No | `0.0.0.0`     | Network interface used by the HTTP server         |
| `APP_PORT`         |       No | `3000`        | HTTP port from 1 to 65535                         |
| `NODE_ENV`         |       No | `development` | `development`, `test`, or `production`            |
| `API_PREFIX`       |       No | `api`         | Global URL prefix without slashes                 |
| `API_VERSION`      |       No | `1`           | Default numeric URI version                       |
| `WEB_APP_URL`      |       No | —             | Trusted frontend origin allowed to call the API    |
| `CORS_CREDENTIALS` |       No | `false`       | Allows browser credentials for configured origins |
| `TRUST_PROXY`      |       No | `false`       | `false` or `loopback` for a trusted local proxy   |

The `app` namespace exposes:

```typescript
{
  name: string;
  host: string;
  port: number;
  environment: string;
  apiPrefix: string;
  apiVersion: string;
  webAppUrl: string;
  corsCredentials: boolean;
  trustProxy: 'false' | 'loopback';
}
```

CORS remains disabled when `WEB_APP_URL` is empty. Configure the exact trusted
frontend origin in production; do not use a wildcard for authenticated APIs.

`TRUST_PROXY=loopback` accepts forwarded client IP information only from a
loopback reverse proxy. Keep the default `false` when clients connect directly.
Correct proxy configuration is required for accurate IP rate limiting and
security audit metadata.

### Database

| Variable            | Required | Default | Description                    |
| ------------------- | -------: | ------- | ------------------------------ |
| `DATABASE_HOST`     |      Yes | —       | PostgreSQL hostname            |
| `DATABASE_PORT`     |       No | `5432`  | PostgreSQL port                |
| `DATABASE_USER`     |      Yes | —       | PostgreSQL user                |
| `DATABASE_PASSWORD` |      Yes | —       | PostgreSQL password            |
| `DATABASE_NAME`     |      Yes | —       | PostgreSQL database name       |
| `DATABASE_SSL`      |       No | `false` | Enables SSL when set to `true` |

The `database` namespace exposes:

```typescript
{
  type: 'postgres';
  host: string | undefined;
  port: number;
  username: string | undefined;
  password: string | undefined;
  database: string | undefined;
  ssl: boolean;
  synchronize: false;
}
```

Schema synchronization is always disabled. Database changes must be applied
through migrations.

### JWT

| Variable                 | Required | Default      | Description                                      |
| ------------------------ | -------: | ------------ | ------------------------------------------------ |
| `JWT_SECRET`             |      Yes | —            | Access-token secret with at least 32 characters  |
| `JWT_EXPIRES_IN`         |       No | `15m`        | Access-token lifetime                            |
| `JWT_REFRESH_SECRET`     |       No | `JWT_SECRET` | Refresh-token secret with at least 32 characters |
| `JWT_REFRESH_EXPIRES_IN` |       No | `30d`        | Rotating refresh-token/session lifetime          |

The `jwt` namespace exposes:

```typescript
{
  secret: string | undefined;
  expiresIn: string;
  refreshSecret: string | undefined;
  refreshExpiresIn: string;
}
```

Use a secret manager or deployment platform secret in production. Configure
different access and refresh secrets in production, and never place either
secret in source control.

### Invitations

| Variable               | Required | Default | Description                          |
| ---------------------- | -------: | ------: | ------------------------------------ |
| `INVITATION_TTL_HOURS` |       No |    `72` | Invitation lifetime from 1–720 hours |

The `invitation` namespace exposes:

```typescript
{
  ttlHours: number;
}
```

Invitation tokens use cryptographically secure random bytes. Only their
SHA-256 hashes are persisted.

### Rate Limiting

| Variable                            | Required | Default | Description                                       |
| ----------------------------------- | -------: | ------: | ------------------------------------------------- |
| `RATE_LIMIT_TTL_MS`                 |       No | `60000` | Global request window in milliseconds             |
| `RATE_LIMIT_DEFAULT_LIMIT`          |       No |   `120` | Requests per IP during the global window          |
| `AUTH_RATE_LIMIT_TTL_MS`            |       No | `60000` | Window for security-sensitive endpoints           |
| `AUTH_REGISTER_RATE_LIMIT`          |       No |     `3` | Registration attempts per IP and auth window      |
| `AUTH_LOGIN_RATE_LIMIT`             |       No |     `5` | Login attempts per IP and auth window             |
| `AUTH_REFRESH_RATE_LIMIT`           |       No |    `20` | Refresh attempts per IP and auth window           |
| `AUTH_INVITATION_ACCEPT_RATE_LIMIT` |       No |     `5` | Invitation acceptance attempts per IP and window  |
| `AUTH_INVITATION_CREATE_RATE_LIMIT` |       No |    `10` | Invitation creation attempts per IP and window    |
| `REPOSITORY_SYNC_RATE_LIMIT_TTL_MS` |       No | `60000` | Window for repository synchronization requests    |
| `REPOSITORY_SYNC_RATE_LIMIT`        |       No |     `5` | Repository synchronization requests per IP/window |

The `rateLimit` namespace exposes the global policy:

```typescript
{
  ttlMs: number;
  defaultLimit: number;
}
```

Endpoint-specific limits are applied through `@Throttle`. A rejected request
returns HTTP `429`. The default throttler storage is local to one Node.js
process; production deployments with multiple instances require a shared
storage provider.

### Git

| Variable                      | Required | Default                  | Description                                      |
| ----------------------------- | -------: | ------------------------ | ------------------------------------------------ |
| `GIT_WORKSPACE_ROOT`          |       No | `.codemind/repositories` | Root for internally managed repository clones    |
| `GIT_LOCAL_REPOSITORIES_ROOT` |       No | —                        | Allow-listed root that enables local Git sources |
| `GIT_COMMAND_TIMEOUT_MS`      |       No | `120000`                 | Git command timeout from 1–600 seconds           |
| `GIT_MAX_OUTPUT_BYTES`        |       No | `1048576`                | Maximum captured output per command              |
| `GIT_CLONE_DEPTH`             |       No | `1`                      | Shallow depth; `0` requests complete history     |

The `git` namespace exposes:

```typescript
{
  workspaceRoot: string;
  localRepositoriesRoot: string | undefined;
  commandTimeoutMs: number;
  maxOutputBytes: number;
  cloneDepth: number;
}
```

Local repositories are disabled when `GIT_LOCAL_REPOSITORIES_ROOT` is empty.
When enabled, both the configured root and requested repository are resolved
through the filesystem before the containment check, preventing symlink
escapes. Production environments should normally leave local sources
disabled.

### Indexing Workspace

| Variable                               | Required | Default              | Description                                          |
| -------------------------------------- | -------: | -------------------- | ---------------------------------------------------- |
| `INDEXING_WORKSPACE_ROOT`              |       No | `.codemind/indexing` | Root for disposable per-job processing workspaces    |
| `INDEXING_MAX_FILES`                   |       No | `100000`             | Maximum supported files selected in one scan         |
| `INDEXING_MAX_FILE_SIZE_BYTES`         |       No | `2097152`            | Maximum bytes selected for one file                  |
| `INDEXING_MAX_TOTAL_BYTES`             |       No | `536870912`          | Maximum selected source bytes in one scan            |
| `INDEXING_MAX_PATH_LENGTH`             |       No | `1024`               | Maximum repository-relative path length              |
| `INDEXING_MAX_PATH_DEPTH`              |       No | `64`                 | Maximum path segment depth                           |
| `INDEXING_MAX_SYMBOLS_PER_FILE`        |       No | `10000`              | Maximum normalized symbols persisted per file        |
| `INDEXING_MAX_DEPENDENCIES_PER_FILE`   |       No | `20000`              | Maximum normalized dependencies persisted per file   |
| `INDEXING_JOB_LEASE_MS`                |       No | `60000`              | Worker lease duration; heartbeats renew it           |
| `INDEXING_JOB_RETRY_DELAY_MS`          |       No | `30000`              | Delay before an automatic retry is claimable         |
| `INDEXING_JOB_MAX_ATTEMPTS`            |       No | `3`                  | Maximum automatic attempts for a job                 |
| `INDEXING_JOB_RECOVERY_BATCH_SIZE`     |       No | `100`                | Maximum expired leases recovered per call            |
| `INDEXING_JOB_HEARTBEAT_INTERVAL_MS`   |       No | `15000`              | Heartbeat interval; must be shorter than the lease   |
| `INDEXING_WORKER_ENABLED`              |       No | `true`               | Start PostgreSQL polling in this application process |
| `INDEXING_WORKER_ID`                   |       No | Host and process ID  | Optional stable worker identity                      |
| `INDEXING_WORKER_POLL_INTERVAL_MS`     |       No | `2000`               | Delay when no queued job is available                |
| `INDEXING_WORKER_RECOVERY_INTERVAL_MS` |       No | `30000`              | Interval between expired-lease recovery passes       |

The `indexing` namespace exposes:

```typescript
{
  workspaceRoot: string;
  maxFiles: number;
  maxFileSizeBytes: number;
  maxTotalBytes: number;
  maxPathLength: number;
  maxPathDepth: number;
  maxSymbolsPerFile: number;
  maxDependenciesPerFile: number;
  jobLeaseMs: number;
  jobRetryDelayMs: number;
  jobMaxAttempts: number;
  jobRecoveryBatchSize: number;
  jobHeartbeatIntervalMs: number;
  workerEnabled: boolean;
  workerId: string | undefined;
  workerPollIntervalMs: number;
  workerRecoveryIntervalMs: number;
}
```

The indexing root must be separate from `GIT_WORKSPACE_ROOT`. Persistent Git
objects live under the Git root; disposable job `source`, `metadata`, and
`cache` directories live under the indexing root. Workspace paths are derived
only from validated organization, repository, and job IDs.

### Analysis

| Variable                                 | Required | Default     | Description                                     |
| ---------------------------------------- | -------: | ----------- | ----------------------------------------------- |
| `ANALYSIS_MAX_TOTAL_SOURCE_BYTES`        |       No | `536870912` | Maximum immutable source bytes per snapshot     |
| `ANALYSIS_MAX_FACTS_PER_FILE`            |       No | `20000`     | Maximum facts emitted for one source file       |
| `ANALYSIS_MAX_DIAGNOSTICS_PER_FILE`      |       No | `1000`      | Maximum diagnostics emitted for one source file |
| `ANALYSIS_MAX_AST_NODES_PER_FILE`        |       No | `200000`    | Maximum compiler AST nodes visited per file     |
| `ANALYSIS_MAX_PROPERTY_BYTES`            |       No | `16384`     | Maximum serialized property bytes for one fact  |
| `ANALYSIS_MAX_ARCHITECTURE_SYMBOLS`      |       No | `250000`    | Maximum symbols in one architecture pass        |
| `ANALYSIS_MAX_ARCHITECTURE_FILES`        |       No | `100000`    | Maximum files in one architecture pass          |
| `ANALYSIS_MAX_ARCHITECTURE_DEPENDENCIES` |       No | `500000`    | Maximum dependencies in one architecture pass   |
| `ANALYSIS_MAX_ARCHITECTURE_OUTPUTS`      |       No | `500000`    | Maximum outputs from one architecture pass      |
| `ANALYSIS_MAX_WORKFLOWS`                 |       No | `10000`     | Maximum workflows in one snapshot               |
| `ANALYSIS_MAX_WORKFLOW_STEPS`            |       No | `100000`    | Maximum workflow steps in one snapshot          |
| `ANALYSIS_MAX_WORKFLOW_STEPS_PER_WORKFLOW` |     No | `1000`      | Maximum direct steps in one workflow             |

The `analysis` namespace exposes:

```typescript
{
  maxTotalSourceBytes: number;
  maxFactsPerFile: number;
  maxDiagnosticsPerFile: number;
  maxAstNodesPerFile: number;
  maxPropertyBytes: number;
  maxArchitectureSymbols: number;
  maxArchitectureFiles: number;
  maxArchitectureDependencies: number;
  maxArchitectureOutputs: number;
  maxWorkflows: number;
  maxWorkflowSteps: number;
  maxWorkflowStepsPerWorkflow: number;
}
```

These limits apply before Phase 4 persistence. Analysis reads immutable source
as untrusted data, never executes it, and discards the text after each file.

### Knowledge Processing

| Variable                                | Required | Default    | Description                                             |
| --------------------------------------- | -------: | ---------- | ------------------------------------------------------- |
| `KNOWLEDGE_ANALYZER_BUNDLE_VERSION`     |       No | `phase4-v2` | Reproducible analyzer bundle recorded on each snapshot |
| `KNOWLEDGE_PERSISTENCE_BATCH_SIZE`      |       No | `500`      | Maximum nodes or edges written per transaction         |
| `KNOWLEDGE_JOB_LEASE_MS`                |       No | `60000`    | Worker lease duration                                  |
| `KNOWLEDGE_JOB_RETRY_DELAY_MS`          |       No | `30000`    | Delay before a retry becomes claimable                 |
| `KNOWLEDGE_JOB_MAX_ATTEMPTS`            |       No | `3`        | Maximum automatic attempts                             |
| `KNOWLEDGE_JOB_RECOVERY_BATCH_SIZE`     |       No | `100`      | Maximum expired leases recovered per pass              |
| `KNOWLEDGE_JOB_HEARTBEAT_INTERVAL_MS`   |       No | `15000`    | Heartbeat interval; must be shorter than the lease     |
| `KNOWLEDGE_WORKER_ENABLED`              |       No | `true`     | Consume knowledge builds in this process               |
| `KNOWLEDGE_WORKER_ID`                   |       No | Host/PID   | Optional stable worker identity                        |
| `KNOWLEDGE_WORKER_POLL_INTERVAL_MS`     |       No | `2000`     | Delay after an empty queue poll                        |
| `KNOWLEDGE_WORKER_RECOVERY_INTERVAL_MS` |       No | `30000`    | Interval between expired-lease recovery passes         |

The `knowledge` namespace exposes:

```typescript
{
  analyzerBundleVersion: string;
  persistenceBatchSize: number;
  jobLeaseMs: number;
  jobRetryDelayMs: number;
  jobMaxAttempts: number;
  jobRecoveryBatchSize: number;
  jobHeartbeatIntervalMs: number;
  workerEnabled: boolean;
  workerId: string | undefined;
  workerPollIntervalMs: number;
  workerRecoveryIntervalMs: number;
}
```

Set `KNOWLEDGE_WORKER_ENABLED=false` on API-only processes. At least one
deployment process must keep it enabled, otherwise builds remain safely
queued. Lease recovery permits another worker to retry work after a process
crash without exposing a partial snapshot.

### AI

| Variable      | Required | Default  | Description                        |
| ------------- | -------: | -------- | ---------------------------------- |
| `AI_PROVIDER` |       No | `openai` | `openai`, `anthropic`, or `ollama` |
| `AI_MODEL`    |       No | —        | Provider-specific model identifier |
| `AI_API_KEY`  |       No | —        | Provider credential                |
| `AI_BASE_URL` |       No | —        | Optional custom or local endpoint  |

The `ai` namespace exposes:

```typescript
{
  provider: string;
  model: string | undefined;
  apiKey: string | undefined;
  baseUrl: string | undefined;
}
```

AI credentials are optional during backend-foundation development. The AI
module must verify the settings it requires before initializing a provider.

## Using Configuration

Because configuration is global, feature modules do not need to import
`@nestjs/config` repeatedly.

Use `ConfigService` for dynamic lookups:

```typescript
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class ExampleService {
  constructor(private readonly configService: ConfigService) {}

  getApplicationName(): string {
    return this.configService.getOrThrow<string>('app.name');
  }
}
```

Use the registered configuration token when a provider needs an entire
namespace:

```typescript
import { Inject, Injectable } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import databaseConfig from './database.config';

@Injectable()
export class ExampleDatabaseService {
  constructor(
    @Inject(databaseConfig.KEY)
    private readonly configuration: ConfigType<typeof databaseConfig>,
  ) {}
}
```

When using a configuration token in another module, include its configuration
factory with `ConfigModule.forFeature(...)` in that module.

## Startup Validation

`env.validation.ts` runs before the application starts.

Startup fails when:

- A required value is missing.
- A port is not a valid number from 1 to 65535.
- `NODE_ENV` or `AI_PROVIDER` contains an unsupported value.
- `API_PREFIX` or `API_VERSION` uses an unsupported format.
- `CORS_CREDENTIALS` is not `true` or `false`.
- `TRUST_PROXY` is neither `false` nor `loopback`.
- `DATABASE_SSL` is not `true` or `false`.
- `JWT_SECRET` contains fewer than 32 characters.
- `JWT_EXPIRES_IN` is not a positive duration with a unit.
- `JWT_REFRESH_SECRET`, when provided, contains fewer than 32 characters.
- `JWT_REFRESH_EXPIRES_IN` is not a positive duration with a unit.
- `INVITATION_TTL_HOURS` is outside the allowed 1–720 hour range.
- A rate-limit duration or request count is outside its documented range.
- A Git timeout, output limit, or clone depth is outside its documented range.
- An indexing file, byte, path, depth, symbol, or dependency limit is outside
  its range.

This prevents the application from running with incomplete or unsafe
configuration.

## Adding Configuration

When adding a new setting:

1. Add the environment variable to `env.validation.ts`.
2. Add it to the relevant namespaced configuration file.
3. Document it in `.env.example`.
4. Document it in this README.
5. Add a new configuration file only when the setting has separate ownership.
6. Never expose secrets through logs, API responses, or error messages.
