import { registerAs } from '@nestjs/config';

function readInteger(name: string, fallback: number): number {
  return Number.parseInt(process.env[name] ?? String(fallback), 10);
}

export default registerAs('knowledge', () => ({
  analyzerBundleVersion:
    process.env.KNOWLEDGE_ANALYZER_BUNDLE_VERSION?.trim() || 'phase4-v1',
  persistenceBatchSize: readInteger('KNOWLEDGE_PERSISTENCE_BATCH_SIZE', 500),
  jobLeaseMs: readInteger('KNOWLEDGE_JOB_LEASE_MS', 60_000),
  jobRetryDelayMs: readInteger('KNOWLEDGE_JOB_RETRY_DELAY_MS', 30_000),
  jobMaxAttempts: readInteger('KNOWLEDGE_JOB_MAX_ATTEMPTS', 3),
  jobRecoveryBatchSize: readInteger('KNOWLEDGE_JOB_RECOVERY_BATCH_SIZE', 100),
  jobHeartbeatIntervalMs: readInteger(
    'KNOWLEDGE_JOB_HEARTBEAT_INTERVAL_MS',
    15_000,
  ),
  workerEnabled: process.env.KNOWLEDGE_WORKER_ENABLED !== 'false',
  workerId: process.env.KNOWLEDGE_WORKER_ID?.trim() || undefined,
  workerPollIntervalMs: readInteger('KNOWLEDGE_WORKER_POLL_INTERVAL_MS', 2_000),
  workerRecoveryIntervalMs: readInteger(
    'KNOWLEDGE_WORKER_RECOVERY_INTERVAL_MS',
    30_000,
  ),
}));
