import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddIndexWorkerProgress1785670000000 implements MigrationInterface {
  name = 'AddIndexWorkerProgress1785670000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "index_jobs"
      ADD "current_file" character varying(1024)
    `);
    await queryRunner.query(`
      ALTER TABLE "file_hashes"
      ADD "analyzed_by_job_id" integer,
      ADD "analysis_completed_at" TIMESTAMP WITH TIME ZONE
    `);
    await queryRunner.query(`
      ALTER TABLE "index_jobs"
      DROP CONSTRAINT "CHK_index_jobs_status_phase"
    `);
    await queryRunner.query(`
      ALTER TYPE "public"."index_job_phase"
      RENAME TO "index_job_phase_before_worker"
    `);
    await queryRunner.query(`
      CREATE TYPE "public"."index_job_phase" AS ENUM(
        'queued',
        'preparing',
        'discovering',
        'hashing',
        'analyzing',
        'extracting_symbols',
        'building_graph',
        'finalizing',
        'finished'
      )
    `);
    await queryRunner.query(`
      ALTER TABLE "index_jobs"
      ALTER COLUMN "phase" DROP DEFAULT
    `);
    await queryRunner.query(`
      ALTER TABLE "index_jobs"
      ALTER COLUMN "phase" TYPE "public"."index_job_phase"
      USING "phase"::text::"public"."index_job_phase"
    `);
    await queryRunner.query(`
      ALTER TABLE "index_jobs"
      ALTER COLUMN "phase" SET DEFAULT 'queued'
    `);
    await queryRunner.query(`
      DROP TYPE "public"."index_job_phase_before_worker"
    `);
    await queryRunner.query(`
      ALTER TABLE "index_jobs"
      ADD CONSTRAINT "CHK_index_jobs_status_phase"
      CHECK (
        ("status" = 'queued' AND "phase" = 'queued') OR
        (
          "status" = 'running' AND
          "phase" IN (
            'preparing',
            'discovering',
            'hashing',
            'analyzing',
            'extracting_symbols',
            'building_graph',
            'finalizing'
          )
        ) OR
        (
          "status" IN ('succeeded', 'failed', 'cancelled') AND
          "phase" = 'finished'
        )
      )
    `);
    await queryRunner.query(`
      ALTER TABLE "index_jobs"
      ADD CONSTRAINT "CHK_index_jobs_current_file_state"
      CHECK ("status" = 'running' OR "current_file" IS NULL)
    `);
    await queryRunner.query(`
      ALTER TABLE "file_hashes"
      ADD CONSTRAINT "CHK_file_hashes_analysis_state"
      CHECK (
        (
          "analyzed_by_job_id" IS NULL AND
          "analysis_completed_at" IS NULL
        ) OR (
          "analyzed_by_job_id" IS NOT NULL AND
          "analysis_completed_at" IS NOT NULL
        )
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_file_hashes_analyzed_by_job_id"
      ON "file_hashes" ("analyzed_by_job_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_file_hashes_analysis_completed_at"
      ON "file_hashes" ("analysis_completed_at")
    `);
    await queryRunner.query(`
      ALTER TABLE "file_hashes"
      ADD CONSTRAINT "FK_file_hashes_analyzed_by_job_id"
      FOREIGN KEY ("analyzed_by_job_id") REFERENCES "index_jobs"("id")
      ON DELETE NO ACTION ON UPDATE NO ACTION
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "file_hashes"
      DROP CONSTRAINT "FK_file_hashes_analyzed_by_job_id"
    `);
    await queryRunner.query(`
      ALTER TABLE "file_hashes"
      DROP CONSTRAINT "CHK_file_hashes_analysis_state"
    `);
    await queryRunner.query(`
      ALTER TABLE "index_jobs"
      DROP CONSTRAINT "CHK_index_jobs_current_file_state"
    `);
    await queryRunner.query(`
      UPDATE "index_jobs"
      SET "phase" = 'analyzing'
      WHERE "phase" IN ('extracting_symbols', 'building_graph')
    `);
    await queryRunner.query(`
      ALTER TABLE "index_jobs"
      DROP CONSTRAINT "CHK_index_jobs_status_phase"
    `);
    await queryRunner.query(`
      ALTER TYPE "public"."index_job_phase"
      RENAME TO "index_job_phase_with_worker"
    `);
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
      ALTER COLUMN "phase" DROP DEFAULT
    `);
    await queryRunner.query(`
      ALTER TABLE "index_jobs"
      ALTER COLUMN "phase" TYPE "public"."index_job_phase"
      USING "phase"::text::"public"."index_job_phase"
    `);
    await queryRunner.query(`
      ALTER TABLE "index_jobs"
      ALTER COLUMN "phase" SET DEFAULT 'queued'
    `);
    await queryRunner.query(`
      DROP TYPE "public"."index_job_phase_with_worker"
    `);
    await queryRunner.query(`
      ALTER TABLE "index_jobs"
      ADD CONSTRAINT "CHK_index_jobs_status_phase"
      CHECK (
        ("status" = 'queued' AND "phase" = 'queued') OR
        (
          "status" = 'running' AND
          "phase" IN (
            'preparing',
            'discovering',
            'hashing',
            'analyzing',
            'finalizing'
          )
        ) OR
        (
          "status" IN ('succeeded', 'failed', 'cancelled') AND
          "phase" = 'finished'
        )
      )
    `);
    await queryRunner.query(
      'DROP INDEX "public"."idx_file_hashes_analysis_completed_at"',
    );
    await queryRunner.query(
      'DROP INDEX "public"."idx_file_hashes_analyzed_by_job_id"',
    );
    await queryRunner.query(`
      ALTER TABLE "file_hashes"
      DROP COLUMN "analysis_completed_at",
      DROP COLUMN "analyzed_by_job_id"
    `);
    await queryRunner.query(`
      ALTER TABLE "index_jobs" DROP COLUMN "current_file"
    `);
  }
}
