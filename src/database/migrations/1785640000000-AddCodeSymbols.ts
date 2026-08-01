import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCodeSymbols1785640000000 implements MigrationInterface {
  name = 'AddCodeSymbols1785640000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "public"."code_symbol_kind" AS ENUM(
        'class',
        'interface',
        'function',
        'method',
        'enum',
        'type_alias'
      )
    `);
    await queryRunner.query(`
      CREATE TYPE "public"."code_symbol_visibility" AS ENUM(
        'public',
        'protected',
        'private'
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "code_symbols" (
        "id" SERIAL NOT NULL,
        "organization_id" uuid NOT NULL,
        "repository_id" integer NOT NULL,
        "branch_id" integer NOT NULL,
        "indexed_file_id" integer NOT NULL,
        "file_hash_id" integer NOT NULL,
        "observed_by_job_id" integer,
        "name" character varying(255) NOT NULL,
        "qualified_name" character varying(512) NOT NULL,
        "kind" "public"."code_symbol_kind" NOT NULL,
        "visibility" "public"."code_symbol_visibility",
        "exported" boolean NOT NULL DEFAULT false,
        "default_export" boolean NOT NULL DEFAULT false,
        "signature" character varying(2000),
        "documentation" character varying(4000),
        "start_line" integer NOT NULL,
        "start_column" integer NOT NULL,
        "start_offset" integer NOT NULL,
        "end_line" integer NOT NULL,
        "end_column" integer NOT NULL,
        "end_offset" integer NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_code_symbols" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_code_symbols_source_range"
          CHECK (
            "start_line" >= 1 AND
            "start_column" >= 1 AND
            "start_offset" >= 0 AND
            "end_line" >= "start_line" AND
            "end_column" >= 1 AND
            ("end_line" > "start_line" OR "end_column" >= "start_column") AND
            "end_offset" >= "start_offset"
          )
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_code_symbols_file_hash_kind_qualified_start"
      ON "code_symbols" (
        "file_hash_id",
        "kind",
        "qualified_name",
        "start_offset"
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_code_symbols_organization_repository_kind"
      ON "code_symbols" ("organization_id", "repository_id", "kind")
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_code_symbols_organization_repository_name"
      ON "code_symbols" ("organization_id", "repository_id", "name")
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_code_symbols_branch_id"
      ON "code_symbols" ("branch_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_code_symbols_indexed_file_id"
      ON "code_symbols" ("indexed_file_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_code_symbols_file_hash_id"
      ON "code_symbols" ("file_hash_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_code_symbols_observed_by_job_id"
      ON "code_symbols" ("observed_by_job_id")
    `);
    await queryRunner.query(`
      ALTER TABLE "code_symbols"
      ADD CONSTRAINT "FK_code_symbols_organization_id"
      FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
      ON DELETE RESTRICT ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE "code_symbols"
      ADD CONSTRAINT "FK_code_symbols_repository_id"
      FOREIGN KEY ("repository_id") REFERENCES "repositories"("id")
      ON DELETE CASCADE ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE "code_symbols"
      ADD CONSTRAINT "FK_code_symbols_branch_id"
      FOREIGN KEY ("branch_id") REFERENCES "repository_branches"("id")
      ON DELETE CASCADE ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE "code_symbols"
      ADD CONSTRAINT "FK_code_symbols_indexed_file_id"
      FOREIGN KEY ("indexed_file_id") REFERENCES "indexed_files"("id")
      ON DELETE CASCADE ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE "code_symbols"
      ADD CONSTRAINT "FK_code_symbols_file_hash_id"
      FOREIGN KEY ("file_hash_id") REFERENCES "file_hashes"("id")
      ON DELETE CASCADE ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE "code_symbols"
      ADD CONSTRAINT "FK_code_symbols_observed_by_job_id"
      FOREIGN KEY ("observed_by_job_id") REFERENCES "index_jobs"("id")
      ON DELETE SET NULL ON UPDATE NO ACTION
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "code_symbols"
      DROP CONSTRAINT "FK_code_symbols_observed_by_job_id"
    `);
    await queryRunner.query(`
      ALTER TABLE "code_symbols"
      DROP CONSTRAINT "FK_code_symbols_file_hash_id"
    `);
    await queryRunner.query(`
      ALTER TABLE "code_symbols"
      DROP CONSTRAINT "FK_code_symbols_indexed_file_id"
    `);
    await queryRunner.query(`
      ALTER TABLE "code_symbols"
      DROP CONSTRAINT "FK_code_symbols_branch_id"
    `);
    await queryRunner.query(`
      ALTER TABLE "code_symbols"
      DROP CONSTRAINT "FK_code_symbols_repository_id"
    `);
    await queryRunner.query(`
      ALTER TABLE "code_symbols"
      DROP CONSTRAINT "FK_code_symbols_organization_id"
    `);
    await queryRunner.query(`DROP TABLE "code_symbols"`);
    await queryRunner.query(`DROP TYPE "public"."code_symbol_visibility"`);
    await queryRunner.query(`DROP TYPE "public"."code_symbol_kind"`);
  }
}
