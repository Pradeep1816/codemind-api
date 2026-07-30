import { Reflector } from '@nestjs/core';
import { REQUIRED_PERMISSIONS_KEY } from '../../common/decorators/require-permissions.decorator';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { AddRepositoryMemberDto } from './dto/add-repository-member.dto';
import { RepositoryMembersController } from './repository-members.controller';
import { RepositoryMembersService } from './repository-members.service';

describe('RepositoryMembersController', () => {
  const currentUser = {
    id: 'actor-user-id',
    organization: {
      id: 'organization-id',
    },
  } as AuthenticatedUser;
  const memberUserId = '25d8bd53-047b-42d8-9efa-4ecedfe422d3';

  it('derives membership tenant and actor data from authentication', async () => {
    const input: AddRepositoryMemberDto = { userId: memberUserId };
    const add = jest.fn().mockResolvedValue({});
    const list = jest.fn().mockResolvedValue([]);
    const remove = jest.fn().mockResolvedValue(undefined);
    const controller = new RepositoryMembersController({
      add,
      list,
      remove,
    } as unknown as RepositoryMembersService);

    await controller.add(currentUser, 101, input);
    await controller.list(currentUser, 101);
    await controller.remove(currentUser, 101, memberUserId);

    expect(add).toHaveBeenCalledWith(
      currentUser.organization.id,
      currentUser.id,
      101,
      input,
    );
    expect(list).toHaveBeenCalledWith(currentUser.organization.id, 101);
    expect(remove).toHaveBeenCalledWith(
      currentUser.organization.id,
      101,
      memberUserId,
    );
  });

  it('requires management permission for membership mutations', () => {
    const reflector = new Reflector();
    const classPermissions = reflector.get<string[]>(
      REQUIRED_PERMISSIONS_KEY,
      RepositoryMembersController,
    );
    const addPermissions = reflector.get<string[]>(
      REQUIRED_PERMISSIONS_KEY,
      // The original method reference is the metadata target.
      // eslint-disable-next-line @typescript-eslint/unbound-method
      RepositoryMembersController.prototype.add,
    );
    const removePermissions = reflector.get<string[]>(
      REQUIRED_PERMISSIONS_KEY,
      // The original method reference is the metadata target.
      // eslint-disable-next-line @typescript-eslint/unbound-method
      RepositoryMembersController.prototype.remove,
    );

    expect(classPermissions).toEqual(['repository.read']);
    expect(addPermissions).toEqual([
      'repository.read',
      'repository.member.manage',
    ]);
    expect(removePermissions).toEqual([
      'repository.read',
      'repository.member.manage',
    ]);
  });
});
