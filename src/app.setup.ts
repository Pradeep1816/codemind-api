import { RequestMethod, ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';

/**
 * Applies the HTTP behavior shared by the production bootstrap and E2E tests.
 * Keeping this configuration in one place prevents tests from exercising an
 * application with different routes, validation, or security middleware.
 */
export function configureApplication(
  app: NestExpressApplication,
  configService: ConfigService,
): void {
  const environment = configService.getOrThrow<string>('app.environment');
  const apiPrefix = configService.getOrThrow<string>('app.apiPrefix');
  const apiVersion = configService.getOrThrow<string>('app.apiVersion');
  const webAppUrl = configService.getOrThrow<string>('app.webAppUrl');
  const corsCredentials = configService.getOrThrow<boolean>(
    'app.corsCredentials',
  );
  const trustProxy = configService.getOrThrow<string>('app.trustProxy');

  app.use(helmet());
  app.disable('x-powered-by');

  if (trustProxy !== 'false') {
    app.set('trust proxy', trustProxy);
  }

  app.useLogger(
    environment === 'production'
      ? ['log', 'warn', 'error']
      : ['log', 'warn', 'error', 'debug', 'verbose'],
  );

  app.setGlobalPrefix(apiPrefix, {
    exclude: [{ path: 'health', method: RequestMethod.GET }],
  });
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: apiVersion,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      validationError: {
        target: false,
        value: false,
      },
    }),
  );

  if (webAppUrl) {
    app.enableCors({
      origin: webAppUrl,
      credentials: corsCredentials,
    });
  }
}
