import { Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';
import aiConfig from './ai.config';
import analysisConfig from './analysis.config';
import appConfig from './app.config';
import databaseConfig from './database.config';
import { validateEnvironment } from './env.validation';
import gitConfig from './git.config';
import indexingConfig from './indexing.config';
import invitationConfig from './invitation.config';
import jwtConfig from './jwt.config';
import knowledgeConfig from './knowledge.config';
import rateLimitConfig from './rate-limit.config';

@Module({
  imports: [
    NestConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      expandVariables: true,
      load: [
        appConfig,
        analysisConfig,
        databaseConfig,
        gitConfig,
        indexingConfig,
        knowledgeConfig,
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
