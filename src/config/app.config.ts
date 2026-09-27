import { registerAs } from '@nestjs/config';

export default registerAs('app', () => ({
  name: process.env.APP_NAME ?? 'codemind',
  host: process.env.APP_HOST ?? '0.0.0.0',
  port: Number.parseInt(process.env.APP_PORT ?? '3000', 10),
  environment: process.env.NODE_ENV ?? 'development',
  apiPrefix: process.env.API_PREFIX ?? 'api',
  apiVersion: process.env.API_VERSION ?? '1',
  webAppUrl: (process.env.WEB_APP_URL ?? '').trim().replace(/\/+$/, ''),
  corsCredentials: process.env.CORS_CREDENTIALS === 'true',
  trustProxy: process.env.TRUST_PROXY ?? 'false',
}));
