import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import type { UserResponseDto } from '../users/dto/user-response.dto';
import { UsersService } from '../users/users.service';
import { AddRepositoryMemberDto } from './dto/add-repository-member.dto';
import {
  RepositoryMemberResponseDto,
  RepositoryMemberUserResponseDto,
} from './dto/repository-member-response.dto';
import { RepositoryMemberEntity } from './entities/repository-member.entity';
import { RepositoryMembersRepository } from './repositories/repository-members.repository';
import { RepositoriesRepository } from './repositories/repositories.repository';

interface PostgresDriverError extends Error {
  code?: string;
  constraint?: string;
}

@Injectable()
export class RepositoryMembersService {
  constructor(
    private readonly repositoriesRepository: RepositoriesRepository,
    private readonly repositoryMembersRepository: RepositoryMembersRepository,
    private readonly usersService: UsersService,
  ) {}

  async add(
    organizationId: string,
    actorUserId: string,
    repositoryId: number,
    input: AddRepositoryMemberDto,
  ): Promise<RepositoryMemberResponseDto> {
    await this.ensureRepositoryBelongsToOrganization(
      repositoryId,
      organizationId,
    );

    const user = await this.usersService.getOrganizationUser(
      organizationId,
      input.userId,
    );
    const existing =
      await this.repositoryMembersRepository.findByRepositoryAndUser(
        repositoryId,
        input.userId,
      );

    if (existing) {
      throw new ConflictException('User is already a repository member');
    }

    try {
      const member = await this.repositoryMembersRepository.create({
        repositoryId,
        userId: input.userId,
        addedByUserId: actorUserId,
      });

      return this.toResponse(member, user);
    } catch (error: unknown) {
      if (
        this.getUniqueConstraint(error) ===
        'uq_repository_members_repository_user'
      ) {
        throw new ConflictException('User is already a repository member');
      }

      throw error;
    }
  }

  async list(
    organizationId: string,
    repositoryId: number,
  ): Promise<RepositoryMemberResponseDto[]> {
    await this.ensureRepositoryBelongsToOrganization(
      repositoryId,
      organizationId,
    );

    const members =
      await this.repositoryMembersRepository.findManyByRepository(repositoryId);

    return members.map((member) => this.toResponse(member));
  }

  async remove(
    organizationId: string,
    repositoryId: number,
    userId: string,
  ): Promise<void> {
    await this.ensureRepositoryBelongsToOrganization(
      repositoryId,
      organizationId,
    );

    const deleted =
      await this.repositoryMembersRepository.deleteByRepositoryAndUser(
        repositoryId,
        userId,
      );

    if (!deleted) {
      throw new NotFoundException('Repository member was not found');
    }
  }

  private async ensureRepositoryBelongsToOrganization(
    repositoryId: number,
    organizationId: string,
  ): Promise<void> {
    const repository =
      await this.repositoriesRepository.findByIdAndOrganization(
        repositoryId,
        organizationId,
      );

    if (!repository) {
      throw new NotFoundException('Repository was not found');
    }
  }

  private getUniqueConstraint(error: unknown): string | undefined {
    if (!(error instanceof QueryFailedError)) {
      return undefined;
    }

    const { code, constraint } = error.driverError as PostgresDriverError;

    return code === '23505' && typeof constraint === 'string'
      ? constraint
      : undefined;
  }

  private toResponse(
    member: RepositoryMemberEntity,
    user?: UserResponseDto,
  ): RepositoryMemberResponseDto {
    return {
      id: member.id,
      user: user
        ? this.toMemberUser(user)
        : this.toMemberUser({
            id: member.user.id,
            email: member.user.email,
            name: member.user.name,
            status: member.user.status,
            roles: (member.user.userRoles ?? [])
              .map((assignment) => assignment.role.name)
              .sort(),
          }),
      addedByUserId: member.addedByUserId,
      createdAt: member.createdAt.toISOString(),
    };
  }

  private toMemberUser(
    user: RepositoryMemberUserResponseDto,
  ): RepositoryMemberUserResponseDto {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      status: user.status,
      roles: [...user.roles].sort(),
    };
  }
}
