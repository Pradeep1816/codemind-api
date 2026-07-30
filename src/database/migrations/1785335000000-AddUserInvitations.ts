import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUserInvitations1785335000000 implements MigrationInterface {
  name = 'AddUserInvitations1785335000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TYPE "public"."user_status" RENAME TO "user_status_old"
    `);
    await queryRunner.query(`
      CREATE TYPE "public"."user_status" AS ENUM(
        'invited',
        'active',
        'inactive',
        'suspended'
      )
    `);
    await queryRunner.query(`
      ALTER TABLE "users" ALTER COLUMN "status" DROP DEFAULT
    `);
    await queryRunner.query(`
      ALTER TABLE "users"
      ALTER COLUMN "status" TYPE "public"."user_status"
      USING "status"::text::"public"."user_status"
    `);
    await queryRunner.query(`
      ALTER TABLE "users" ALTER COLUMN "status" SET DEFAULT 'active'
    `);
    await queryRunner.query(`
      DROP TYPE "public"."user_status_old"
    `);
    await queryRunner.query(`
      ALTER TABLE "users" ALTER COLUMN "password_hash" DROP NOT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "users"
      ADD COLUMN "invitation_token_hash" character varying(64)
    `);
    await queryRunner.query(`
      ALTER TABLE "users"
      ADD COLUMN "invitation_expires_at" TIMESTAMP WITH TIME ZONE
    `);
    await queryRunner.query(`
      ALTER TABLE "users" ADD COLUMN "invited_by_user_id" uuid
    `);
    await queryRunner.query(`
      ALTER TABLE "users"
      ADD COLUMN "invitation_accepted_at" TIMESTAMP WITH TIME ZONE
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_users_invitation_token_hash"
      ON "users" ("invitation_token_hash")
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_users_invited_by_user_id"
      ON "users" ("invited_by_user_id")
    `);
    await queryRunner.query(`
      ALTER TABLE "users"
      ADD CONSTRAINT "FK_users_invited_by_user_id"
      FOREIGN KEY ("invited_by_user_id") REFERENCES "users"("id")
      ON DELETE SET NULL ON UPDATE NO ACTION
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "users" SET "status" = 'inactive' WHERE "status" = 'invited'
    `);
    await queryRunner.query(`
      ALTER TABLE "users" DROP CONSTRAINT "FK_users_invited_by_user_id"
    `);
    await queryRunner.query(`
      DROP INDEX "public"."idx_users_invited_by_user_id"
    `);
    await queryRunner.query(`
      DROP INDEX "public"."uq_users_invitation_token_hash"
    `);
    await queryRunner.query(`
      ALTER TABLE "users" DROP COLUMN "invitation_accepted_at"
    `);
    await queryRunner.query(`
      ALTER TABLE "users" DROP COLUMN "invited_by_user_id"
    `);
    await queryRunner.query(`
      ALTER TABLE "users" DROP COLUMN "invitation_expires_at"
    `);
    await queryRunner.query(`
      ALTER TABLE "users" DROP COLUMN "invitation_token_hash"
    `);
    await queryRunner.query(`
      UPDATE "users" SET "password_hash" = '' WHERE "password_hash" IS NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "users" ALTER COLUMN "password_hash" SET NOT NULL
    `);
    await queryRunner.query(`
      ALTER TYPE "public"."user_status" RENAME TO "user_status_old"
    `);
    await queryRunner.query(`
      CREATE TYPE "public"."user_status" AS ENUM(
        'active',
        'inactive',
        'suspended'
      )
    `);
    await queryRunner.query(`
      ALTER TABLE "users" ALTER COLUMN "status" DROP DEFAULT
    `);
    await queryRunner.query(`
      ALTER TABLE "users"
      ALTER COLUMN "status" TYPE "public"."user_status"
      USING "status"::text::"public"."user_status"
    `);
    await queryRunner.query(`
      ALTER TABLE "users" ALTER COLUMN "status" SET DEFAULT 'active'
    `);
    await queryRunner.query(`
      DROP TYPE "public"."user_status_old"
    `);
  }
}
