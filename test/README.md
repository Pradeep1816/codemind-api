# End-to-end tests

The E2E suite uses a real PostgreSQL database and the same migrations, HTTP
configuration, authentication guards, validation, and services as the running
application. Git commands are replaced at the external integration boundary so
repository synchronization tests remain deterministic.

## First-time setup

The tests load PostgreSQL connection credentials from `.env`. By default, the
test database name is the normal database name with `_test` appended. You may
copy `.env.test.example` to `.env.test.local` to override the connection.

Create the isolated database once:

```bash
yarn test:e2e:db:create
```

Then run the suite:

```bash
yarn test:e2e
```

Both database creation and data cleanup refuse to operate unless the actual
database name ends with `_test`. E2E cleanup truncates application tables but
preserves the TypeORM `migrations` table.
