import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

type HealthCheckStatus = 'up' | 'down';
type ApplicationHealthStatus = 'ok' | 'error';

export interface HealthResponse {
  status: ApplicationHealthStatus;
  timestamp: string;
  uptime: number;
  checks: {
    database: {
      status: HealthCheckStatus;
    };
  };
}

@Injectable()
export class HealthService {
  constructor(private readonly dataSource: DataSource) {}

  async check(): Promise<HealthResponse> {
    const timestamp = new Date().toISOString();
    const uptime = Math.floor(process.uptime());

    try {
      if (!this.dataSource.isInitialized) {
        throw new Error('Database connection is not initialized');
      }

      await this.dataSource.query('SELECT 1');

      return {
        status: 'ok',
        timestamp,
        uptime,
        checks: {
          database: {
            status: 'up',
          },
        },
      };
    } catch {
      return {
        status: 'error',
        timestamp,
        uptime,
        checks: {
          database: {
            status: 'down',
          },
        },
      };
    }
  }
}
