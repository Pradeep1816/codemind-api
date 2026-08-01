import { Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';
import aiConfig from './ai.config';
import appConfig from './app.config';
import databaseConfig from './database.config';
import { validateEnvironment } from './env.validation';
import gitConfig from './git.config';
import invitationConfig from './invitation.config';
import jwtConfig from './jwt.config';
import rateLimitConfig from './rate-limit.config';

@Module({
  imports: [
    NestConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      expandVariables: true,
      load: [
        appConfig,
        databaseConfig,
        gitConfig,
        jwtConfig,
        invitationConfig,
        rateLimitConfig,
        aiConfig,
      ],
      validate: validateEnvironment,
    }),
  ],
  exports: [NestConfigModule],
})
export class ConfigModule {}
