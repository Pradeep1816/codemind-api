import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import type { App } from 'supertest/types';
import { createE2eApplication } from './support/e2e-application';

describe('Application health (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let httpServer: App;

  beforeAll(async () => {
    ({ app, dataSource, httpServer } = await createE2eApplication());
  });

  it('reports that the API and PostgreSQL connection are healthy', () => {
    return request(httpServer)
      .get('/health')
      .expect(200)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          status: 'ok',
          checks: {
            database: {
              status: 'up',
            },
          },
        });
      });
  });

  afterAll(async () => {
    if (app) {
      await app.close();
      expect(dataSource.isInitialized).toBe(false);
    }
  });
});
