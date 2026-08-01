import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddIndexJobs1785610000000 implements MigrationInterface {
  name = 'AddIndexJobs1785610000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "public"."index_job_status" AS ENUM(
        'queued',
        'running',
        'succeeded',
        'failed',
        'cancelled'
      )
    `);
    await queryRunner.query(`
      CREATE TYPE "public"."index_job_trigger" AS ENUM(
        'manual',
        'repository_sync'
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "index_jobs" (
        "id" SERIAL NOT NULL,
        "organization_id" uuid NOT NULL,
        "repository_id" integer NOT NULL,
        "branch_id" integer NOT NULL,
        "requested_by_user_id" uuid,
        "trigger" "public"."index_job_trigger" NOT NULL DEFAULT 'manual',
        "status" "public"."index_job_status" NOT NULL DEFAULT 'queued',
        "target_commit_sha" character varying(64) NOT NULL,
        "total_files" integer NOT NULL DEFAULT 0,
        "processed_files" integer NOT NULL DEFAULT 0,
        "skipped_files" integer NOT NULL DEFAULT 0,
        "failed_files" integer NOT NULL DEFAULT 0,
        "attempt_count" integer NOT NULL DEFAULT 0,
        "failure_code" character varying(100),
        "failure_message" character varying(1000),
        "started_at" TIMESTAMP WITH TIME ZONE,
        "completed_at" TIMESTAMP WITH TIME ZONE,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_index_jobs" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_index_jobs_file_counts" CHECK (
          "total_files" >= 0 AND
          "processed_files" >= 0 AND
          "skipped_files" >= 0 AND
          "failed_files" >= 0 AND
          ("processed_files" + "skipped_files" + "failed_files") <= "total_files"
        ),
        CONSTRAINT "CHK_index_jobs_attempt_count" CHECK ("attempt_count" >= 0)
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_index_jobs_active_repository_branch"
      ON "index_jobs" ("repository_id", "branch_id")
      WHERE "status" IN ('queued', 'running')
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_index_jobs_organization_repository_created"
      ON "index_jobs" ("organization_id", "repository_id", "created_at")
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_index_jobs_organization_status_created"
      ON "index_jobs" ("organization_id", "status", "created_at")
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_index_jobs_branch_id"
      ON "index_jobs" ("branch_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_index_jobs_requested_by_user_id"
      ON "index_jobs" ("requested_by_user_id")
    `);
    await queryRunner.query(`
      ALTER TABLE "index_jobs"
      ADD CONSTRAINT "FK_index_jobs_organization_id"
      FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
      ON DELETE RESTRICT ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE "index_jobs"
      ADD CONSTRAINT "FK_index_jobs_repository_id"
      FOREIGN KEY ("repository_id") REFERENCES "repositories"("id")
      ON DELETE CASCADE ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE "index_jobs"
      ADD CONSTRAINT "FK_index_jobs_branch_id"
      FOREIGN KEY ("branch_id") REFERENCES "repository_branches"("id")
      ON DELETE CASCADE ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE "index_jobs"
      ADD CONSTRAINT "FK_index_jobs_requested_by_user_id"
      FOREIGN KEY ("requested_by_user_id") REFERENCES "users"("id")
      ON DELETE SET NULL ON UPDATE NO ACTION
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "index_jobs"
      DROP CONSTRAINT "FK_index_jobs_requested_by_user_id"
    `);
    await queryRunner.query(`
      ALTER TABLE "index_jobs"
      DROP CONSTRAINT "FK_index_jobs_branch_id"
    `);
    await queryRunner.query(`
      ALTER TABLE "index_jobs"
      DROP CONSTRAINT "FK_index_jobs_repository_id"
    `);
    await queryRunner.query(`
      ALTER TABLE "index_jobs"
      DROP CONSTRAINT "FK_index_jobs_organization_id"
    `);
    await queryRunner.query(`
      DROP INDEX "public"."idx_index_jobs_requested_by_user_id"
    `);
    await queryRunner.query(`
      DROP INDEX "public"."idx_index_jobs_branch_id"
    `);
    await queryRunner.query(`
      DROP INDEX "public"."idx_index_jobs_organization_status_created"
    `);
    await queryRunner.query(`
      DROP INDEX "public"."idx_index_jobs_organization_repository_created"
    `);
    await queryRunner.query(`
      DROP INDEX "public"."uq_index_jobs_active_repository_branch"
    `);
    await queryRunner.query(`
      DROP TABLE "index_jobs"
    `);
    await queryRunner.query(`
      DROP TYPE "public"."index_job_trigger"
    `);
    await queryRunner.query(`
      DROP TYPE "public"."index_job_status"
    `);
  }
}
