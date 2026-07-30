import { RequestMethod, ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const configService = app.get(ConfigService);

  const applicationName = configService.getOrThrow<string>('app.name');
  const environment = configService.getOrThrow<string>('app.environment');
  const host = configService.getOrThrow<string>('app.host');
  const port = configService.getOrThrow<number>('app.port');
  const apiPrefix = configService.getOrThrow<string>('app.apiPrefix');
  const apiVersion = configService.getOrThrow<string>('app.apiVersion');
  const corsOrigins = configService.getOrThrow<string[]>('app.corsOrigins');
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

  if (corsOrigins.length > 0) {
    app.enableCors({
      origin: corsOrigins,
      credentials: corsCredentials,
    });
  }

  app.enableShutdownHooks();

  await app.listen(port, host);

  console.log(
    `${applicationName} is running at ${await app.getUrl()}/${apiPrefix}/v${apiVersion}`,
  );
}

void bootstrap().catch((error: unknown) => {
  const trace = error instanceof Error ? error.stack : String(error);

  console.error('Application failed to start', trace);
  process.exitCode = 1;
});
