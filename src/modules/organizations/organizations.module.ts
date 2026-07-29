import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrganizationEntity } from '../../database/entities/organization.entity';
import { PermissionEntity } from '../../database/entities/permission.entity';
import { RolePermissionEntity } from '../../database/entities/role-permission.entity';
import { RoleEntity } from '../../database/entities/role.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      OrganizationEntity,
      RoleEntity,
      PermissionEntity,
      RolePermissionEntity,
    ]),
  ],
})
export class OrganizationsModule {}
