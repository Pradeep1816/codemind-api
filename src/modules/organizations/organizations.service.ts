import { ConflictException, Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { OrganizationEntity } from '../../database/entities/organization.entity';
import { RoleEntity } from '../../database/entities/role.entity';
import { RoleResponseDto } from './dto/role-response.dto';
import { OrganizationRolesRepository } from './repositories/organization-roles.repository';
import { OrganizationRepository } from './repositories/organization.repository';

export interface CreateOrganizationInput {
  name: string;
  slug: string;
}

@Injectable()
export class OrganizationsService {
  constructor(
    private readonly organizationRepository: OrganizationRepository,
    private readonly organizationRolesRepository: OrganizationRolesRepository,
  ) {}

  normalizeSlug(slug: string): string {
    return slug.trim().toLowerCase();
  }

  async ensureSlugAvailable(
    slug: string,
    manager?: EntityManager,
  ): Promise<void> {
    const organization = await this.organizationRepository.findBySlug(
      slug,
      manager,
    );

    if (organization) {
      throw new ConflictException('Organization slug is already in use');
    }
  }

  create(
    input: CreateOrganizationInput,
    manager?: EntityManager,
  ): Promise<OrganizationEntity> {
    return this.organizationRepository.create(
      {
        name: input.name.trim(),
        slug: this.normalizeSlug(input.slug),
      },
      manager,
    );
  }

  createDefaultRoles(
    organizationId: string,
    manager: EntityManager,
  ): Promise<RoleEntity[]> {
    return this.organizationRolesRepository.createDefaultRoles(
      organizationId,
      manager,
    );
  }

  assignUserRole(
    userId: string,
    roleId: string,
    manager: EntityManager,
  ): Promise<void> {
    return this.organizationRolesRepository.assignUserRole(
      userId,
      roleId,
      manager,
    );
  }

  async listRoles(organizationId: string): Promise<RoleResponseDto[]> {
    const roles =
      await this.organizationRolesRepository.findOrganizationRoles(
        organizationId,
      );

    return roles.map((role) => ({
      id: role.id,
      name: role.name,
      description: role.description,
    }));
  }

  findRolesByIds(
    organizationId: string,
    roleIds: readonly string[],
    manager: EntityManager,
  ): Promise<RoleEntity[]> {
    return this.organizationRolesRepository.findOrganizationRolesByIds(
      organizationId,
      roleIds,
      manager,
    );
  }

  replaceUserRoles(
    userId: string,
    roleIds: readonly string[],
    manager: EntityManager,
  ): Promise<void> {
    return this.organizationRolesRepository.replaceUserRoles(
      userId,
      roleIds,
      manager,
    );
  }

  countActiveUsersWithRole(
    organizationId: string,
    roleName: string,
    manager: EntityManager,
  ): Promise<number> {
    return this.organizationRolesRepository.countActiveUsersWithRole(
      organizationId,
      roleName,
      manager,
    );
  }

  lockOrganization(
    organizationId: string,
    manager: EntityManager,
  ): Promise<boolean> {
    return this.organizationRepository.lockById(organizationId, manager);
  }

  getUserPermissionNames(
    userId: string,
    organizationId: string,
  ): Promise<string[]> {
    return this.organizationRolesRepository.findUserPermissionNames(
      userId,
      organizationId,
    );
  }
}
