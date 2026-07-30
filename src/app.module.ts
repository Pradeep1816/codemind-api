import { Module } from '@nestjs/common';
import { ConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './modules/auth/auth.module';
import { HealthModule } from './modules/health/health.module';
import { RepositoriesModule } from './modules/repositories/repositories.module';

@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    AuthModule,
    RepositoriesModule,
    HealthModule,
  ],
})
export class AppModule {}
