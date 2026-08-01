import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCodeDependencies1785650000000 implements MigrationInterface {
  name = 'AddCodeDependencies1785650000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "public"."code_dependency_kind" AS ENUM(
        'import',
        'export',
        'extends',
        'implements'
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "code_dependencies" (
        "id" SERIAL NOT NULL,
        "organization_id" uuid NOT NULL,
        "repository_id" integer NOT NULL,
        "branch_id" integer NOT NULL,
        "source_indexed_file_id" integer NOT NULL,
        "source_file_hash_id" integer NOT NULL,
        "source_symbol_id" integer,
        "observed_by_job_id" integer,
        "identity_hash" character varying(64) NOT NULL,
        "kind" "public"."code_dependency_kind" NOT NULL,
        "module_specifier" character varying(1024),
        "target_name" character varying(512),
        "local_name" character varying(255),
        "type_only" boolean NOT NULL DEFAULT false,
        "target_indexed_file_id" integer,
        "target_file_hash_id" integer,
        "target_symbol_id" integer,
        "start_line" integer NOT NULL,
        "start_column" integer NOT NULL,
        "start_offset" integer NOT NULL,
        "end_line" integer NOT NULL,
        "end_column" integer NOT NULL,
        "end_offset" integer NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_code_dependencies" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_code_dependencies_identity_hash"
          CHECK ("identity_hash" ~ '^[0-9a-f]{64}$'),
        CONSTRAINT "CHK_code_dependencies_source_range"
          CHECK (
            "start_line" >= 1 AND
            "start_column" >= 1 AND
            "start_offset" >= 0 AND
            "end_line" >= "start_line" AND
            "end_column" >= 1 AND
            ("end_line" > "start_line" OR "end_column" >= "start_column") AND
            "end_offset" >= "start_offset"
          ),
        CONSTRAINT "CHK_code_dependencies_target_symbol_file"
          CHECK (
            "target_symbol_id" IS NULL OR
            (
              "target_indexed_file_id" IS NOT NULL AND
              "target_file_hash_id" IS NOT NULL
            )
          )
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_code_dependencies_source_hash_identity"
      ON "code_dependencies" ("source_file_hash_id", "identity_hash")
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_code_dependencies_organization_repository_kind"
      ON "code_dependencies" ("organization_id", "repository_id", "kind")
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_code_dependencies_branch_id"
      ON "code_dependencies" ("branch_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_code_dependencies_source_indexed_file_id"
      ON "code_dependencies" ("source_indexed_file_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_code_dependencies_source_file_hash_id"
      ON "code_dependencies" ("source_file_hash_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_code_dependencies_source_symbol_id"
      ON "code_dependencies" ("source_symbol_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_code_dependencies_target_indexed_file_id"
      ON "code_dependencies" ("target_indexed_file_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_code_dependencies_target_file_hash_id"
      ON "code_dependencies" ("target_file_hash_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_code_dependencies_target_symbol_id"
      ON "code_dependencies" ("target_symbol_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_code_dependencies_observed_by_job_id"
      ON "code_dependencies" ("observed_by_job_id")
    `);
    await queryRunner.query(`
      ALTER TABLE "code_dependencies"
      ADD CONSTRAINT "FK_code_dependencies_organization_id"
      FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
      ON DELETE RESTRICT ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE "code_dependencies"
      ADD CONSTRAINT "FK_code_dependencies_repository_id"
      FOREIGN KEY ("repository_id") REFERENCES "repositories"("id")
      ON DELETE CASCADE ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE "code_dependencies"
      ADD CONSTRAINT "FK_code_dependencies_branch_id"
      FOREIGN KEY ("branch_id") REFERENCES "repository_branches"("id")
      ON DELETE CASCADE ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE "code_dependencies"
      ADD CONSTRAINT "FK_code_dependencies_source_indexed_file_id"
      FOREIGN KEY ("source_indexed_file_id") REFERENCES "indexed_files"("id")
      ON DELETE CASCADE ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE "code_dependencies"
      ADD CONSTRAINT "FK_code_dependencies_source_file_hash_id"
      FOREIGN KEY ("source_file_hash_id") REFERENCES "file_hashes"("id")
      ON DELETE CASCADE ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE "code_dependencies"
      ADD CONSTRAINT "FK_code_dependencies_source_symbol_id"
      FOREIGN KEY ("source_symbol_id") REFERENCES "code_symbols"("id")
      ON DELETE SET NULL ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE "code_dependencies"
      ADD CONSTRAINT "FK_code_dependencies_target_indexed_file_id"
      FOREIGN KEY ("target_indexed_file_id") REFERENCES "indexed_files"("id")
      ON DELETE SET NULL ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE "code_dependencies"
      ADD CONSTRAINT "FK_code_dependencies_target_file_hash_id"
      FOREIGN KEY ("target_file_hash_id") REFERENCES "file_hashes"("id")
      ON DELETE SET NULL ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE "code_dependencies"
      ADD CONSTRAINT "FK_code_dependencies_target_symbol_id"
      FOREIGN KEY ("target_symbol_id") REFERENCES "code_symbols"("id")
      ON DELETE SET NULL ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE "code_dependencies"
      ADD CONSTRAINT "FK_code_dependencies_observed_by_job_id"
      FOREIGN KEY ("observed_by_job_id") REFERENCES "index_jobs"("id")
      ON DELETE SET NULL ON UPDATE NO ACTION
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "code_dependencies"
      DROP CONSTRAINT "FK_code_dependencies_observed_by_job_id"
    `);
    await queryRunner.query(`
      ALTER TABLE "code_dependencies"
      DROP CONSTRAINT "FK_code_dependencies_target_symbol_id"
    `);
    await queryRunner.query(`
      ALTER TABLE "code_dependencies"
      DROP CONSTRAINT "FK_code_dependencies_target_file_hash_id"
    `);
    await queryRunner.query(`
      ALTER TABLE "code_dependencies"
      DROP CONSTRAINT "FK_code_dependencies_target_indexed_file_id"
    `);
    await queryRunner.query(`
      ALTER TABLE "code_dependencies"
      DROP CONSTRAINT "FK_code_dependencies_source_symbol_id"
    `);
    await queryRunner.query(`
      ALTER TABLE "code_dependencies"
      DROP CONSTRAINT "FK_code_dependencies_source_file_hash_id"
    `);
    await queryRunner.query(`
      ALTER TABLE "code_dependencies"
      DROP CONSTRAINT "FK_code_dependencies_source_indexed_file_id"
    `);
    await queryRunner.query(`
      ALTER TABLE "code_dependencies"
      DROP CONSTRAINT "FK_code_dependencies_branch_id"
    `);
    await queryRunner.query(`
      ALTER TABLE "code_dependencies"
      DROP CONSTRAINT "FK_code_dependencies_repository_id"
    `);
    await queryRunner.query(`
      ALTER TABLE "code_dependencies"
      DROP CONSTRAINT "FK_code_dependencies_organization_id"
    `);
    await queryRunner.query(`DROP TABLE "code_dependencies"`);
    await queryRunner.query(`DROP TYPE "public"."code_dependency_kind"`);
  }
}
