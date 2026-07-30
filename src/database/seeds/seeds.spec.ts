import { PERMISSION_DEFINITIONS } from './permissions.seed';
import { DEFAULT_ROLE_DEFINITIONS, DefaultRoleName } from './roles.seed';

describe('database seed definitions', () => {
  it('defines unique permission names and resource-action pairs', () => {
    const names = PERMISSION_DEFINITIONS.map((permission) => permission.name);
    const resourceActions = PERMISSION_DEFINITIONS.map(
      (permission) => `${permission.resource}:${permission.action}`,
    );

    expect(new Set(names).size).toBe(names.length);
    expect(new Set(resourceActions).size).toBe(resourceActions.length);
  });

  it('maps every role entry to a defined permission', () => {
    const permissionNames = new Set(
      PERMISSION_DEFINITIONS.map((permission) => permission.name),
    );

    for (const role of DEFAULT_ROLE_DEFINITIONS) {
      for (const permission of role.permissions) {
        expect(permissionNames.has(permission)).toBe(true);
      }
    }
  });

  it('grants every permission to the owner role', () => {
    const owner = DEFAULT_ROLE_DEFINITIONS.find(
      (role) => role.name === DefaultRoleName.Owner,
    );

    expect(owner).toBeDefined();
    expect(new Set(owner?.permissions)).toEqual(
      new Set(PERMISSION_DEFINITIONS.map((permission) => permission.name)),
    );
  });
});
