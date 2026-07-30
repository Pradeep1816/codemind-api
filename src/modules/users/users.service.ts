import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { createHash, randomBytes } from 'node:crypto';
import { DataSource, EntityManager, QueryFailedError } from 'typeorm';
import invitationConfig from '../../config/invitation.config';
import { UserEntity, UserStatus } from '../../database/entities/user.entity';
import { DefaultRoleName } from '../../database/seeds/roles.seed';
import { OrganizationsService } from '../organizations/organizations.service';
import { AssignUserRolesDto } from './dto/assign-user-roles.dto';
import { InviteUserDto } from './dto/invite-user.dto';
import { ListUsersQueryDto } from './dto/list-users-query.dto';
import { UpdateUserStatusDto } from './dto/update-user-status.dto';
import {
  UserInvitationResponseDto,
  UserListResponseDto,
  UserResponseDto,
} from './dto/user-response.dto';
import { UserRepository } from './repositories/user.repository';

interface PostgresDriverError extends Error {
  code?: string;
  constraint?: string;
}

export interface CreateUserInput {
  organizationId: string;
  email: string;
  name: string;
  passwordHash: string;
}

@Injectable()
export class UsersService {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly organizationsService: OrganizationsService,
    private readonly dataSource: DataSource,
    @Inject(invitationConfig.KEY)
    private readonly invitationConfiguration: ConfigType<
      typeof invitationConfig
    >,
  ) {}

  normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  async ensureEmailAvailable(
    email: string,
    manager?: EntityManager,
  ): Promise<void> {
    const user = await this.userRepository.findByEmail(
      this.normalizeEmail(email),
      manager,
    );

    if (user) {
      throw new ConflictException('Email address is already registered');
    }
  }

  create(input: CreateUserInput, manager?: EntityManager): Promise<UserEntity> {
    return this.userRepository.create(
      {
        organizationId: input.organizationId,
        email: this.normalizeEmail(input.email),
        name: input.name.trim(),
        passwordHash: input.passwordHash,
      },
      manager,
    );
  }

  findForAuthentication(email: string): Promise<UserEntity | null> {
    return this.userRepository.findForAuthentication(
      this.normalizeEmail(email),
    );
  }

  findAuthenticatedIdentity(
    userId: string,
    organizationId: string,
  ): Promise<UserEntity | null> {
    return this.userRepository.findAuthenticatedIdentity(
      userId,
      organizationId,
    );
  }

  recordSuccessfulLogin(userId: string): Promise<void> {
    return this.userRepository.updateLastLoginAt(userId, new Date());
  }

  async listOrganizationUsers(
    organizationId: string,
    query: ListUsersQueryDto,
  ): Promise<UserListResponseDto> {
    const [users, total] = await this.userRepository.findManyByOrganization({
      organizationId,
      page: query.page,
      limit: query.limit,
      search: query.search,
      status: query.status,
    });

    return {
      data: users.map((user) => this.toResponse(user)),
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  async getOrganizationUser(
    organizationId: string,
    userId: string,
  ): Promise<UserResponseDto> {
    const user = await this.userRepository.findByIdAndOrganization(
      userId,
      organizationId,
    );

    if (!user) {
      throw new NotFoundException('User was not found');
    }

    return this.toResponse(user);
  }

  async inviteOrganizationUser(
    organizationId: string,
    invitedByUserId: string,
    input: InviteUserDto,
  ): Promise<UserInvitationResponseDto> {
    const email = this.normalizeEmail(input.email);
    const invitationToken = randomBytes(32).toString('base64url');
    const invitationTokenHash = this.hashInvitationToken(invitationToken);
    const expiresAt = new Date(
      Date.now() + this.invitationConfiguration.ttlHours * 60 * 60 * 1000,
    );

    try {
      const user = await this.dataSource.transaction(async (manager) => {
        await this.ensureEmailAvailable(email, manager);

        const roles = await this.organizationsService.findRolesByIds(
          organizationId,
          input.roleIds,
          manager,
        );

        if (roles.length !== input.roleIds.length) {
          throw new BadRequestException(
            'One or more roles do not belong to this organization',
          );
        }

        const invitedUser = await this.userRepository.create(
          {
            organizationId,
            email,
            name: input.name.trim(),
            passwordHash: null,
            status: UserStatus.Invited,
            invitationTokenHash,
            invitationExpiresAt: expiresAt,
            invitedByUserId,
          },
          manager,
        );

        await this.organizationsService.replaceUserRoles(
          invitedUser.id,
          input.roleIds,
          manager,
        );

        return this.getRequiredOrganizationUser(
          invitedUser.id,
          organizationId,
          manager,
        );
      });

      return {
        user: this.toResponse(user),
        invitationToken,
        expiresAt: expiresAt.toISOString(),
      };
    } catch (error: unknown) {
      if (
        error instanceof BadRequestException ||
        error instanceof ConflictException
      ) {
        throw error;
      }

      if (this.getUniqueConstraint(error) === 'uq_users_email') {
        throw new ConflictException('Email address is already registered');
      }

      throw error;
    }
  }

  async acceptInvitation(
    invitationToken: string,
    passwordHash: string,
  ): Promise<UserResponseDto> {
    const tokenHash = this.hashInvitationToken(invitationToken);

    return this.dataSource.transaction(async (manager) => {
      const user = await this.userRepository.findByInvitationTokenHashForUpdate(
        tokenHash,
        manager,
      );

      if (
        !user ||
        !user.invitationExpiresAt ||
        user.invitationExpiresAt.getTime() <= Date.now()
      ) {
        throw new BadRequestException(
          'Invitation token is invalid, expired, or already used',
        );
      }

      user.passwordHash = passwordHash;
      user.status = UserStatus.Active;
      user.invitationTokenHash = null;
      user.invitationExpiresAt = null;
      user.invitationAcceptedAt = new Date();

      await this.userRepository.save(user, manager);

      const acceptedUser = await this.getRequiredOrganizationUser(
        user.id,
        user.organizationId,
        manager,
      );

      return this.toResponse(acceptedUser);
    });
  }

  async ensureInvitationCanBeAccepted(invitationToken: string): Promise<void> {
    const invitation =
      await this.userRepository.findAvailableInvitationByTokenHash(
        this.hashInvitationToken(invitationToken),
        new Date(),
      );

    if (!invitation) {
      throw new BadRequestException(
        'Invitation token is invalid, expired, or already used',
      );
    }
  }

  async updateOrganizationUserStatus(
    organizationId: string,
    userId: string,
    input: UpdateUserStatusDto,
  ): Promise<UserResponseDto> {
    return this.dataSource.transaction(async (manager) => {
      await this.lockRequiredOrganization(organizationId, manager);

      const lockedUser =
        await this.userRepository.findByIdAndOrganizationForUpdate(
          userId,
          organizationId,
          manager,
        );

      if (!lockedUser) {
        throw new NotFoundException('User was not found');
      }

      const user = await this.getRequiredOrganizationUser(
        userId,
        organizationId,
        manager,
      );

      if (user.status === UserStatus.Invited) {
        throw new BadRequestException(
          'Invited users must accept their invitation before status can be changed',
        );
      }

      if (user.status === input.status) {
        return this.toResponse(user);
      }

      await this.ensureActiveOwnerRemains(
        user,
        input.status,
        undefined,
        manager,
      );

      lockedUser.status = input.status;
      await this.userRepository.save(lockedUser, manager);

      return this.toResponse(
        await this.getRequiredOrganizationUser(userId, organizationId, manager),
      );
    });
  }

  async replaceOrganizationUserRoles(
    organizationId: string,
    userId: string,
    input: AssignUserRolesDto,
  ): Promise<UserResponseDto> {
    return this.dataSource.transaction(async (manager) => {
      await this.lockRequiredOrganization(organizationId, manager);

      const lockedUser =
        await this.userRepository.findByIdAndOrganizationForUpdate(
          userId,
          organizationId,
          manager,
        );

      if (!lockedUser) {
        throw new NotFoundException('User was not found');
      }

      const roles = await this.organizationsService.findRolesByIds(
        organizationId,
        input.roleIds,
        manager,
      );

      if (roles.length !== input.roleIds.length) {
        throw new BadRequestException(
          'One or more roles do not belong to this organization',
        );
      }

      const user = await this.getRequiredOrganizationUser(
        userId,
        organizationId,
        manager,
      );
      const nextRoleNames = new Set(roles.map((role) => role.name));

      await this.ensureActiveOwnerRemains(
        user,
        user.status,
        nextRoleNames,
        manager,
      );
      await this.organizationsService.replaceUserRoles(
        userId,
        input.roleIds,
        manager,
      );

      return this.toResponse(
        await this.getRequiredOrganizationUser(userId, organizationId, manager),
      );
    });
  }

  private async getRequiredOrganizationUser(
    userId: string,
    organizationId: string,
    manager: EntityManager,
  ): Promise<UserEntity> {
    const user = await this.userRepository.findByIdAndOrganization(
      userId,
      organizationId,
      manager,
    );

    if (!user) {
      throw new NotFoundException('User was not found');
    }

    return user;
  }

  private async lockRequiredOrganization(
    organizationId: string,
    manager: EntityManager,
  ): Promise<void> {
    const organizationExists = await this.organizationsService.lockOrganization(
      organizationId,
      manager,
    );

    if (!organizationExists) {
      throw new NotFoundException('Organization was not found');
    }
  }

  private async ensureActiveOwnerRemains(
    user: UserEntity,
    nextStatus: UserStatus,
    nextRoleNames: ReadonlySet<string> | undefined,
    manager: EntityManager,
  ): Promise<void> {
    const currentRoleNames = new Set(
      (user.userRoles ?? [])
        .map((userRole) => userRole.role?.name)
        .filter((role): role is string => typeof role === 'string'),
    );
    const isRemovingActiveOwner =
      user.status === UserStatus.Active &&
      currentRoleNames.has(DefaultRoleName.Owner) &&
      (nextStatus !== UserStatus.Active ||
        (nextRoleNames !== undefined &&
          !nextRoleNames.has(DefaultRoleName.Owner)));

    if (!isRemovingActiveOwner) {
      return;
    }

    const activeOwnerCount =
      await this.organizationsService.countActiveUsersWithRole(
        user.organizationId,
        DefaultRoleName.Owner,
        manager,
      );

    if (activeOwnerCount <= 1) {
      throw new ConflictException(
        'The organization must keep at least one active OWNER',
      );
    }
  }

  private hashInvitationToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
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

  private toResponse(user: UserEntity): UserResponseDto {
    const roles = [
      ...new Set(
        (user.userRoles ?? [])
          .map((userRole) => userRole.role?.name)
          .filter((role): role is string => typeof role === 'string'),
      ),
    ].sort();

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      status: user.status,
      roles,
      lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
      createdAt: user.createdAt.toISOString(),
    };
  }
}
