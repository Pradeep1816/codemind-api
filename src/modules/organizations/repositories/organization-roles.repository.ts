import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { RoleEntity } from '../../../database/entities/role.entity';
import { UserRoleEntity } from '../../../database/entities/user-role.entity';
import { UserStatus } from '../../../database/entities/user.entity';
import { seedPermissions } from '../../../database/seeds/permissions.seed';
import { seedOrganizationRoles } from '../../../database/seeds/roles.seed';

@Injectable()
export class OrganizationRolesRepository {
  constructor(
    @InjectRepository(UserRoleEntity)
    private readonly userRoleRepository: Repository<UserRoleEntity>,
    @InjectRepository(RoleEntity)
    private readonly roleRepository: Repository<RoleEntity>,
  ) {}

  async createDefaultRoles(
    organizationId: string,
    manager: EntityManager,
  ): Promise<RoleEntity[]> {
    const permissions = await seedPermissions(manager);

    return seedOrganizationRoles(manager, organizationId, permissions);
  }

  async assignUserRole(
    userId: string,
    roleId: string,
    manager: EntityManager,
  ): Promise<void> {
    const repository = manager.getRepository(UserRoleEntity);
    const assignment = repository.create({ userId, roleId });

    await repository.save(assignment);
  }

  findOrganizationRoles(organizationId: string): Promise<RoleEntity[]> {
    return this.roleRepository.find({
      where: { organizationId },
      order: { name: 'ASC' },
    });
  }

  findOrganizationRolesByIds(
    organizationId: string,
    roleIds: readonly string[],
    manager: EntityManager,
  ): Promise<RoleEntity[]> {
    return manager
      .getRepository(RoleEntity)
      .createQueryBuilder('role')
      .where('role.organizationId = :organizationId', { organizationId })
      .andWhere('role.id IN (:...roleIds)', { roleIds })
      .orderBy('role.name', 'ASC')
      .getMany();
  }

  async replaceUserRoles(
    userId: string,
    roleIds: readonly string[],
    manager: EntityManager,
  ): Promise<void> {
    const repository = manager.getRepository(UserRoleEntity);

    await repository.delete({ userId });
    await repository.insert(roleIds.map((roleId) => ({ userId, roleId })));
  }

  countActiveUsersWithRole(
    organizationId: string,
    roleName: string,
    manager: EntityManager,
  ): Promise<number> {
    return manager
      .getRepository(UserRoleEntity)
      .createQueryBuilder('userRole')
      .innerJoin('userRole.user', 'user')
      .innerJoin('userRole.role', 'role')
      .where('role.organizationId = :organizationId', { organizationId })
      .andWhere('role.name = :roleName', { roleName })
      .andWhere('user.status = :status', { status: UserStatus.Active })
      .getCount();
  }

  async findUserPermissionNames(
    userId: string,
    organizationId: string,
  ): Promise<string[]> {
    const rows = await this.userRoleRepository
      .createQueryBuilder('userRole')
      .innerJoin('userRole.role', 'role')
      .innerJoin('role.rolePermissions', 'rolePermission')
      .innerJoin('rolePermission.permission', 'permission')
      .select('permission.name', 'name')
      .where('userRole.userId = :userId', { userId })
      .andWhere('role.organizationId = :organizationId', { organizationId })
      .distinct(true)
      .getRawMany<{ name: string }>();

    return rows.map((row) => row.name);
  }
}
