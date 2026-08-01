import { DataSource } from 'typeorm';

interface TableRow {
  tableName: string;
}

/**
 * Clears application data while preserving the migration history. The caller
 * must use a database whose name ends with `_test`; this invariant is checked
 * again here because TRUNCATE is intentionally destructive.
 */
export async function resetE2eDatabase(dataSource: DataSource): Promise<void> {
  const databaseRows = await dataSource.query<Array<{ databaseName: string }>>(
    'SELECT current_database() AS "databaseName"',
  );
  const databaseName = databaseRows[0]?.databaseName;

  if (process.env.NODE_ENV !== 'test' || !databaseName?.endsWith('_test')) {
    throw new Error(
      `Refusing to reset database "${databaseName ?? 'unknown'}" outside the E2E environment.`,
    );
  }

  const tables = await dataSource.query<TableRow[]>(
    `SELECT tablename AS "tableName"
     FROM pg_tables
     WHERE schemaname = 'public'
       AND tablename <> 'migrations'
     ORDER BY tablename`,
  );

  if (tables.length === 0) {
    return;
  }

  const tableNames = tables
    .map(({ tableName }) => `"${tableName.replaceAll('"', '""')}"`)
    .join(', ');

  await dataSource.query(
    `TRUNCATE TABLE ${tableNames} RESTART IDENTITY CASCADE`,
  );
}
