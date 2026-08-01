import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRepositoryHealth1785600000000 implements MigrationInterface {
  name = 'AddRepositoryHealth1785600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "public"."repository_sync_status" AS ENUM(
        'never',
        'succeeded',
        'failed'
      )
    `);
    await queryRunner.query(`
      ALTER TABLE "repositories"
      ADD "last_sync_status" "public"."repository_sync_status"
      NOT NULL DEFAULT 'never'
    `);
    await queryRunner.query(`
      ALTER TABLE "repositories"
      ADD "last_sync_attempted_at" TIMESTAMP WITH TIME ZONE
    `);
    await queryRunner.query(`
      ALTER TABLE "repositories"
      ADD "last_synced_at" TIMESTAMP WITH TIME ZONE
    `);
    await queryRunner.query(`
      ALTER TABLE "repositories"
      ADD "repository_size_bytes" bigint
    `);
    await queryRunner.query(`
      ALTER TABLE "repositories"
      ADD CONSTRAINT "CHK_repositories_repository_size_bytes"
      CHECK (
        "repository_size_bytes" IS NULL OR
        "repository_size_bytes" BETWEEN 0 AND 9007199254740991
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_repositories_organization_sync_status"
      ON "repositories" ("organization_id", "last_sync_status")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX "public"."idx_repositories_organization_sync_status"
    `);
    await queryRunner.query(`
      ALTER TABLE "repositories"
      DROP CONSTRAINT "CHK_repositories_repository_size_bytes"
    `);
    await queryRunner.query(`
      ALTER TABLE "repositories"
      DROP COLUMN "repository_size_bytes"
    `);
    await queryRunner.query(`
      ALTER TABLE "repositories"
      DROP COLUMN "last_synced_at"
    `);
    await queryRunner.query(`
      ALTER TABLE "repositories"
      DROP COLUMN "last_sync_attempted_at"
    `);
    await queryRunner.query(`
      ALTER TABLE "repositories"
      DROP COLUMN "last_sync_status"
    `);
    await queryRunner.query(`
      DROP TYPE "public"."repository_sync_status"
    `);
  }
}
