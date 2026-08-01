import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { configureApplication } from './app.setup';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const configService = app.get(ConfigService);

  const applicationName = configService.getOrThrow<string>('app.name');
  const host = configService.getOrThrow<string>('app.host');
  const port = configService.getOrThrow<number>('app.port');
  const apiPrefix = configService.getOrThrow<string>('app.apiPrefix');
  const apiVersion = configService.getOrThrow<string>('app.apiVersion');

  configureApplication(app, configService);

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
