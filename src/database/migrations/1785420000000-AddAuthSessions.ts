import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAuthSessions1785420000000 implements MigrationInterface {
  name = 'AddAuthSessions1785420000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "auth_sessions" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" uuid NOT NULL,
        "organization_id" uuid NOT NULL,
        "refresh_token_hash" character varying(64) NOT NULL,
        "token_version" integer NOT NULL DEFAULT 1,
        "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        "last_used_at" TIMESTAMP WITH TIME ZONE,
        "revoked_at" TIMESTAMP WITH TIME ZONE,
        "revoke_reason" character varying(100),
        "ip_address" character varying(45),
        "user_agent" character varying(512),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_auth_sessions" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_auth_sessions_user_id"
      ON "auth_sessions" ("user_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_auth_sessions_organization_id"
      ON "auth_sessions" ("organization_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_auth_sessions_expires_at"
      ON "auth_sessions" ("expires_at")
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_auth_sessions_refresh_token_hash"
      ON "auth_sessions" ("refresh_token_hash")
    `);
    await queryRunner.query(`
      ALTER TABLE "auth_sessions"
      ADD CONSTRAINT "FK_auth_sessions_user_id"
      FOREIGN KEY ("user_id") REFERENCES "users"("id")
      ON DELETE CASCADE ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE "auth_sessions"
      ADD CONSTRAINT "FK_auth_sessions_organization_id"
      FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
      ON DELETE CASCADE ON UPDATE NO ACTION
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "auth_sessions"
      DROP CONSTRAINT "FK_auth_sessions_organization_id"
    `);
    await queryRunner.query(`
      ALTER TABLE "auth_sessions"
      DROP CONSTRAINT "FK_auth_sessions_user_id"
    `);
    await queryRunner.query(`
      DROP INDEX "public"."uq_auth_sessions_refresh_token_hash"
    `);
    await queryRunner.query(`
      DROP INDEX "public"."idx_auth_sessions_expires_at"
    `);
    await queryRunner.query(`
      DROP INDEX "public"."idx_auth_sessions_organization_id"
    `);
    await queryRunner.query(`
      DROP INDEX "public"."idx_auth_sessions_user_id"
    `);
    await queryRunner.query(`
      DROP TABLE "auth_sessions"
    `);
  }
}
