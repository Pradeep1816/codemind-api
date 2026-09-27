import { plainToInstance, Type } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
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
  @IsUrl({
    protocols: ['http', 'https'],
    require_protocol: true,
    require_tld: false,
  })
  WEB_APP_URL?: string;

  @IsOptional()
  @IsIn(['true', 'false'])
  CORS_CREDENTIALS = 'false';

  @IsIn(['false', 'loopback'])
  TRUST_PROXY = 'false';

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
  @Matches(/^[1-9]\d*(?:ms|s|m|h|d|w|y)$/)
  JWT_EXPIRES_IN = '15m';

  @IsOptional()
  @IsString()
  @MinLength(32)
  JWT_REFRESH_SECRET?: string;

  @IsString()
  @Matches(/^[1-9]\d*(?:ms|s|m|h|d|w|y)$/)
  JWT_REFRESH_EXPIRES_IN = '30d';

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(720)
  INVITATION_TTL_HOURS = 72;

  @Type(() => Number)
  @IsInt()
  @Min(1_000)
  @Max(3_600_000)
  RATE_LIMIT_TTL_MS = 60_000;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100_000)
  RATE_LIMIT_DEFAULT_LIMIT = 120;

  @Type(() => Number)
  @IsInt()
  @Min(1_000)
  @Max(3_600_000)
  AUTH_RATE_LIMIT_TTL_MS = 60_000;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10_000)
  AUTH_REGISTER_RATE_LIMIT = 3;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10_000)
  AUTH_LOGIN_RATE_LIMIT = 5;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10_000)
  AUTH_REFRESH_RATE_LIMIT = 20;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10_000)
  AUTH_INVITATION_ACCEPT_RATE_LIMIT = 5;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10_000)
  AUTH_INVITATION_CREATE_RATE_LIMIT = 10;

  @Type(() => Number)
  @IsInt()
  @Min(1_000)
  @Max(3_600_000)
  REPOSITORY_SYNC_RATE_LIMIT_TTL_MS = 60_000;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10_000)
  REPOSITORY_SYNC_RATE_LIMIT = 5;

  @IsString()
  @IsNotEmpty()
  GIT_WORKSPACE_ROOT = '.codemind/repositories';

  @IsOptional()
  @IsString()
  GIT_LOCAL_REPOSITORIES_ROOT?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1_000)
  @Max(600_000)
  GIT_COMMAND_TIMEOUT_MS = 120_000;

  @Type(() => Number)
  @IsInt()
  @Min(1_024)
  @Max(16_777_216)
  GIT_MAX_OUTPUT_BYTES = 1_048_576;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10_000)
  GIT_CLONE_DEPTH = 1;

  @IsString()
  @IsNotEmpty()
  INDEXING_WORKSPACE_ROOT = '.codemind/indexing';

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1_000_000)
  INDEXING_MAX_FILES = 100_000;

  @Type(() => Number)
  @IsInt()
  @Min(1_024)
  @Max(16_777_216)
  INDEXING_MAX_FILE_SIZE_BYTES = 2_097_152;

  @Type(() => Number)
  @IsInt()
  @Min(1_024)
  @Max(10_737_418_240)
  INDEXING_MAX_TOTAL_BYTES = 536_870_912;

  @Type(() => Number)
  @IsInt()
  @Min(32)
  @Max(4_096)
  INDEXING_MAX_PATH_LENGTH = 1_024;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(512)
  INDEXING_MAX_PATH_DEPTH = 64;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100_000)
  INDEXING_MAX_SYMBOLS_PER_FILE = 10_000;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100_000)
  INDEXING_MAX_DEPENDENCIES_PER_FILE = 20_000;

  @Type(() => Number)
  @IsInt()
  @Min(10_000)
  @Max(3_600_000)
  INDEXING_JOB_LEASE_MS = 60_000;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(3_600_000)
  INDEXING_JOB_RETRY_DELAY_MS = 30_000;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  INDEXING_JOB_MAX_ATTEMPTS = 3;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1_000)
  INDEXING_JOB_RECOVERY_BATCH_SIZE = 100;

  @Type(() => Number)
  @IsInt()
  @Min(1_000)
  @Max(300_000)
  INDEXING_JOB_HEARTBEAT_INTERVAL_MS = 15_000;

  @IsIn(['true', 'false'])
  INDEXING_WORKER_ENABLED = 'true';

  @IsOptional()
  @IsString()
  @Matches(/^(?:[A-Za-z0-9._:-]{1,200})?$/)
  INDEXING_WORKER_ID?: string;

  @Type(() => Number)
  @IsInt()
  @Min(100)
  @Max(60_000)
  INDEXING_WORKER_POLL_INTERVAL_MS = 2_000;

  @Type(() => Number)
  @IsInt()
  @Min(1_000)
  @Max(3_600_000)
  INDEXING_WORKER_RECOVERY_INTERVAL_MS = 30_000;

  @IsString()
  @Matches(/^[A-Za-z0-9._-]{1,100}$/)
  KNOWLEDGE_ANALYZER_BUNDLE_VERSION = 'phase4-v2';

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5_000)
  KNOWLEDGE_PERSISTENCE_BATCH_SIZE = 500;

  @Type(() => Number)
  @IsInt()
  @Min(5_000)
  @Max(3_600_000)
  KNOWLEDGE_JOB_LEASE_MS = 60_000;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(3_600_000)
  KNOWLEDGE_JOB_RETRY_DELAY_MS = 30_000;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10)
  KNOWLEDGE_JOB_MAX_ATTEMPTS = 3;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1_000)
  KNOWLEDGE_JOB_RECOVERY_BATCH_SIZE = 100;

  @Type(() => Number)
  @IsInt()
  @Min(1_000)
  @Max(300_000)
  KNOWLEDGE_JOB_HEARTBEAT_INTERVAL_MS = 15_000;

  @IsIn(['true', 'false'])
  KNOWLEDGE_WORKER_ENABLED = 'true';

  @IsOptional()
  @IsString()
  @Matches(/^(?:[A-Za-z0-9._:-]{1,200})?$/)
  KNOWLEDGE_WORKER_ID?: string;

  @Type(() => Number)
  @IsInt()
  @Min(100)
  @Max(60_000)
  KNOWLEDGE_WORKER_POLL_INTERVAL_MS = 2_000;

  @Type(() => Number)
  @IsInt()
  @Min(1_000)
  @Max(3_600_000)
  KNOWLEDGE_WORKER_RECOVERY_INTERVAL_MS = 30_000;

  @Type(() => Number)
  @IsInt()
  @Min(1_024)
  @Max(10_737_418_240)
  ANALYSIS_MAX_TOTAL_SOURCE_BYTES = 536_870_912;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100_000)
  ANALYSIS_MAX_FACTS_PER_FILE = 20_000;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100_000)
  ANALYSIS_MAX_DIAGNOSTICS_PER_FILE = 1_000;

  @Type(() => Number)
  @IsInt()
  @Min(100)
  @Max(5_000_000)
  ANALYSIS_MAX_AST_NODES_PER_FILE = 200_000;

  @Type(() => Number)
  @IsInt()
  @Min(256)
  @Max(1_048_576)
  ANALYSIS_MAX_PROPERTY_BYTES = 16_384;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5_000_000)
  ANALYSIS_MAX_ARCHITECTURE_SYMBOLS = 250_000;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1_000_000)
  ANALYSIS_MAX_ARCHITECTURE_FILES = 100_000;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10_000_000)
  ANALYSIS_MAX_ARCHITECTURE_DEPENDENCIES = 500_000;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10_000_000)
  ANALYSIS_MAX_ARCHITECTURE_OUTPUTS = 500_000;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1_000_000)
  ANALYSIS_MAX_WORKFLOWS = 10_000;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10_000_000)
  ANALYSIS_MAX_WORKFLOW_STEPS = 100_000;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100_000)
  ANALYSIS_MAX_WORKFLOW_STEPS_PER_WORKFLOW = 1_000;

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

  if (
    validatedConfiguration.INDEXING_JOB_HEARTBEAT_INTERVAL_MS >=
    validatedConfiguration.INDEXING_JOB_LEASE_MS
  ) {
    throw new Error(
      'INDEXING_JOB_HEARTBEAT_INTERVAL_MS must be less than INDEXING_JOB_LEASE_MS',
    );
  }

  if (
    validatedConfiguration.KNOWLEDGE_JOB_HEARTBEAT_INTERVAL_MS >=
    validatedConfiguration.KNOWLEDGE_JOB_LEASE_MS
  ) {
    throw new Error(
      'KNOWLEDGE_JOB_HEARTBEAT_INTERVAL_MS must be less than KNOWLEDGE_JOB_LEASE_MS',
    );
  }

  return validatedConfiguration;
}
