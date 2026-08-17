import { resolve } from 'node:path';
import { registerAs } from '@nestjs/config';

function readInteger(name: string, fallback: number): number {
  return Number.parseInt(process.env[name] ?? String(fallback), 10);
}

export default registerAs('indexing', () => ({
  workspaceRoot: resolve(
    process.env.INDEXING_WORKSPACE_ROOT ?? '.codemind/indexing',
  ),
  maxFiles: readInteger('INDEXING_MAX_FILES', 100_000),
  maxFileSizeBytes: readInteger('INDEXING_MAX_FILE_SIZE_BYTES', 2_097_152),
  maxTotalBytes: readInteger('INDEXING_MAX_TOTAL_BYTES', 536_870_912),
  maxPathLength: readInteger('INDEXING_MAX_PATH_LENGTH', 1_024),
  maxPathDepth: readInteger('INDEXING_MAX_PATH_DEPTH', 64),
  maxSymbolsPerFile: readInteger('INDEXING_MAX_SYMBOLS_PER_FILE', 10_000),
  maxDependenciesPerFile: readInteger(
    'INDEXING_MAX_DEPENDENCIES_PER_FILE',
    20_000,
  ),
  jobLeaseMs: readInteger('INDEXING_JOB_LEASE_MS', 60_000),
  jobRetryDelayMs: readInteger('INDEXING_JOB_RETRY_DELAY_MS', 30_000),
  jobMaxAttempts: readInteger('INDEXING_JOB_MAX_ATTEMPTS', 3),
  jobRecoveryBatchSize: readInteger('INDEXING_JOB_RECOVERY_BATCH_SIZE', 100),
  jobHeartbeatIntervalMs: readInteger(
    'INDEXING_JOB_HEARTBEAT_INTERVAL_MS',
    15_000,
  ),
  workerEnabled: process.env.INDEXING_WORKER_ENABLED !== 'false',
  workerId: process.env.INDEXING_WORKER_ID?.trim() || undefined,
  workerPollIntervalMs: readInteger('INDEXING_WORKER_POLL_INTERVAL_MS', 2_000),
  workerRecoveryIntervalMs: readInteger(
    'INDEXING_WORKER_RECOVERY_INTERVAL_MS',
    30_000,
  ),
}));
