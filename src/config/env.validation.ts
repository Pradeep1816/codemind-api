import { plainToInstance, Type } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  MinLength,
  validateSync,
} from 'class-validator';

enum NodeEnvironment {
  Development = 'development',
  Test = 'test',
  Production = 'production',
}

enum AiProvider {
  OpenAi = 'openai',
  Anthropic = 'anthropic',
  Ollama = 'ollama',
}

class EnvironmentVariables {
  @IsString()
  @IsNotEmpty()
  APP_NAME = 'codemind';

  @IsString()
  @IsNotEmpty()
  APP_HOST = '0.0.0.0';

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  APP_PORT = 3000;

  @IsEnum(NodeEnvironment)
  NODE_ENV = NodeEnvironment.Development;

  @IsString()
  @Matches(/^[a-z0-9-]+$/)
  API_PREFIX = 'api';

  @IsString()
  @Matches(/^\d+$/)
  API_VERSION = '1';

  @IsOptional()
  @IsString()
  CORS_ORIGINS = '';

  @IsOptional()
  @IsIn(['true', 'false'])
  CORS_CREDENTIALS = 'false';

  @IsString()
  @IsNotEmpty()
  DATABASE_HOST!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  DATABASE_PORT = 5432;

  @IsString()
  @IsNotEmpty()
  DATABASE_USER!: string;

  @IsString()
  @IsNotEmpty()
  DATABASE_PASSWORD!: string;

  @IsString()
  @IsNotEmpty()
  DATABASE_NAME!: string;

  @IsOptional()
  @IsIn(['true', 'false'])
  DATABASE_SSL = 'false';

  @IsString()
  @MinLength(32)
  JWT_SECRET!: string;

  @IsString()
  @IsNotEmpty()
  JWT_EXPIRES_IN = '15m';

  @IsEnum(AiProvider)
  AI_PROVIDER = AiProvider.OpenAi;

  @IsOptional()
  @IsString()
  AI_MODEL?: string;

  @IsOptional()
  @IsString()
  AI_API_KEY?: string;

  @IsOptional()
  @IsString()
  AI_BASE_URL?: string;
}

export function validateEnvironment(
  configuration: Record<string, unknown>,
): EnvironmentVariables {
  const validatedConfiguration = plainToInstance(
    EnvironmentVariables,
    configuration,
    {
      enableImplicitConversion: true,
      exposeDefaultValues: true,
    },
  );

  const errors = validateSync(validatedConfiguration, {
    skipMissingProperties: false,
  });

  if (errors.length > 0) {
    const messages = errors.flatMap((error) =>
      Object.values(error.constraints ?? {}),
    );

    throw new Error(`Environment validation failed: ${messages.join(', ')}`);
  }

  return validatedConfiguration;
}
