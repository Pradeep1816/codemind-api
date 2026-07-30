import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { CreateRepositoryDto } from './dto/create-repository.dto';
import { ListRepositoriesQueryDto } from './dto/list-repositories-query.dto';
import { UpdateRepositoryDto } from './dto/update-repository.dto';
import { RepositoryStatus } from './entities/repository.entity';
import { RepositoriesController } from './repositories.controller';
import { RepositoriesService } from './repositories.service';

describe('RepositoriesController', () => {
  const currentUser = {
    id: 'user-id',
    organization: {
      id: 'organization-id',
    },
  } as AuthenticatedUser;

  it('derives repository creation ownership from the authenticated user', async () => {
    const input: CreateRepositoryDto = {
      name: 'CodeMind API',
      remoteUrl: 'https://github.com/codemind/codemind-api.git',
    };
    const response = { id: 101 };
    const create = jest.fn().mockResolvedValue(response);
    const controller = new RepositoriesController({
      create,
    } as unknown as RepositoriesService);

    await expect(controller.create(currentUser, input)).resolves.toBe(response);
    expect(create).toHaveBeenCalledWith(
      currentUser.organization.id,
      currentUser.id,
      input,
    );
  });

  it('uses only the authenticated organization for reads', async () => {
    const response = { data: [] };
    const list = jest.fn().mockResolvedValue(response);
    const findOne = jest.fn().mockResolvedValue({});
    const controller = new RepositoriesController({
      list,
      findOne,
    } as unknown as RepositoriesService);
    const query = new ListRepositoriesQueryDto();

    await controller.list(currentUser, query);
    await controller.findOne(currentUser, 101);

    expect(list).toHaveBeenCalledWith(currentUser.organization.id, query);
    expect(findOne).toHaveBeenCalledWith(currentUser.organization.id, 101);
  });

  it('keeps updates and deletion inside the authenticated organization', async () => {
    const input: UpdateRepositoryDto = {
      status: RepositoryStatus.Disabled,
    };
    const update = jest.fn().mockResolvedValue({});
    const remove = jest.fn().mockResolvedValue(undefined);
    const controller = new RepositoriesController({
      update,
      remove,
    } as unknown as RepositoriesService);

    await controller.update(currentUser, 101, input);
    await controller.remove(currentUser, 101);

    expect(update).toHaveBeenCalledWith(
      currentUser.organization.id,
      101,
      input,
    );
    expect(remove).toHaveBeenCalledWith(currentUser.organization.id, 101);
  });
});
