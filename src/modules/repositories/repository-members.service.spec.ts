import { ConflictException, NotFoundException } from '@nestjs/common';
import { UserStatus } from '../../database/entities/user.entity';
import type { UserResponseDto } from '../users/dto/user-response.dto';
import { UsersService } from '../users/users.service';
import { RepositoryMemberEntity } from './entities/repository-member.entity';
import { RepositoryMembersService } from './repository-members.service';
import { RepositoryMembersRepository } from './repositories/repository-members.repository';
import { RepositoriesRepository } from './repositories/repositories.repository';

describe('RepositoryMembersService', () => {
  const organizationId = 'organization-id';
  const repositoryId = 101;
  const actorUserId = 'b916fed6-c0e1-4537-9dab-4fe9b40c0333';
  const memberUserId = '25d8bd53-047b-42d8-9efa-4ecedfe422d3';
  const createdAt = new Date('2026-07-31T12:00:00.000Z');
  const user: UserResponseDto = {
    id: memberUserId,
    email: 'developer@example.com',
    name: 'Developer',
    status: UserStatus.Active,
    roles: ['VIEWER', 'DEVELOPER'],
    lastLoginAt: null,
    createdAt: createdAt.toISOString(),
  };

  function createService(options?: {
    repositoryFound?: boolean;
    existingMember?: RepositoryMemberEntity | null;
    deleted?: boolean;
    members?: RepositoryMemberEntity[];
  }): {
    service: RepositoryMembersService;
    repositoriesRepository: {
      findByIdAndOrganization: jest.Mock;
    };
    repositoryMembersRepository: {
      findByRepositoryAndUser: jest.Mock;
      create: jest.Mock;
      findManyByRepository: jest.Mock;
      deleteByRepositoryAndUser: jest.Mock;
    };
    usersService: {
      getOrganizationUser: jest.Mock;
    };
  } {
    const member = {
      id: 201,
      repositoryId,
      userId: memberUserId,
      addedByUserId: actorUserId,
      createdAt,
    } as RepositoryMemberEntity;
    const repositoriesRepository = {
      findByIdAndOrganization: jest
        .fn()
        .mockResolvedValue(options?.repositoryFound === false ? null : {}),
    };
    const repositoryMembersRepository = {
      findByRepositoryAndUser: jest
        .fn()
        .mockResolvedValue(options?.existingMember ?? null),
      create: jest.fn().mockResolvedValue(member),
      findManyByRepository: jest.fn().mockResolvedValue(options?.members ?? []),
      deleteByRepositoryAndUser: jest
        .fn()
        .mockResolvedValue(options?.deleted ?? true),
    };
    const usersService = {
      getOrganizationUser: jest.fn().mockResolvedValue(user),
    };
    const service = new RepositoryMembersService(
      repositoriesRepository as unknown as RepositoriesRepository,
      repositoryMembersRepository as unknown as RepositoryMembersRepository,
      usersService as unknown as UsersService,
    );

    return {
      service,
      repositoriesRepository,
      repositoryMembersRepository,
      usersService,
    };
  }

  it('adds a user from the authenticated organization', async () => {
    const context = createService();

    await expect(
      context.service.add(organizationId, actorUserId, repositoryId, {
        userId: memberUserId,
      }),
    ).resolves.toEqual({
      id: 201,
      user: {
        id: memberUserId,
        email: user.email,
        name: user.name,
        status: UserStatus.Active,
        roles: ['DEVELOPER', 'VIEWER'],
      },
      addedByUserId: actorUserId,
      createdAt: createdAt.toISOString(),
    });
    expect(
      context.repositoriesRepository.findByIdAndOrganization,
    ).toHaveBeenCalledWith(repositoryId, organizationId);
    expect(context.usersService.getOrganizationUser).toHaveBeenCalledWith(
      organizationId,
      memberUserId,
    );
    expect(context.repositoryMembersRepository.create).toHaveBeenCalledWith({
      repositoryId,
      userId: memberUserId,
      addedByUserId: actorUserId,
    });
  });

  it('does not inspect a target user when the repository is outside the organization', async () => {
    const context = createService({ repositoryFound: false });

    await expect(
      context.service.add(organizationId, actorUserId, repositoryId, {
        userId: memberUserId,
      }),
    ).rejects.toThrow(NotFoundException);
    expect(context.usersService.getOrganizationUser).not.toHaveBeenCalled();
    expect(context.repositoryMembersRepository.create).not.toHaveBeenCalled();
  });

  it('rejects a duplicate repository membership', async () => {
    const context = createService({
      existingMember: { id: 201 } as RepositoryMemberEntity,
    });

    await expect(
      context.service.add(organizationId, actorUserId, repositoryId, {
        userId: memberUserId,
      }),
    ).rejects.toThrow(ConflictException);
    expect(context.repositoryMembersRepository.create).not.toHaveBeenCalled();
  });

  it('lists members only after validating repository ownership', async () => {
    const member = {
      id: 201,
      repositoryId,
      userId: memberUserId,
      addedByUserId: actorUserId,
      createdAt,
      user: {
        id: memberUserId,
        email: user.email,
        name: user.name,
        status: UserStatus.Active,
        userRoles: [
          { role: { name: 'VIEWER' } },
          { role: { name: 'DEVELOPER' } },
        ],
      },
    } as RepositoryMemberEntity;
    const context = createService({ members: [member] });

    const result = await context.service.list(organizationId, repositoryId);

    expect(result[0]?.user.roles).toEqual(['DEVELOPER', 'VIEWER']);
    expect(
      context.repositoryMembersRepository.findManyByRepository,
    ).toHaveBeenCalledWith(repositoryId);
  });

  it('returns not found when the requested membership does not exist', async () => {
    const context = createService({ deleted: false });

    await expect(
      context.service.remove(organizationId, repositoryId, memberUserId),
    ).rejects.toThrow(NotFoundException);
    expect(
      context.repositoryMembersRepository.deleteByRepositoryAndUser,
    ).toHaveBeenCalledWith(repositoryId, memberUserId);
  });
});
