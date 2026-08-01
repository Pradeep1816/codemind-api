import { Reflector } from '@nestjs/core';
import { REQUIRED_PERMISSIONS_KEY } from '../../common/decorators/require-permissions.decorator';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { RepositoryBranchesController } from './repository-branches.controller';
import { RepositoryBranchesService } from './repository-branches.service';

describe('RepositoryBranchesController', () => {
  const currentUser = {
    id: 'actor-user-id',
    organization: {
      id: 'organization-id',
    },
  } as AuthenticatedUser;

  it('derives branch tenant data from authentication', async () => {
    const list = jest.fn().mockResolvedValue({});
    const synchronize = jest.fn().mockResolvedValue({});
    const controller = new RepositoryBranchesController({
      list,
      synchronize,
    } as unknown as RepositoryBranchesService);

    await controller.list(currentUser, 101);
    await controller.synchronize(currentUser, 101);

    expect(list).toHaveBeenCalledWith(currentUser.organization.id, 101);
    expect(synchronize).toHaveBeenCalledWith(currentUser.organization.id, 101);
  });

  it('requires indexing permission only for synchronization', () => {
    const reflector = new Reflector();
    const classPermissions = reflector.get<string[]>(
      REQUIRED_PERMISSIONS_KEY,
      RepositoryBranchesController,
    );
    const synchronizePermissions = reflector.get<string[]>(
      REQUIRED_PERMISSIONS_KEY,
      // The original method reference is the metadata target.
      // eslint-disable-next-line @typescript-eslint/unbound-method
      RepositoryBranchesController.prototype.synchronize,
    );

    expect(classPermissions).toEqual(['repository.read']);
    expect(synchronizePermissions).toEqual([
      'repository.read',
      'repository.index',
    ]);
  });
});
