import 'reflect-metadata';
import knowledgeConfig from './knowledge.config';
import { validateEnvironment } from './env.validation';

describe('Knowledge configuration', () => {
  const variableNames = [
    'KNOWLEDGE_ANALYZER_BUNDLE_VERSION',
    'KNOWLEDGE_PERSISTENCE_BATCH_SIZE',
    'KNOWLEDGE_JOB_LEASE_MS',
    'KNOWLEDGE_JOB_RETRY_DELAY_MS',
    'KNOWLEDGE_JOB_MAX_ATTEMPTS',
    'KNOWLEDGE_JOB_RECOVERY_BATCH_SIZE',
    'KNOWLEDGE_JOB_HEARTBEAT_INTERVAL_MS',
    'KNOWLEDGE_WORKER_ENABLED',
    'KNOWLEDGE_WORKER_ID',
    'KNOWLEDGE_WORKER_POLL_INTERVAL_MS',
    'KNOWLEDGE_WORKER_RECOVERY_INTERVAL_MS',
  ] as const;
  const originalValues = new Map(
    variableNames.map((name) => [name, process.env[name]]),
  );

  afterEach(() => {
    for (const name of variableNames) {
      const originalValue = originalValues.get(name);

      if (originalValue === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = originalValue;
      }
    }
  });

  it('loads knowledge worker and lifecycle settings', () => {
    process.env.KNOWLEDGE_ANALYZER_BUNDLE_VERSION = 'phase4-v2';
    process.env.KNOWLEDGE_PERSISTENCE_BATCH_SIZE = '250';
    process.env.KNOWLEDGE_JOB_LEASE_MS = '90000';
    process.env.KNOWLEDGE_JOB_RETRY_DELAY_MS = '5000';
    process.env.KNOWLEDGE_JOB_MAX_ATTEMPTS = '4';
    process.env.KNOWLEDGE_JOB_RECOVERY_BATCH_SIZE = '25';
    process.env.KNOWLEDGE_JOB_HEARTBEAT_INTERVAL_MS = '10000';
    process.env.KNOWLEDGE_WORKER_ENABLED = 'false';
    process.env.KNOWLEDGE_WORKER_ID = 'knowledge-1';
    process.env.KNOWLEDGE_WORKER_POLL_INTERVAL_MS = '500';
    process.env.KNOWLEDGE_WORKER_RECOVERY_INTERVAL_MS = '20000';

    expect(knowledgeConfig()).toEqual({
      analyzerBundleVersion: 'phase4-v2',
      persistenceBatchSize: 250,
      jobLeaseMs: 90_000,
      jobRetryDelayMs: 5_000,
      jobMaxAttempts: 4,
      jobRecoveryBatchSize: 25,
      jobHeartbeatIntervalMs: 10_000,
      workerEnabled: false,
      workerId: 'knowledge-1',
      workerPollIntervalMs: 500,
      workerRecoveryIntervalMs: 20_000,
    });
  });

  it('rejects a heartbeat interval that is not shorter than the lease', () => {
    expect(() =>
      validateEnvironment({
        DATABASE_HOST: 'localhost',
        DATABASE_USER: 'postgres',
        DATABASE_PASSWORD: 'password',
        DATABASE_NAME: 'codemind',
        JWT_SECRET: 'replace_with_a_secret_at_least_32_characters',
        KNOWLEDGE_JOB_LEASE_MS: '10000',
        KNOWLEDGE_JOB_HEARTBEAT_INTERVAL_MS: '10000',
      }),
    ).toThrow(
      'KNOWLEDGE_JOB_HEARTBEAT_INTERVAL_MS must be less than KNOWLEDGE_JOB_LEASE_MS',
    );
  });
});
