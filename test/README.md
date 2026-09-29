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

Run only the indexing pipeline suite with:

```bash
yarn test:e2e indexing.e2e-spec.ts --runInBand
```

Run only the knowledge pipeline suite with:

```bash
yarn test:e2e knowledge.e2e-spec.ts --runInBand
```

Run the Search quality and performance suite with:

```bash
yarn test:e2e search.e2e-spec.ts --runInBand
```

The indexing suite disables autonomous worker polling and invokes each claim
explicitly. Its deterministic Git boundary supplies immutable fixture commits
while NestJS, guards, migrations, TypeORM repositories, lifecycle services,
and PostgreSQL remain real. It covers initial, unchanged, modified, deleted,
full, cancelled, recovered, and retry-exhausted jobs.

The knowledge suite also disables autonomous polling. It exercises the claimed
processor, lifecycle, persistence, publication, and query boundaries against
real PostgreSQL while replacing only graph extraction with deterministic facts.
It covers retry-idempotent batches, conflicting identities, evidence scope,
draft invisibility, tenant isolation, immutable publication, branch movement,
and a bounded 100-node/99-edge performance baseline.

The Search suite covers projection publication, retrieval quality,
authorization, tenant isolation, failed-rebuild availability, immutable
history, and atomic current-index replacement. Its reproducible performance
case projects 5,000 files into PostgreSQL, measures throughput and query
latency, and inspects analyzed full-text and exact-path query plans. Timing
limits are regression smoke gates for development and CI environments, not
production SLOs.

Both database creation and data cleanup refuse to operate unless the actual
database name ends with `_test`. E2E cleanup truncates application tables but
preserves the TypeORM `migrations` table.
