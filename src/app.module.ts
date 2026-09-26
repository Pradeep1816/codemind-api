import { Module } from '@nestjs/common';
import { ConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './modules/auth/auth.module';
import { AnalysisModule } from './modules/analysis/analysis.module';
import { HealthModule } from './modules/health/health.module';
import { IndexingModule } from './modules/indexing/indexing.module';
import { RepositoriesModule } from './modules/repositories/repositories.module';

@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    AuthModule,
    RepositoriesModule,
    IndexingModule,
    AnalysisModule,
    HealthModule,
  ],
})
export class AppModule {}
