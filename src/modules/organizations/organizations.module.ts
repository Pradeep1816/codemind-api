import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrganizationEntity } from '../../database/entities/organization.entity';
import { PermissionEntity } from '../../database/entities/permission.entity';
import { RolePermissionEntity } from '../../database/entities/role-permission.entity';
import { RoleEntity } from '../../database/entities/role.entity';
import { UserRoleEntity } from '../../database/entities/user-role.entity';
import { OrganizationRolesController } from './organization-roles.controller';
import { OrganizationsService } from './organizations.service';
import { OrganizationRolesRepository } from './repositories/organization-roles.repository';
import { OrganizationRepository } from './repositories/organization.repository';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      OrganizationEntity,
      RoleEntity,
      PermissionEntity,
      RolePermissionEntity,
      UserRoleEntity,
    ]),
  ],
  controllers: [OrganizationRolesController],
  providers: [
    OrganizationsService,
    OrganizationRepository,
    OrganizationRolesRepository,
  ],
  exports: [OrganizationsService],
})
export class OrganizationsModule {}
