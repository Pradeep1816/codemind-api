import { MigrationInterface, QueryRunner } from 'typeorm';

export class ExpandIndexJobLifecycle1785660000000 implements MigrationInterface {
  name = 'ExpandIndexJobLifecycle1785660000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "public"."index_job_phase" AS ENUM(
        'queued',
        'preparing',
        'discovering',
        'hashing',
        'analyzing',
        'finalizing',
        'finished'
      )
    `);
    await queryRunner.query(`
      ALTER TABLE "index_jobs"
      ADD "retry_of_job_id" integer,
      ADD "phase" "public"."index_job_phase" NOT NULL DEFAULT 'queued',
      ADD "processed_symbols" integer NOT NULL DEFAULT 0,
      ADD "processed_dependencies" integer NOT NULL DEFAULT 0,
      ADD "max_attempts" integer NOT NULL DEFAULT 3,
      ADD "claimed_by" character varying(200),
      ADD "lease_token" uuid,
      ADD "last_heartbeat_at" TIMESTAMP WITH TIME ZONE,
      ADD "lease_expires_at" TIMESTAMP WITH TIME ZONE,
      ADD "next_attempt_at" TIMESTAMP WITH TIME ZONE,
      ADD "cancellation_requested_at" TIMESTAMP WITH TIME ZONE
    `);

    // A pre-lifecycle running job has no lease owner. Return it to the queue so
    // the new claim protocol can safely resume it instead of leaving it stuck.
    await queryRunner.query(`
      UPDATE "index_jobs"
      SET
        "status" = 'queued',
        "phase" = 'queued',
        "next_attempt_at" = now(),
        "failure_code" = 'legacy_job_requeued',
        "failure_message" = 'Job was queued again during the lifecycle upgrade',
        "completed_at" = NULL
      WHERE "status" = 'running'
    `);
    await queryRunner.query(`
      UPDATE "index_jobs"
      SET "phase" = 'finished'
      WHERE "status" IN ('succeeded', 'failed', 'cancelled')
    `);
    await queryRunner.query(`
      UPDATE "index_jobs"
      SET "max_attempts" = GREATEST(
        3,
        "attempt_count" + CASE WHEN "status" = 'queued' THEN 1 ELSE 0 END
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "index_jobs"
      ADD CONSTRAINT "FK_index_jobs_retry_of_job_id"
      FOREIGN KEY ("retry_of_job_id") REFERENCES "index_jobs"("id")
      ON DELETE SET NULL ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE "index_jobs"
      ADD CONSTRAINT "CHK_index_jobs_attempt_limit"
      CHECK ("max_attempts" >= 1 AND "attempt_count" <= "max_attempts")
    `);
    await queryRunner.query(`
      ALTER TABLE "index_jobs"
      ADD CONSTRAINT "CHK_index_jobs_metadata_counts"
      CHECK ("processed_symbols" >= 0 AND "processed_dependencies" >= 0)
    `);
    await queryRunner.query(`
      ALTER TABLE "index_jobs"
      ADD CONSTRAINT "CHK_index_jobs_lease_state"
      CHECK (
        (
          "status" = 'running' AND
          "claimed_by" IS NOT NULL AND
          "lease_token" IS NOT NULL AND
          "last_heartbeat_at" IS NOT NULL AND
          "lease_expires_at" IS NOT NULL
        ) OR (
          "status" <> 'running' AND
          "claimed_by" IS NULL AND
          "lease_token" IS NULL AND
          "last_heartbeat_at" IS NULL AND
          "lease_expires_at" IS NULL
        )
      )
    `);
    await queryRunner.query(`
      ALTER TABLE "index_jobs"
      ADD CONSTRAINT "CHK_index_jobs_status_phase"
      CHECK (
        ("status" = 'queued' AND "phase" = 'queued') OR
        (
          "status" = 'running' AND
          "phase" IN ('preparing', 'discovering', 'hashing', 'analyzing', 'finalizing')
        ) OR
        (
          "status" IN ('succeeded', 'failed', 'cancelled') AND
          "phase" = 'finished'
        )
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_index_jobs_retry_of_job_id"
      ON "index_jobs" ("retry_of_job_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_index_jobs_claimable"
      ON "index_jobs" ("status", "next_attempt_at", "created_at")
      WHERE "status" = 'queued'
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_index_jobs_expired_lease"
      ON "index_jobs" ("lease_expires_at")
      WHERE "status" = 'running'
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_index_jobs_lease_token"
      ON "index_jobs" ("lease_token")
      WHERE "lease_token" IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX "public"."uq_index_jobs_lease_token"');
    await queryRunner.query(
      'DROP INDEX "public"."idx_index_jobs_expired_lease"',
    );
    await queryRunner.query('DROP INDEX "public"."idx_index_jobs_claimable"');
    await queryRunner.query(
      'DROP INDEX "public"."idx_index_jobs_retry_of_job_id"',
    );
    await queryRunner.query(`
      ALTER TABLE "index_jobs" DROP CONSTRAINT "CHK_index_jobs_status_phase"
    `);
    await queryRunner.query(`
      ALTER TABLE "index_jobs" DROP CONSTRAINT "CHK_index_jobs_lease_state"
    `);
    await queryRunner.query(`
      ALTER TABLE "index_jobs" DROP CONSTRAINT "CHK_index_jobs_metadata_counts"
    `);
    await queryRunner.query(`
      ALTER TABLE "index_jobs" DROP CONSTRAINT "CHK_index_jobs_attempt_limit"
    `);
    await queryRunner.query(`
      ALTER TABLE "index_jobs" DROP CONSTRAINT "FK_index_jobs_retry_of_job_id"
    `);
    await queryRunner.query(`
      ALTER TABLE "index_jobs"
      DROP COLUMN "cancellation_requested_at",
      DROP COLUMN "next_attempt_at",
      DROP COLUMN "lease_expires_at",
      DROP COLUMN "last_heartbeat_at",
      DROP COLUMN "lease_token",
      DROP COLUMN "claimed_by",
      DROP COLUMN "max_attempts",
      DROP COLUMN "processed_dependencies",
      DROP COLUMN "processed_symbols",
      DROP COLUMN "phase",
      DROP COLUMN "retry_of_job_id"
    `);
    await queryRunner.query('DROP TYPE "public"."index_job_phase"');
  }
}
