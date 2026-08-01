import 'dotenv/config';
import { join } from 'node:path';
import { DataSource } from 'typeorm';

function getRequiredEnvironmentVariable(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function getDatabasePort(): number {
  const value = process.env.DATABASE_PORT ?? '5432';
  const port = Number.parseInt(value, 10);

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid DATABASE_PORT: ${value}`);
  }

  return port;
}

const dataSource = new DataSource({
  type: 'postgres',
  host: getRequiredEnvironmentVariable('DATABASE_HOST'),
  port: getDatabasePort(),
  username: getRequiredEnvironmentVariable('DATABASE_USER'),
  password: getRequiredEnvironmentVariable('DATABASE_PASSWORD'),
  database: getRequiredEnvironmentVariable('DATABASE_NAME'),
  ssl: process.env.DATABASE_SSL === 'true',
  synchronize: false,
  entities: [join(__dirname, '..', 'modules', '**', '*.entity.{ts,js}')],
  migrations: [join(__dirname, 'migrations', '*.{ts,js}')],
  migrationsTableName: 'migrations',
});

export default dataSource;
