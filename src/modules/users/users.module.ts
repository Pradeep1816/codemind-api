import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import invitationConfig from '../../config/invitation.config';
import { UserEntity } from '../../database/entities/user.entity';
import { OrganizationsModule } from '../organizations/organizations.module';
import { AuthSessionsModule } from '../auth/sessions/auth-sessions.module';
import { AuthAuditModule } from '../auth/audit/auth-audit.module';
import { UserRepository } from './repositories/user.repository';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [
    ConfigModule.forFeature(invitationConfig),
    TypeOrmModule.forFeature([UserEntity]),
    OrganizationsModule,
    AuthAuditModule,
    AuthSessionsModule,
  ],
  controllers: [UsersController],
  providers: [UsersService, UserRepository],
  exports: [UsersService],
})
export class UsersModule {}
