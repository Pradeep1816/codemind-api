import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAuthAuditEvents1785425000000 implements MigrationInterface {
  name = 'AddAuthAuditEvents1785425000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "auth_audit_events" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "organization_id" uuid,
        "actor_user_id" uuid,
        "subject_user_id" uuid,
        "session_id" uuid,
        "event_type" character varying(80) NOT NULL,
        "outcome" character varying(20) NOT NULL,
        "ip_address" character varying(45),
        "user_agent" character varying(512),
        "metadata" jsonb,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_auth_audit_events" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_auth_audit_events_organization_created"
      ON "auth_audit_events" ("organization_id", "created_at")
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_auth_audit_events_actor_user_id"
      ON "auth_audit_events" ("actor_user_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_auth_audit_events_subject_user_id"
      ON "auth_audit_events" ("subject_user_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_auth_audit_events_event_type_created"
      ON "auth_audit_events" ("event_type", "created_at")
    `);
    await queryRunner.query(`
      ALTER TABLE "auth_audit_events"
      ADD CONSTRAINT "FK_auth_audit_events_organization_id"
      FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
      ON DELETE SET NULL ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE "auth_audit_events"
      ADD CONSTRAINT "FK_auth_audit_events_actor_user_id"
      FOREIGN KEY ("actor_user_id") REFERENCES "users"("id")
      ON DELETE SET NULL ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE "auth_audit_events"
      ADD CONSTRAINT "FK_auth_audit_events_subject_user_id"
      FOREIGN KEY ("subject_user_id") REFERENCES "users"("id")
      ON DELETE SET NULL ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE "auth_audit_events"
      ADD CONSTRAINT "FK_auth_audit_events_session_id"
      FOREIGN KEY ("session_id") REFERENCES "auth_sessions"("id")
      ON DELETE SET NULL ON UPDATE NO ACTION
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "auth_audit_events"
      DROP CONSTRAINT "FK_auth_audit_events_session_id"
    `);
    await queryRunner.query(`
      ALTER TABLE "auth_audit_events"
      DROP CONSTRAINT "FK_auth_audit_events_subject_user_id"
    `);
    await queryRunner.query(`
      ALTER TABLE "auth_audit_events"
      DROP CONSTRAINT "FK_auth_audit_events_actor_user_id"
    `);
    await queryRunner.query(`
      ALTER TABLE "auth_audit_events"
      DROP CONSTRAINT "FK_auth_audit_events_organization_id"
    `);
    await queryRunner.query(`
      DROP INDEX "public"."idx_auth_audit_events_event_type_created"
    `);
    await queryRunner.query(`
      DROP INDEX "public"."idx_auth_audit_events_subject_user_id"
    `);
    await queryRunner.query(`
      DROP INDEX "public"."idx_auth_audit_events_actor_user_id"
    `);
    await queryRunner.query(`
      DROP INDEX "public"."idx_auth_audit_events_organization_created"
    `);
    await queryRunner.query(`
      DROP TABLE "auth_audit_events"
    `);
  }
}
