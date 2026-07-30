import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { OrganizationRolesController } from './organization-roles.controller';
import { OrganizationsService } from './organizations.service';

describe('OrganizationRolesController', () => {
  it('uses only the authenticated organization when listing roles', async () => {
    const currentUser = {
      organization: { id: 'organization-id' },
    } as AuthenticatedUser;
    const roles = [
      {
        id: 'role-id',
        name: 'VIEWER',
        description: 'Read-only access',
      },
    ];
    const listRoles = jest.fn().mockResolvedValue(roles);
    const controller = new OrganizationRolesController({
      listRoles,
    } as unknown as OrganizationsService);

    await expect(controller.list(currentUser)).resolves.toBe(roles);
    expect(listRoles).toHaveBeenCalledWith(currentUser.organization.id);
  });
});
