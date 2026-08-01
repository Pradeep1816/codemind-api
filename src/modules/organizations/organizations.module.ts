import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrganizationEntity } from './entities/organization.entity';
import { PermissionEntity } from './entities/permission.entity';
import { RolePermissionEntity } from './entities/role-permission.entity';
import { RoleEntity } from './entities/role.entity';
import { UserRoleEntity } from './entities/user-role.entity';
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
