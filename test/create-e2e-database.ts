import './setup-env';
import { DataSource } from 'typeorm';

async function createE2eDatabase(): Promise<void> {
  const databaseName = process.env.DATABASE_NAME;

  if (!databaseName?.endsWith('_test')) {
    throw new Error(
      `Refusing to create unsafe E2E database "${databaseName ?? 'unknown'}". The name must end with _test.`,
    );
  }

  const dataSource = new DataSource({
    type: 'postgres',
    host: process.env.DATABASE_HOST,
    port: Number.parseInt(process.env.DATABASE_PORT ?? '5432', 10),
    username: process.env.DATABASE_USER,
    password: process.env.DATABASE_PASSWORD,
    database: 'postgres',
    ssl: process.env.DATABASE_SSL === 'true',
  });

  try {
    await dataSource.initialize();

    const existing = await dataSource.query<Array<{ exists: boolean }>>(
      'SELECT EXISTS(SELECT 1 FROM pg_database WHERE datname = $1) AS "exists"',
      [databaseName],
    );

    if (existing[0]?.exists) {
      console.log(`E2E database ${databaseName} already exists.`);
      return;
    }

    const quotedDatabaseName = `"${databaseName.replaceAll('"', '""')}"`;

    await dataSource.query(`CREATE DATABASE ${quotedDatabaseName}`);
    console.log(`Created E2E database ${databaseName}.`);
  } finally {
    if (dataSource.isInitialized) {
      await dataSource.destroy();
    }
  }
}

void createE2eDatabase().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);

  console.error('Failed to create E2E database:', message);
  process.exitCode = 1;
});
