import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { UserEntity, UserStatus } from '../../../database/entities/user.entity';

export interface CreateUserRecord {
  organizationId: string;
  email: string;
  name: string;
  passwordHash: string | null;
  status?: UserEntity['status'];
  invitationTokenHash?: string | null;
  invitationExpiresAt?: Date | null;
  invitedByUserId?: string | null;
}

export interface FindOrganizationUsersOptions {
  organizationId: string;
  page: number;
  limit: number;
  search?: string;
  status?: UserEntity['status'];
}

@Injectable()
export class UserRepository {
  constructor(
    @InjectRepository(UserEntity)
    private readonly repository: Repository<UserEntity>,
  ) {}

  findByEmail(
    email: string,
    manager?: EntityManager,
  ): Promise<UserEntity | null> {
    return this.getRepository(manager).findOne({
      where: { email },
      select: { id: true },
    });
  }

  // This method is used to find a user by email for authentication purposes. It retrieves the user along with their password hash, organization, and roles.
  findForAuthentication(email: string): Promise<UserEntity | null> {
    return this.repository
      .createQueryBuilder('user')
      .addSelect('user.passwordHash')
      .innerJoinAndSelect('user.organization', 'organization')
      .leftJoinAndSelect('user.userRoles', 'userRole')
      .leftJoinAndSelect('userRole.role', 'role')
      .where('user.email = :email', { email })
      .getOne();
  }

  // This method is used to find a user by their ID and organization ID for authentication purposes. It retrieves the user along with their organization and roles.

  findAuthenticatedIdentity(
    userId: string,
    organizationId: string,
  ): Promise<UserEntity | null> {
    return this.repository
      .createQueryBuilder('user')
      .innerJoinAndSelect('user.organization', 'organization')
      .leftJoinAndSelect('user.userRoles', 'userRole')
      .leftJoinAndSelect('userRole.role', 'role')
      .where('user.id = :userId', { userId })
      .andWhere('user.organizationId = :organizationId', { organizationId })
      .getOne();
  }

  // This method is used to update the last login timestamp for a user. It takes the user ID and the new last login timestamp as parameters and updates the corresponding record in the database.

  async updateLastLoginAt(userId: string, lastLoginAt: Date): Promise<void> {
    await this.repository.update({ id: userId }, { lastLoginAt });
  }

  // This method is used to find users by organization ID with optional filtering by status and search term. It returns a paginated list of users along with the total count.

  findManyByOrganization(
    options: FindOrganizationUsersOptions,
  ): Promise<[UserEntity[], number]> {
    const query = this.repository
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.userRoles', 'userRole')
      .leftJoinAndSelect('userRole.role', 'role')
      .where('user.organizationId = :organizationId', {
        organizationId: options.organizationId,
      });

    if (options.status) {
      query.andWhere('user.status = :status', { status: options.status });
    }

    if (options.search) {
      query.andWhere('(user.name ILIKE :search OR user.email ILIKE :search)', {
        search: `%${options.search}%`,
      });
    }

    return query
      .orderBy('user.createdAt', 'DESC')
      .addOrderBy('user.id', 'ASC')
      .skip((options.page - 1) * options.limit)
      .take(options.limit)
      .getManyAndCount();
  }

  // This method is used to find a user by their ID and organization ID. It retrieves the user along with their roles.

  findByIdAndOrganization(
    userId: string,
    organizationId: string,
    manager?: EntityManager,
  ): Promise<UserEntity | null> {
    return this.getRepository(manager)
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.userRoles', 'userRole')
      .leftJoinAndSelect('userRole.role', 'role')
      .where('user.id = :userId', { userId })
      .andWhere('user.organizationId = :organizationId', { organizationId })
      .getOne();
  }

  // This method is used to find a user by their ID and organization ID for update purposes. It retrieves the user and applies a pessimistic write lock to prevent concurrent updates.

  findByIdAndOrganizationForUpdate(
    userId: string,
    organizationId: string,
    manager: EntityManager,
  ): Promise<UserEntity | null> {
    return manager
      .getRepository(UserEntity)
      .createQueryBuilder('user')
      .where('user.id = :userId', { userId })
      .andWhere('user.organizationId = :organizationId', { organizationId })
      .setLock('pessimistic_write')
      .getOne();
  }

  // This method is used to find a user by their invitation token hash for update purposes. It retrieves the user and applies a pessimistic write lock to prevent concurrent updates.

  findByInvitationTokenHashForUpdate(
    invitationTokenHash: string,
    manager: EntityManager,
  ): Promise<UserEntity | null> {
    return manager
      .getRepository(UserEntity)
      .createQueryBuilder('user')
      .addSelect('user.invitationTokenHash')
      .where('user.invitationTokenHash = :invitationTokenHash', {
        invitationTokenHash,
      })
      .andWhere('user.status = :status', { status: UserStatus.Invited })
      .setLock('pessimistic_write')
      .getOne();
  }

  // This method is used to find an available invitation by its token hash. It retrieves the user with the specified invitation token hash, ensuring that the user's status is "Invited" and that the invitation has not expired.

  findAvailableInvitationByTokenHash(
    invitationTokenHash: string,
    now: Date,
  ): Promise<UserEntity | null> {
    return this.repository
      .createQueryBuilder('user')
      .select('user.id')
      .where('user.invitationTokenHash = :invitationTokenHash', {
        invitationTokenHash,
      })
      .andWhere('user.status = :status', { status: UserStatus.Invited })
      .andWhere('user.invitationExpiresAt > :now', { now })
      .getOne();
  }

  save(user: UserEntity, manager: EntityManager): Promise<UserEntity> {
    return manager.getRepository(UserEntity).save(user);
  }

  create(
    input: CreateUserRecord,
    manager?: EntityManager,
  ): Promise<UserEntity> {
    const repository = this.getRepository(manager);
    const user = repository.create(input);

    return repository.save(user);
  }

  private getRepository(manager?: EntityManager): Repository<UserEntity> {
    return manager ? manager.getRepository(UserEntity) : this.repository;
  }
}
