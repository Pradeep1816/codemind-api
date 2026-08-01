import { MigrationInterface, QueryRunner } from 'typeorm';

export class CompleteIndexingFoundation1785620000000 implements MigrationInterface {
  name = 'CompleteIndexingFoundation1785620000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "public"."indexing_mode" AS ENUM(
        'incremental',
        'full'
      )
    `);
    await queryRunner.query(`
      CREATE TYPE "public"."indexed_file_status" AS ENUM(
        'active',
        'deleted'
      )
    `);
    await queryRunner.query(`
      CREATE TYPE "public"."file_hash_algorithm" AS ENUM(
        'sha256'
      )
    `);
    await queryRunner.query(`
      CREATE TYPE "public"."indexing_error_phase" AS ENUM(
        'discovery',
        'materialization',
        'hashing',
        'parsing',
        'persistence',
        'finalization'
      )
    `);
    await queryRunner.query(`
      ALTER TABLE "index_jobs"
      ADD "mode" "public"."indexing_mode"
      NOT NULL DEFAULT 'incremental'
    `);
    await queryRunner.query(`
      CREATE TABLE "indexed_files" (
        "id" SERIAL NOT NULL,
        "organization_id" uuid NOT NULL,
        "repository_id" integer NOT NULL,
        "branch_id" integer NOT NULL,
        "last_seen_job_id" integer,
        "path" character varying(1024) NOT NULL,
        "extension" character varying(32),
        "language" character varying(64),
        "size_bytes" integer NOT NULL,
        "status" "public"."indexed_file_status" NOT NULL DEFAULT 'active',
        "last_seen_commit_sha" character varying(64) NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_indexed_files" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_indexed_files_size_bytes"
          CHECK ("size_bytes" >= 0)
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_indexed_files_branch_path"
      ON "indexed_files" ("branch_id", "path")
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_indexed_files_organization_repository_status"
      ON "indexed_files" ("organization_id", "repository_id", "status")
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_indexed_files_branch_status"
      ON "indexed_files" ("branch_id", "status")
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_indexed_files_last_seen_job_id"
      ON "indexed_files" ("last_seen_job_id")
    `);
    await queryRunner.query(`
      CREATE TABLE "file_hashes" (
        "id" SERIAL NOT NULL,
        "organization_id" uuid NOT NULL,
        "indexed_file_id" integer NOT NULL,
        "observed_by_job_id" integer,
        "algorithm" "public"."file_hash_algorithm" NOT NULL DEFAULT 'sha256',
        "value" character varying(128) NOT NULL,
        "git_blob_oid" character varying(64) NOT NULL,
        "size_bytes" integer NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_file_hashes" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_file_hashes_size_bytes"
          CHECK ("size_bytes" >= 0)
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_file_hashes_indexed_file_algorithm_value"
      ON "file_hashes" ("indexed_file_id", "algorithm", "value")
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_file_hashes_organization_algorithm_value"
      ON "file_hashes" ("organization_id", "algorithm", "value")
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_file_hashes_observed_by_job_id"
      ON "file_hashes" ("observed_by_job_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_file_hashes_git_blob_oid"
      ON "file_hashes" ("git_blob_oid")
    `);
    await queryRunner.query(`
      CREATE TABLE "indexing_errors" (
        "id" SERIAL NOT NULL,
        "organization_id" uuid NOT NULL,
        "index_job_id" integer NOT NULL,
        "indexed_file_id" integer,
        "phase" "public"."indexing_error_phase" NOT NULL,
        "code" character varying(100) NOT NULL,
        "message" character varying(1000) NOT NULL,
        "retryable" boolean NOT NULL DEFAULT false,
        "attempt_number" integer NOT NULL DEFAULT 0,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_indexing_errors" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_indexing_errors_attempt_number"
          CHECK ("attempt_number" >= 0)
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_indexing_errors_organization_job_created"
      ON "indexing_errors" ("organization_id", "index_job_id", "created_at")
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_indexing_errors_indexed_file_id"
      ON "indexing_errors" ("indexed_file_id")
    `);
    await queryRunner.query(`
      ALTER TABLE "indexed_files"
      ADD CONSTRAINT "FK_indexed_files_organization_id"
      FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
      ON DELETE RESTRICT ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE "indexed_files"
      ADD CONSTRAINT "FK_indexed_files_repository_id"
      FOREIGN KEY ("repository_id") REFERENCES "repositories"("id")
      ON DELETE CASCADE ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE "indexed_files"
      ADD CONSTRAINT "FK_indexed_files_branch_id"
      FOREIGN KEY ("branch_id") REFERENCES "repository_branches"("id")
      ON DELETE CASCADE ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE "indexed_files"
      ADD CONSTRAINT "FK_indexed_files_last_seen_job_id"
      FOREIGN KEY ("last_seen_job_id") REFERENCES "index_jobs"("id")
      ON DELETE SET NULL ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE "file_hashes"
      ADD CONSTRAINT "FK_file_hashes_organization_id"
      FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
      ON DELETE RESTRICT ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE "file_hashes"
      ADD CONSTRAINT "FK_file_hashes_indexed_file_id"
      FOREIGN KEY ("indexed_file_id") REFERENCES "indexed_files"("id")
      ON DELETE CASCADE ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE "file_hashes"
      ADD CONSTRAINT "FK_file_hashes_observed_by_job_id"
      FOREIGN KEY ("observed_by_job_id") REFERENCES "index_jobs"("id")
      ON DELETE SET NULL ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE "indexing_errors"
      ADD CONSTRAINT "FK_indexing_errors_organization_id"
      FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
      ON DELETE RESTRICT ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE "indexing_errors"
      ADD CONSTRAINT "FK_indexing_errors_index_job_id"
      FOREIGN KEY ("index_job_id") REFERENCES "index_jobs"("id")
      ON DELETE CASCADE ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE "indexing_errors"
      ADD CONSTRAINT "FK_indexing_errors_indexed_file_id"
      FOREIGN KEY ("indexed_file_id") REFERENCES "indexed_files"("id")
      ON DELETE SET NULL ON UPDATE NO ACTION
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "indexing_errors"
      DROP CONSTRAINT "FK_indexing_errors_indexed_file_id"
    `);
    await queryRunner.query(`
      ALTER TABLE "indexing_errors"
      DROP CONSTRAINT "FK_indexing_errors_index_job_id"
    `);
    await queryRunner.query(`
      ALTER TABLE "indexing_errors"
      DROP CONSTRAINT "FK_indexing_errors_organization_id"
    `);
    await queryRunner.query(`
      ALTER TABLE "file_hashes"
      DROP CONSTRAINT "FK_file_hashes_observed_by_job_id"
    `);
    await queryRunner.query(`
      ALTER TABLE "file_hashes"
      DROP CONSTRAINT "FK_file_hashes_indexed_file_id"
    `);
    await queryRunner.query(`
      ALTER TABLE "file_hashes"
      DROP CONSTRAINT "FK_file_hashes_organization_id"
    `);
    await queryRunner.query(`
      ALTER TABLE "indexed_files"
      DROP CONSTRAINT "FK_indexed_files_last_seen_job_id"
    `);
    await queryRunner.query(`
      ALTER TABLE "indexed_files"
      DROP CONSTRAINT "FK_indexed_files_branch_id"
    `);
    await queryRunner.query(`
      ALTER TABLE "indexed_files"
      DROP CONSTRAINT "FK_indexed_files_repository_id"
    `);
    await queryRunner.query(`
      ALTER TABLE "indexed_files"
      DROP CONSTRAINT "FK_indexed_files_organization_id"
    `);
    await queryRunner.query(`DROP TABLE "indexing_errors"`);
    await queryRunner.query(`DROP TABLE "file_hashes"`);
    await queryRunner.query(`DROP TABLE "indexed_files"`);
    await queryRunner.query(`ALTER TABLE "index_jobs" DROP COLUMN "mode"`);
    await queryRunner.query(`DROP TYPE "public"."indexing_error_phase"`);
    await queryRunner.query(`DROP TYPE "public"."file_hash_algorithm"`);
    await queryRunner.query(`DROP TYPE "public"."indexed_file_status"`);
    await queryRunner.query(`DROP TYPE "public"."indexing_mode"`);
  }
}
