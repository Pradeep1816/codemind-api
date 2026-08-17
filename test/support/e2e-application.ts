import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModuleBuilder } from '@nestjs/testing';
import { NestExpressApplication } from '@nestjs/platform-express';
import type { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { AppModule } from '../../src/app.module';
import { configureApplication } from '../../src/app.setup';
import { GitService } from '../../src/modules/repositories/git/git.service';

export type E2eGitService = Pick<GitService, 'synchronizeRepository'> &
  Partial<Pick<GitService, 'requireCommit' | 'listCommitFiles' | 'readBlob'>>;

export interface E2eApplicationContext {
  app: INestApplication;
  dataSource: DataSource;
  httpServer: App;
}

export async function createE2eApplication(
  gitService?: E2eGitService,
): Promise<E2eApplicationContext> {
  let builder: TestingModuleBuilder = Test.createTestingModule({
    imports: [AppModule],
  });

  if (gitService) {
    builder = builder.overrideProvider(GitService).useValue(gitService);
  }

  const moduleFixture = await builder.compile();
  const app = moduleFixture.createNestApplication<NestExpressApplication>();
  const configService = app.get(ConfigService);
  const dataSource = app.get(DataSource);

  configureApplication(app, configService);
  app.useLogger(false);

  await assertE2eDatabase(dataSource);
  await dataSource.runMigrations();
  await app.init();

  return {
    app,
    dataSource,
    httpServer: app.getHttpServer() as App,
  };
}

async function assertE2eDatabase(dataSource: DataSource): Promise<void> {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('E2E tests require NODE_ENV=test');
  }

  const rows = await dataSource.query<Array<{ databaseName: string }>>(
    'SELECT current_database() AS "databaseName"',
  );
  const databaseName = rows[0]?.databaseName;

  if (!databaseName?.endsWith('_test')) {
    throw new Error(
      `Refusing to run E2E tests against database "${databaseName ?? 'unknown'}". The name must end with _test.`,
    );
  }
}
