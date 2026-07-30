import 'reflect-metadata';
import dataSource from '../data-source';
import { runDatabaseSeeds } from './seed.runner';

async function seed(): Promise<void> {
  try {
    await dataSource.initialize();

    const result = await runDatabaseSeeds(dataSource);

    console.log(
      `Seed completed: ${result.permissionCount} permissions, ${result.roleCount} roles across ${result.organizationCount} organizations.`,
    );
  } finally {
    if (dataSource.isInitialized) {
      await dataSource.destroy();
    }
  }
}

void seed().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);

  console.error('Database seed failed:', message);
  process.exitCode = 1;
});
