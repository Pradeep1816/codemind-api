import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UserStatus } from '../../../database/entities/user.entity';
import { ListUsersQueryDto } from './list-users-query.dto';

describe('ListUsersQueryDto', () => {
  it('applies pagination defaults and transforms query values', async () => {
    const defaults = plainToInstance(ListUsersQueryDto, {});
    const input = plainToInstance(ListUsersQueryDto, {
      page: '2',
      limit: '50',
      search: ' owner@example.com ',
      status: UserStatus.Active,
    });

    await expect(validate(defaults)).resolves.toHaveLength(0);
    await expect(validate(input)).resolves.toHaveLength(0);
    expect(defaults).toMatchObject({ page: 1, limit: 20 });
    expect(input).toMatchObject({
      page: 2,
      limit: 50,
      search: 'owner@example.com',
      status: UserStatus.Active,
    });
  });

  it('rejects invalid pagination and status values', async () => {
    const input = plainToInstance(ListUsersQueryDto, {
      page: '0',
      limit: '101',
      status: 'deleted',
    });

    const errors = await validate(input);
    const properties = errors.map((error) => error.property);

    expect(properties).toEqual(
      expect.arrayContaining(['page', 'limit', 'status']),
    );
  });
});
