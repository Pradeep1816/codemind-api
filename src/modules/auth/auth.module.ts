import { Module } from '@nestjs/common';
import { ConfigModule, ConfigType } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule, JwtModuleOptions, JwtSignOptions } from '@nestjs/jwt';
import jwtConfig from '../../config/jwt.config';
import { OrganizationsModule } from '../organizations/organizations.module';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { PermissionsGuard } from './guards/permissions.guard';
import { PasswordService } from './password.service';
import { AuthSessionsModule } from './sessions/auth-sessions.module';
import { AuthAuditModule } from './audit/auth-audit.module';
import { RateLimitModule } from './rate-limit.module';

@Module({
  imports: [
    ConfigModule.forFeature(jwtConfig),
    JwtModule.registerAsync({
      imports: [ConfigModule.forFeature(jwtConfig)],
      inject: [jwtConfig.KEY],
      useFactory: (
        configuration: ConfigType<typeof jwtConfig>,
      ): JwtModuleOptions => ({
        secret: configuration.secret,
        signOptions: {
          algorithm: 'HS256',
          expiresIn: configuration.expiresIn as JwtSignOptions['expiresIn'],
        },
        verifyOptions: {
          algorithms: ['HS256'],
        },
      }),
    }),
    OrganizationsModule,
    RateLimitModule,
    AuthAuditModule,
    AuthSessionsModule,
    UsersModule,
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    PasswordService,
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: PermissionsGuard,
    },
  ],
})
export class AuthModule {}
