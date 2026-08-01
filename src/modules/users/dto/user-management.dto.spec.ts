import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UserStatus } from '../entities/user.entity';
import { AcceptInvitationDto } from './accept-invitation.dto';
import { AssignUserRolesDto } from './assign-user-roles.dto';
import { InviteUserDto } from './invite-user.dto';
import { UpdateUserStatusDto } from './update-user-status.dto';

describe('User management DTOs', () => {
  const roleId = '102e297d-68bb-4e61-b688-b65b3883856c';

  it('normalizes and validates an invitation', async () => {
    const input = plainToInstance(InviteUserDto, {
      name: ' Invited Developer ',
      email: ' Developer@Example.com ',
      roleIds: [roleId],
    });

    await expect(validate(input)).resolves.toHaveLength(0);
    expect(input).toMatchObject({
      name: 'Invited Developer',
      email: 'Developer@Example.com',
      roleIds: [roleId],
    });
  });

  it('rejects duplicate or invalid role IDs', async () => {
    const input = plainToInstance(AssignUserRolesDto, {
      roleIds: [roleId, roleId, 'not-a-uuid'],
    });

    await expect(validate(input)).resolves.not.toHaveLength(0);
  });

  it('does not allow invited as an administrative status update', async () => {
    const input = plainToInstance(UpdateUserStatusDto, {
      status: UserStatus.Invited,
    });

    await expect(validate(input)).resolves.not.toHaveLength(0);
  });

  it('requires a sufficiently strong invitation password', async () => {
    const input = plainToInstance(AcceptInvitationDto, {
      token: 'a'.repeat(43),
      password: 'short',
    });
    const errors = await validate(input);

    expect(errors.map((error) => error.property)).toContain('password');
  });
});
