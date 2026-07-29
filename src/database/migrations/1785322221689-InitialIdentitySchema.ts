import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialIdentitySchema1785322221689 implements MigrationInterface {
  name = 'InitialIdentitySchema1785322221689';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            CREATE EXTENSION IF NOT EXISTS "uuid-ossp"
        `);
    await queryRunner.query(`
            CREATE TABLE "permissions" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "name" character varying(120) NOT NULL,
                "resource" character varying(64) NOT NULL,
                "action" character varying(64) NOT NULL,
                "description" character varying(255),
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "PK_920331560282b8bd21bb02290df" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE UNIQUE INDEX "uq_permissions_resource_action" ON "permissions" ("resource", "action")
        `);
    await queryRunner.query(`
            CREATE UNIQUE INDEX "uq_permissions_name" ON "permissions" ("name")
        `);
    await queryRunner.query(`
            CREATE TABLE "role_permissions" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "role_id" uuid NOT NULL,
                "permission_id" uuid NOT NULL,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "PK_84059017c90bfcb701b8fa42297" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE UNIQUE INDEX "uq_role_permissions_role_permission" ON "role_permissions" ("role_id", "permission_id")
        `);
    await queryRunner.query(`
            CREATE INDEX "idx_role_permissions_permission_id" ON "role_permissions" ("permission_id")
        `);
    await queryRunner.query(`
            CREATE TYPE "public"."user_status" AS ENUM('active', 'inactive', 'suspended')
        `);
    await queryRunner.query(`
            CREATE TABLE "users" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "organization_id" uuid NOT NULL,
                "email" character varying(320) NOT NULL,
                "password_hash" character varying(255) NOT NULL,
                "name" character varying(150) NOT NULL,
                "status" "public"."user_status" NOT NULL DEFAULT 'active',
                "last_login_at" TIMESTAMP WITH TIME ZONE,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE UNIQUE INDEX "uq_users_email" ON "users" ("email")
        `);
    await queryRunner.query(`
            CREATE INDEX "idx_users_organization_id" ON "users" ("organization_id")
        `);
    await queryRunner.query(`
            CREATE TABLE "user_roles" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "user_id" uuid NOT NULL,
                "role_id" uuid NOT NULL,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "PK_8acd5cf26ebd158416f477de799" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE UNIQUE INDEX "uq_user_roles_user_role" ON "user_roles" ("user_id", "role_id")
        `);
    await queryRunner.query(`
            CREATE INDEX "idx_user_roles_role_id" ON "user_roles" ("role_id")
        `);
    await queryRunner.query(`
            CREATE TABLE "roles" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "organization_id" uuid NOT NULL,
                "name" character varying(64) NOT NULL,
                "description" character varying(255),
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "PK_c1433d71a4838793a49dcad46ab" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE UNIQUE INDEX "uq_roles_organization_name" ON "roles" ("organization_id", "name")
        `);
    await queryRunner.query(`
            CREATE TYPE "public"."organization_plan" AS ENUM('free', 'team', 'enterprise')
        `);
    await queryRunner.query(`
            CREATE TYPE "public"."organization_status" AS ENUM('active', 'inactive', 'suspended')
        `);
    await queryRunner.query(`
            CREATE TABLE "organizations" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "name" character varying(160) NOT NULL,
                "slug" character varying(100) NOT NULL,
                "plan" "public"."organization_plan" NOT NULL DEFAULT 'free',
                "status" "public"."organization_status" NOT NULL DEFAULT 'active',
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "PK_6b031fcd0863e3f6b44230163f9" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE UNIQUE INDEX "uq_organizations_slug" ON "organizations" ("slug")
        `);
    await queryRunner.query(`
            ALTER TABLE "role_permissions"
            ADD CONSTRAINT "FK_178199805b901ccd220ab7740ec" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "role_permissions"
            ADD CONSTRAINT "FK_17022daf3f885f7d35423e9971e" FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "users"
            ADD CONSTRAINT "FK_21a659804ed7bf61eb91688dea7" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "user_roles"
            ADD CONSTRAINT "FK_87b8888186ca9769c960e926870" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "user_roles"
            ADD CONSTRAINT "FK_b23c65e50a758245a33ee35fda1" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "roles"
            ADD CONSTRAINT "FK_c328a1ecd12a5f153a96df4509e" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE "roles" DROP CONSTRAINT "FK_c328a1ecd12a5f153a96df4509e"
        `);
    await queryRunner.query(`
            ALTER TABLE "user_roles" DROP CONSTRAINT "FK_b23c65e50a758245a33ee35fda1"
        `);
    await queryRunner.query(`
            ALTER TABLE "user_roles" DROP CONSTRAINT "FK_87b8888186ca9769c960e926870"
        `);
    await queryRunner.query(`
            ALTER TABLE "users" DROP CONSTRAINT "FK_21a659804ed7bf61eb91688dea7"
        `);
    await queryRunner.query(`
            ALTER TABLE "role_permissions" DROP CONSTRAINT "FK_17022daf3f885f7d35423e9971e"
        `);
    await queryRunner.query(`
            ALTER TABLE "role_permissions" DROP CONSTRAINT "FK_178199805b901ccd220ab7740ec"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."uq_organizations_slug"
        `);
    await queryRunner.query(`
            DROP TABLE "organizations"
        `);
    await queryRunner.query(`
            DROP TYPE "public"."organization_status"
        `);
    await queryRunner.query(`
            DROP TYPE "public"."organization_plan"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."uq_roles_organization_name"
        `);
    await queryRunner.query(`
            DROP TABLE "roles"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."uq_user_roles_user_role"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."idx_user_roles_role_id"
        `);
    await queryRunner.query(`
            DROP TABLE "user_roles"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."uq_users_email"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."idx_users_organization_id"
        `);
    await queryRunner.query(`
            DROP TABLE "users"
        `);
    await queryRunner.query(`
            DROP TYPE "public"."user_status"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."uq_role_permissions_role_permission"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."idx_role_permissions_permission_id"
        `);
    await queryRunner.query(`
            DROP TABLE "role_permissions"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."uq_permissions_name"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."uq_permissions_resource_action"
        `);
    await queryRunner.query(`
            DROP TABLE "permissions"
        `);
  }
}
