import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { config } from 'dotenv';

const projectRoot = resolve(__dirname, '..');
const defaultEnvironmentPath = resolve(projectRoot, '.env');
const testEnvironmentPath = resolve(projectRoot, '.env.test.local');

config({ path: defaultEnvironmentPath, quiet: true });

const defaultDatabaseName = process.env.DATABASE_NAME;
let testEnvironmentDatabaseName: string | undefined;

if (existsSync(testEnvironmentPath)) {
  const result = config({
    path: testEnvironmentPath,
    override: true,
    quiet: true,
  });

  testEnvironmentDatabaseName = result.parsed?.DATABASE_NAME;
}

const databaseName =
  process.env.E2E_DATABASE_NAME ??
  testEnvironmentDatabaseName ??
  (defaultDatabaseName
    ? defaultDatabaseName.endsWith('_test')
      ? defaultDatabaseName
      : `${defaultDatabaseName}_test`
    : undefined);

if (!databaseName) {
  throw new Error(
    'E2E database is not configured. Set E2E_DATABASE_NAME or DATABASE_NAME in .env.test.local.',
  );
}

if (!databaseName.endsWith('_test')) {
  throw new Error(
    `Unsafe E2E database name "${databaseName}". The name must end with _test.`,
  );
}

process.env.NODE_ENV = 'test';
process.env.DATABASE_NAME = databaseName;
process.env.JWT_SECRET = 'codemind-e2e-access-secret-at-least-32-characters';
process.env.JWT_REFRESH_SECRET =
  'codemind-e2e-refresh-secret-at-least-32-characters';
process.env.RATE_LIMIT_DEFAULT_LIMIT = '10000';
process.env.AUTH_REGISTER_RATE_LIMIT = '10000';
process.env.AUTH_LOGIN_RATE_LIMIT = '10000';
process.env.AUTH_REFRESH_RATE_LIMIT = '10000';
process.env.AUTH_INVITATION_ACCEPT_RATE_LIMIT = '10000';
process.env.AUTH_INVITATION_CREATE_RATE_LIMIT = '10000';
process.env.REPOSITORY_SYNC_RATE_LIMIT = '10000';
process.env.INDEXING_WORKER_ENABLED = 'false';
process.env.KNOWLEDGE_WORKER_ENABLED = 'false';
process.env.INDEXING_JOB_RETRY_DELAY_MS = '0';
