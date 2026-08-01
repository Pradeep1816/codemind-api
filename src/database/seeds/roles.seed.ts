import { EntityManager, In } from 'typeorm';
import { OrganizationEntity } from '../../modules/organizations/entities/organization.entity';
import { PermissionEntity } from '../../modules/organizations/entities/permission.entity';
import { RolePermissionEntity } from '../../modules/organizations/entities/role-permission.entity';
import { RoleEntity } from '../../modules/organizations/entities/role.entity';
import { PermissionName } from './permissions.seed';

export enum DefaultRoleName {
  Owner = 'OWNER',
  Admin = 'ADMIN',
  Developer = 'DEVELOPER',
  Viewer = 'VIEWER',
}

interface DefaultRoleDefinition {
  name: DefaultRoleName;
  description: string;
  permissions: readonly PermissionName[];
}

export const DEFAULT_ROLE_DEFINITIONS: readonly DefaultRoleDefinition[] = [
  {
    name: DefaultRoleName.Owner,
    description: 'Full control of the organization and all CodeMind features.',
    permissions: [
      'organization.read',
      'organization.manage',
      'user.read',
      'user.manage',
      'role.read',
      'role.manage',
      'audit.read',
      'repository.read',
      'repository.create',
      'repository.index',
      'repository.delete',
      'repository.member.manage',
      'knowledge.read',
      'knowledge.manage',
      'search.use',
      'ai.query',
      'documentation.read',
      'documentation.manage',
      'mcp.access',
    ],
  },
  {
    name: DefaultRoleName.Admin,
    description: 'Manage users, roles, repositories, and CodeMind operations.',
    permissions: [
      'organization.read',
      'user.read',
      'user.manage',
      'role.read',
      'role.manage',
      'audit.read',
      'repository.read',
      'repository.create',
      'repository.index',
      'repository.delete',
      'repository.member.manage',
      'knowledge.read',
      'knowledge.manage',
      'search.use',
      'ai.query',
      'documentation.read',
      'documentation.manage',
      'mcp.access',
    ],
  },
  {
    name: DefaultRoleName.Developer,
    description: 'Connect, index, search, and understand repositories.',
    permissions: [
      'organization.read',
      'user.read',
      'role.read',
      'repository.read',
      'repository.create',
      'repository.index',
      'knowledge.read',
      'search.use',
      'ai.query',
      'documentation.read',
      'documentation.manage',
      'mcp.access',
    ],
  },
  {
    name: DefaultRoleName.Viewer,
    description: 'Read-only access to repositories and generated knowledge.',
    permissions: [
      'organization.read',
      'repository.read',
      'knowledge.read',
      'search.use',
      'documentation.read',
    ],
  },
];

export interface OrganizationRoleSeedResult {
  organizationCount: number;
  roleCount: number;
}

export async function seedOrganizationRoles(
  manager: EntityManager,
  organizationId: string,
  permissions: ReadonlyMap<PermissionName, PermissionEntity>,
): Promise<RoleEntity[]> {
  const roleRepository = manager.getRepository(RoleEntity);
  const rolePermissionRepository = manager.getRepository(RolePermissionEntity);
  const roleNames = DEFAULT_ROLE_DEFINITIONS.map((role) => role.name);
  const existingRoles = await roleRepository.find({
    where: {
      organizationId,
      name: In(roleNames),
    },
  });
  const existingByName = new Map(
    existingRoles.map((role) => [role.name, role]),
  );
  const rolesToSave: RoleEntity[] = [];

  for (const definition of DEFAULT_ROLE_DEFINITIONS) {
    const existing = existingByName.get(definition.name);

    if (!existing) {
      rolesToSave.push(
        roleRepository.create({
          organizationId,
          name: definition.name,
          description: definition.description,
        }),
      );
      continue;
    }

    if (existing.description !== definition.description) {
      existing.description = definition.description;
      rolesToSave.push(existing);
    }
  }

  if (rolesToSave.length > 0) {
    await roleRepository.save(rolesToSave);
  }

  const synchronizedRoles = await roleRepository.find({
    where: {
      organizationId,
      name: In(roleNames),
    },
  });
  const synchronizedByName = new Map(
    synchronizedRoles.map((role) => [role.name, role]),
  );

  if (synchronizedRoles.length !== DEFAULT_ROLE_DEFINITIONS.length) {
    throw new Error(
      `Not all default roles were synchronized for organization ${organizationId}`,
    );
  }

  for (const definition of DEFAULT_ROLE_DEFINITIONS) {
    const role = synchronizedByName.get(definition.name);

    if (!role) {
      throw new Error(`Default role ${definition.name} was not found`);
    }

    const existingAssignments = await rolePermissionRepository.find({
      where: {
        roleId: role.id,
      },
    });
    const assignedPermissionIds = new Set(
      existingAssignments.map((assignment) => assignment.permissionId),
    );
    const missingAssignments = definition.permissions
      .map((permissionName) => {
        const permission = permissions.get(permissionName);

        if (!permission) {
          throw new Error(`Permission ${permissionName} was not found`);
        }

        return permission;
      })
      .filter((permission) => !assignedPermissionIds.has(permission.id))
      .map((permission) =>
        rolePermissionRepository.create({
          roleId: role.id,
          permissionId: permission.id,
        }),
      );

    if (missingAssignments.length > 0) {
      await rolePermissionRepository.save(missingAssignments);
    }
  }

  return synchronizedRoles;
}

export async function seedRolesForExistingOrganizations(
  manager: EntityManager,
  permissions: ReadonlyMap<PermissionName, PermissionEntity>,
): Promise<OrganizationRoleSeedResult> {
  const organizations = await manager.getRepository(OrganizationEntity).find();
  let roleCount = 0;

  for (const organization of organizations) {
    const roles = await seedOrganizationRoles(
      manager,
      organization.id,
      permissions,
    );
    roleCount += roles.length;
  }

  return {
    organizationCount: organizations.length,
    roleCount,
  };
}
