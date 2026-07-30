import { DataSource } from 'typeorm';
import { PERMISSION_DEFINITIONS, seedPermissions } from './permissions.seed';
import {
  OrganizationRoleSeedResult,
  seedRolesForExistingOrganizations,
} from './roles.seed';

export interface DatabaseSeedResult extends OrganizationRoleSeedResult {
  permissionCount: number;
}

export async function runDatabaseSeeds(
  dataSource: DataSource,
): Promise<DatabaseSeedResult> {
  if (!dataSource.isInitialized) {
    throw new Error('Data source must be initialized before running seeds');
  }

  return dataSource.transaction(async (manager) => {
    const permissions = await seedPermissions(manager);
    const roleResult = await seedRolesForExistingOrganizations(
      manager,
      permissions,
    );

    return {
      permissionCount: PERMISSION_DEFINITIONS.length,
      ...roleResult,
    };
  });
}
