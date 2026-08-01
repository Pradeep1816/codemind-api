import { Reflector } from '@nestjs/core';
import { REQUIRED_PERMISSIONS_KEY } from '../../common/decorators/require-permissions.decorator';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { RepositoryStatusController } from './repository-status.controller';
import { RepositoryStatusService } from './repository-status.service';

describe('RepositoryStatusController', () => {
  const currentUser = {
    id: 'actor-user-id',
    organization: {
      id: 'organization-id',
    },
  } as AuthenticatedUser;

  it('derives repository health tenant data from authentication', async () => {
    const getStatus = jest.fn().mockResolvedValue({});
    const controller = new RepositoryStatusController({
      getStatus,
    } as unknown as RepositoryStatusService);

    await controller.getStatus(currentUser, 101);

    expect(getStatus).toHaveBeenCalledWith(currentUser.organization.id, 101);
  });

  it('requires repository read permission', () => {
    const reflector = new Reflector();
    const permissions = reflector.get<string[]>(
      REQUIRED_PERMISSIONS_KEY,
      RepositoryStatusController,
    );

    expect(permissions).toEqual(['repository.read']);
  });
});
