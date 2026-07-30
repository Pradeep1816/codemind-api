import { EntityManager, In } from 'typeorm';
import { PermissionEntity } from '../entities/permission.entity';

export const PERMISSION_DEFINITIONS = [
  {
    name: 'organization.read',
    resource: 'organization',
    action: 'read',
    description: 'View organization details.',
  },
  {
    name: 'organization.manage',
    resource: 'organization',
    action: 'manage',
    description: 'Update organization settings.',
  },
  {
    name: 'user.read',
    resource: 'user',
    action: 'read',
    description: 'View organization users.',
  },
  {
    name: 'user.manage',
    resource: 'user',
    action: 'manage',
    description: 'Invite, update, suspend, and remove users.',
  },
  {
    name: 'role.read',
    resource: 'role',
    action: 'read',
    description: 'View roles and their permissions.',
  },
  {
    name: 'role.manage',
    resource: 'role',
    action: 'manage',
    description: 'Create roles and manage role assignments.',
  },
  {
    name: 'audit.read',
    resource: 'audit',
    action: 'read',
    description: 'View organization authentication and security audit events.',
  },
  {
    name: 'repository.read',
    resource: 'repository',
    action: 'read',
    description: 'View repositories and repository metadata.',
  },
  {
    name: 'repository.create',
    resource: 'repository',
    action: 'create',
    description: 'Connect repositories to CodeMind.',
  },
  {
    name: 'repository.index',
    resource: 'repository',
    action: 'index',
    description: 'Start repository indexing operations.',
  },
  {
    name: 'repository.delete',
    resource: 'repository',
    action: 'delete',
    description: 'Remove repositories from CodeMind.',
  },
  {
    name: 'repository.member.manage',
    resource: 'repository',
    action: 'member.manage',
    description: 'Add and remove repository members.',
  },
  {
    name: 'knowledge.read',
    resource: 'knowledge',
    action: 'read',
    description: 'View extracted software knowledge.',
  },
  {
    name: 'knowledge.manage',
    resource: 'knowledge',
    action: 'manage',
    description: 'Approve, update, and remove software knowledge.',
  },
  {
    name: 'search.use',
    resource: 'search',
    action: 'use',
    description: 'Search indexed repositories and knowledge.',
  },
  {
    name: 'ai.query',
    resource: 'ai',
    action: 'query',
    description: 'Query AI using CodeMind context.',
  },
  {
    name: 'documentation.read',
    resource: 'documentation',
    action: 'read',
    description: 'View generated documentation.',
  },
  {
    name: 'documentation.manage',
    resource: 'documentation',
    action: 'manage',
    description: 'Generate, update, and publish documentation.',
  },
  {
    name: 'mcp.access',
    resource: 'mcp',
    action: 'access',
    description: 'Access CodeMind through MCP.',
  },
] as const;

export type PermissionName = (typeof PERMISSION_DEFINITIONS)[number]['name'];

export async function seedPermissions(
  manager: EntityManager,
): Promise<Map<PermissionName, PermissionEntity>> {
  const repository = manager.getRepository(PermissionEntity);
  const names = PERMISSION_DEFINITIONS.map((permission) => permission.name);
  const existingPermissions = await repository.find({
    where: {
      name: In(names),
    },
  });
  const existingByName = new Map(
    existingPermissions.map((permission) => [permission.name, permission]),
  );
  const permissionsToSave: PermissionEntity[] = [];

  for (const definition of PERMISSION_DEFINITIONS) {
    const existing = existingByName.get(definition.name);

    if (!existing) {
      permissionsToSave.push(repository.create(definition));
      continue;
    }

    if (
      existing.resource !== definition.resource ||
      existing.action !== definition.action ||
      existing.description !== definition.description
    ) {
      existing.resource = definition.resource;
      existing.action = definition.action;
      existing.description = definition.description;
      permissionsToSave.push(existing);
    }
  }

  if (permissionsToSave.length > 0) {
    await repository.save(permissionsToSave);
  }

  const synchronizedPermissions = await repository.find({
    where: {
      name: In(names),
    },
  });

  if (synchronizedPermissions.length !== PERMISSION_DEFINITIONS.length) {
    throw new Error('Not all permissions were synchronized');
  }

  return new Map(
    synchronizedPermissions.map((permission) => [
      permission.name as PermissionName,
      permission,
    ]),
  );
}
