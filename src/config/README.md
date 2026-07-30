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
| `CORS_ORIGINS`     |       No | —             | Comma-separated allowed browser origins           |
| `CORS_CREDENTIALS` |       No | `false`       | Allows browser credentials for configured origins |

The `app` namespace exposes:

```typescript
{
  name: string;
  host: string;
  port: number;
  environment: string;
  apiPrefix: string;
  apiVersion: string;
  corsOrigins: string[];
  corsCredentials: boolean;
}
```

CORS remains disabled when `CORS_ORIGINS` is empty. List explicit trusted
origins in production; do not use a wildcard for authenticated APIs.

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

| Variable         | Required | Default | Description                                  |
| ---------------- | -------: | ------- | -------------------------------------------- |
| `JWT_SECRET`     |      Yes | —       | Signing secret with at least 32 characters   |
| `JWT_EXPIRES_IN` |       No | `15m`   | Access-token lifetime, such as `15m` or `1h` |

The `jwt` namespace exposes:

```typescript
{
  secret: string | undefined;
  expiresIn: string;
}
```

Use a secret manager or deployment platform secret in production. Never place
a real JWT secret in source control.

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
- `DATABASE_SSL` is not `true` or `false`.
- `JWT_SECRET` contains fewer than 32 characters.
- `JWT_EXPIRES_IN` is not a positive duration with a unit.
- `INVITATION_TTL_HOURS` is outside the allowed 1–720 hour range.

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
