import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRepositories1785510000000 implements MigrationInterface {
  name = 'AddRepositories1785510000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "public"."repository_provider" AS ENUM(
        'github',
        'gitlab',
        'bitbucket',
        'generic'
      )
    `);
    await queryRunner.query(`
      CREATE TYPE "public"."repository_status" AS ENUM(
        'active',
        'disabled'
      )
    `);
    await queryRunner.query(`
      CREATE TYPE "public"."repository_branch_status" AS ENUM(
        'active',
        'deleted'
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "repositories" (
        "id" SERIAL NOT NULL,
        "organization_id" uuid NOT NULL,
        "created_by_user_id" uuid,
        "name" character varying(160) NOT NULL,
        "provider" "public"."repository_provider" NOT NULL,
        "remote_url" character varying(2048) NOT NULL,
        "default_branch" character varying(255),
        "status" "public"."repository_status" NOT NULL DEFAULT 'active',
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_repositories" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_repositories_organization_remote_url"
      ON "repositories" ("organization_id", "remote_url")
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_repositories_organization_status_created"
      ON "repositories" ("organization_id", "status", "created_at")
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_repositories_created_by_user_id"
      ON "repositories" ("created_by_user_id")
    `);
    await queryRunner.query(`
      ALTER TABLE "repositories"
      ADD CONSTRAINT "FK_repositories_organization_id"
      FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
      ON DELETE RESTRICT ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE "repositories"
      ADD CONSTRAINT "FK_repositories_created_by_user_id"
      FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id")
      ON DELETE SET NULL ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      CREATE TABLE "repository_members" (
        "id" SERIAL NOT NULL,
        "repository_id" integer NOT NULL,
        "user_id" uuid NOT NULL,
        "added_by_user_id" uuid,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_repository_members" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_repository_members_repository_user"
      ON "repository_members" ("repository_id", "user_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_repository_members_user_id"
      ON "repository_members" ("user_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_repository_members_added_by_user_id"
      ON "repository_members" ("added_by_user_id")
    `);
    await queryRunner.query(`
      ALTER TABLE "repository_members"
      ADD CONSTRAINT "FK_repository_members_repository_id"
      FOREIGN KEY ("repository_id") REFERENCES "repositories"("id")
      ON DELETE CASCADE ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE "repository_members"
      ADD CONSTRAINT "FK_repository_members_user_id"
      FOREIGN KEY ("user_id") REFERENCES "users"("id")
      ON DELETE CASCADE ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE "repository_members"
      ADD CONSTRAINT "FK_repository_members_added_by_user_id"
      FOREIGN KEY ("added_by_user_id") REFERENCES "users"("id")
      ON DELETE SET NULL ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      CREATE TABLE "repository_branches" (
        "id" SERIAL NOT NULL,
        "repository_id" integer NOT NULL,
        "name" character varying(255) NOT NULL,
        "commit_sha" character varying(64),
        "status" "public"."repository_branch_status" NOT NULL DEFAULT 'active',
        "last_indexed_at" TIMESTAMP WITH TIME ZONE,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_repository_branches" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_repository_branches_repository_name"
      ON "repository_branches" ("repository_id", "name")
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_repository_branches_repository_status"
      ON "repository_branches" ("repository_id", "status")
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_repository_branches_last_indexed_at"
      ON "repository_branches" ("last_indexed_at")
    `);
    await queryRunner.query(`
      ALTER TABLE "repository_branches"
      ADD CONSTRAINT "FK_repository_branches_repository_id"
      FOREIGN KEY ("repository_id") REFERENCES "repositories"("id")
      ON DELETE CASCADE ON UPDATE NO ACTION
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "repository_branches"
      DROP CONSTRAINT "FK_repository_branches_repository_id"
    `);
    await queryRunner.query(`
      DROP INDEX "public"."idx_repository_branches_last_indexed_at"
    `);
    await queryRunner.query(`
      DROP INDEX "public"."idx_repository_branches_repository_status"
    `);
    await queryRunner.query(`
      DROP INDEX "public"."uq_repository_branches_repository_name"
    `);
    await queryRunner.query(`
      DROP TABLE "repository_branches"
    `);
    await queryRunner.query(`
      ALTER TABLE "repository_members"
      DROP CONSTRAINT "FK_repository_members_added_by_user_id"
    `);
    await queryRunner.query(`
      ALTER TABLE "repository_members"
      DROP CONSTRAINT "FK_repository_members_user_id"
    `);
    await queryRunner.query(`
      ALTER TABLE "repository_members"
      DROP CONSTRAINT "FK_repository_members_repository_id"
    `);
    await queryRunner.query(`
      DROP INDEX "public"."idx_repository_members_added_by_user_id"
    `);
    await queryRunner.query(`
      DROP INDEX "public"."idx_repository_members_user_id"
    `);
    await queryRunner.query(`
      DROP INDEX "public"."uq_repository_members_repository_user"
    `);
    await queryRunner.query(`
      DROP TABLE "repository_members"
    `);
    await queryRunner.query(`
      ALTER TABLE "repositories"
      DROP CONSTRAINT "FK_repositories_created_by_user_id"
    `);
    await queryRunner.query(`
      ALTER TABLE "repositories"
      DROP CONSTRAINT "FK_repositories_organization_id"
    `);
    await queryRunner.query(`
      DROP INDEX "public"."idx_repositories_created_by_user_id"
    `);
    await queryRunner.query(`
      DROP INDEX "public"."idx_repositories_organization_status_created"
    `);
    await queryRunner.query(`
      DROP INDEX "public"."uq_repositories_organization_remote_url"
    `);
    await queryRunner.query(`
      DROP TABLE "repositories"
    `);
    await queryRunner.query(`
      DROP TYPE "public"."repository_status"
    `);
    await queryRunner.query(`
      DROP TYPE "public"."repository_branch_status"
    `);
    await queryRunner.query(`
      DROP TYPE "public"."repository_provider"
    `);
  }
}
