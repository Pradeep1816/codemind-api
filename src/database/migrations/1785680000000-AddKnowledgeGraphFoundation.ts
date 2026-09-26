import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddKnowledgeGraphFoundation1785680000000 implements MigrationInterface {
  name = 'AddKnowledgeGraphFoundation1785680000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const statements = [
      `CREATE TYPE "public"."knowledge_build_trigger" AS ENUM('manual', 'indexing_completed')`,
      `CREATE TYPE "public"."knowledge_build_status" AS ENUM('queued', 'running', 'succeeded', 'failed', 'cancelled')`,
      `CREATE TYPE "public"."knowledge_build_phase" AS ENUM('queued', 'preparing', 'analyzing', 'validating', 'publishing', 'finished')`,
      `CREATE TYPE "public"."knowledge_snapshot_status" AS ENUM('draft', 'published')`,
      `CREATE TYPE "public"."knowledge_node_kind" AS ENUM(
        'architectural_component', 'domain_concept', 'business_rule',
        'workflow', 'workflow_step', 'state', 'state_transition',
        'domain_event', 'event_handler'
      )`,
      `CREATE TYPE "public"."knowledge_edge_kind" AS ENUM(
        'contains', 'depends_on', 'calls', 'handles', 'represents',
        'enforces', 'triggers', 'precedes', 'transitions_to'
      )`,
      `CREATE TYPE "public"."knowledge_derivation_type" AS ENUM(
        'deterministic', 'heuristic', 'ai_assisted', 'human_confirmed'
      )`,
      `CREATE TYPE "public"."knowledge_evidence_role" AS ENUM(
        'declaration', 'call_site', 'decorator', 'injection', 'condition',
        'assignment', 'configuration', 'import', 'export', 'inheritance',
        'event_publication', 'event_handler'
      )`,
      `CREATE TABLE "knowledge_builds" (
        "id" SERIAL NOT NULL,
        "organization_id" uuid NOT NULL,
        "repository_id" integer NOT NULL,
        "branch_id" integer NOT NULL,
        "source_index_job_id" integer NOT NULL,
        "requested_by_user_id" uuid,
        "trigger" "public"."knowledge_build_trigger" NOT NULL DEFAULT 'manual',
        "status" "public"."knowledge_build_status" NOT NULL DEFAULT 'queued',
        "phase" "public"."knowledge_build_phase" NOT NULL DEFAULT 'queued',
        "target_commit_sha" character varying(64) NOT NULL,
        "analyzer_bundle_version" character varying(100) NOT NULL,
        "configuration_digest" character varying(64) NOT NULL,
        "total_files" integer NOT NULL DEFAULT 0,
        "processed_files" integer NOT NULL DEFAULT 0,
        "failed_files" integer NOT NULL DEFAULT 0,
        "emitted_facts" integer NOT NULL DEFAULT 0,
        "persisted_nodes" integer NOT NULL DEFAULT 0,
        "persisted_edges" integer NOT NULL DEFAULT 0,
        "attempt_count" integer NOT NULL DEFAULT 0,
        "max_attempts" integer NOT NULL DEFAULT 3,
        "claimed_by" character varying(200),
        "lease_token" uuid,
        "failure_code" character varying(100),
        "failure_message" character varying(1000),
        "current_file" character varying(1024),
        "started_at" TIMESTAMP WITH TIME ZONE,
        "completed_at" TIMESTAMP WITH TIME ZONE,
        "last_heartbeat_at" TIMESTAMP WITH TIME ZONE,
        "lease_expires_at" TIMESTAMP WITH TIME ZONE,
        "next_attempt_at" TIMESTAMP WITH TIME ZONE,
        "cancellation_requested_at" TIMESTAMP WITH TIME ZONE,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_knowledge_builds" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_knowledge_builds_progress" CHECK (
          "total_files" >= 0 AND "processed_files" >= 0 AND
          "failed_files" >= 0 AND
          ("processed_files" + "failed_files") <= "total_files" AND
          "emitted_facts" >= 0 AND "persisted_nodes" >= 0 AND
          "persisted_edges" >= 0
        ),
        CONSTRAINT "CHK_knowledge_builds_attempt_limit" CHECK (
          "attempt_count" >= 0 AND "max_attempts" >= 1 AND
          "attempt_count" <= "max_attempts"
        ),
        CONSTRAINT "CHK_knowledge_builds_target_commit_sha" CHECK (
          "target_commit_sha" ~ '^[0-9a-f]{40}([0-9a-f]{24})?$'
        ),
        CONSTRAINT "CHK_knowledge_builds_configuration_digest" CHECK (
          "configuration_digest" ~ '^[0-9a-f]{64}$'
        ),
        CONSTRAINT "CHK_knowledge_builds_lease_state" CHECK (
          (
            "status" = 'running' AND "claimed_by" IS NOT NULL AND
            "lease_token" IS NOT NULL AND "last_heartbeat_at" IS NOT NULL AND
            "lease_expires_at" IS NOT NULL
          ) OR (
            "status" <> 'running' AND "claimed_by" IS NULL AND
            "lease_token" IS NULL AND "last_heartbeat_at" IS NULL AND
            "lease_expires_at" IS NULL
          )
        ),
        CONSTRAINT "CHK_knowledge_builds_status_phase" CHECK (
          ("status" = 'queued' AND "phase" = 'queued') OR
          (
            "status" = 'running' AND
            "phase" IN ('preparing', 'analyzing', 'validating', 'publishing')
          ) OR (
            "status" IN ('succeeded', 'failed', 'cancelled') AND
            "phase" = 'finished'
          )
        ),
        CONSTRAINT "CHK_knowledge_builds_current_file_state" CHECK (
          "status" = 'running' OR "current_file" IS NULL
        )
      )`,
      `CREATE TABLE "knowledge_snapshots" (
        "id" SERIAL NOT NULL,
        "organization_id" uuid NOT NULL,
        "repository_id" integer NOT NULL,
        "branch_id" integer NOT NULL,
        "knowledge_build_id" integer NOT NULL,
        "source_index_job_id" integer NOT NULL,
        "target_commit_sha" character varying(64) NOT NULL,
        "analyzer_bundle_version" character varying(100) NOT NULL,
        "configuration_digest" character varying(64) NOT NULL,
        "status" "public"."knowledge_snapshot_status" NOT NULL DEFAULT 'draft',
        "is_current" boolean NOT NULL DEFAULT false,
        "published_at" TIMESTAMP WITH TIME ZONE,
        "superseded_at" TIMESTAMP WITH TIME ZONE,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_knowledge_snapshots" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_knowledge_snapshots_configuration_digest" CHECK (
          "configuration_digest" ~ '^[0-9a-f]{64}$'
        ),
        CONSTRAINT "CHK_knowledge_snapshots_target_commit_sha" CHECK (
          "target_commit_sha" ~ '^[0-9a-f]{40}([0-9a-f]{24})?$'
        ),
        CONSTRAINT "CHK_knowledge_snapshots_publication_state" CHECK (
          (
            "status" = 'draft' AND "is_current" = false AND
            "published_at" IS NULL AND "superseded_at" IS NULL
          ) OR (
            "status" = 'published' AND "published_at" IS NOT NULL AND
            (
              ("is_current" = true AND "superseded_at" IS NULL) OR
              "is_current" = false
            )
          )
        )
      )`,
      `CREATE TABLE "knowledge_nodes" (
        "id" SERIAL NOT NULL,
        "organization_id" uuid NOT NULL,
        "repository_id" integer NOT NULL,
        "branch_id" integer NOT NULL,
        "snapshot_id" integer NOT NULL,
        "identity_key" character varying(512) NOT NULL,
        "kind" "public"."knowledge_node_kind" NOT NULL,
        "name" character varying(512) NOT NULL,
        "summary" character varying(4000),
        "derivation_type" "public"."knowledge_derivation_type" NOT NULL,
        "confidence" numeric(5,4) NOT NULL,
        "analyzer_name" character varying(100) NOT NULL,
        "analyzer_version" character varying(100) NOT NULL,
        "content_fingerprint" character varying(64) NOT NULL,
        "property_schema_version" integer NOT NULL DEFAULT 1,
        "properties" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_knowledge_nodes" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_knowledge_nodes_confidence" CHECK (
          "confidence" >= 0 AND "confidence" <= 1
        ),
        CONSTRAINT "CHK_knowledge_nodes_content_fingerprint" CHECK (
          "content_fingerprint" ~ '^[0-9a-f]{64}$'
        ),
        CONSTRAINT "CHK_knowledge_nodes_property_schema_version" CHECK (
          "property_schema_version" >= 1
        )
      )`,
      `CREATE TABLE "knowledge_edges" (
        "id" SERIAL NOT NULL,
        "organization_id" uuid NOT NULL,
        "repository_id" integer NOT NULL,
        "branch_id" integer NOT NULL,
        "snapshot_id" integer NOT NULL,
        "source_node_id" integer NOT NULL,
        "target_node_id" integer NOT NULL,
        "identity_key" character varying(512) NOT NULL,
        "kind" "public"."knowledge_edge_kind" NOT NULL,
        "derivation_type" "public"."knowledge_derivation_type" NOT NULL,
        "confidence" numeric(5,4) NOT NULL,
        "analyzer_name" character varying(100) NOT NULL,
        "analyzer_version" character varying(100) NOT NULL,
        "content_fingerprint" character varying(64) NOT NULL,
        "property_schema_version" integer NOT NULL DEFAULT 1,
        "properties" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_knowledge_edges" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_knowledge_edges_confidence" CHECK (
          "confidence" >= 0 AND "confidence" <= 1
        ),
        CONSTRAINT "CHK_knowledge_edges_content_fingerprint" CHECK (
          "content_fingerprint" ~ '^[0-9a-f]{64}$'
        ),
        CONSTRAINT "CHK_knowledge_edges_property_schema_version" CHECK (
          "property_schema_version" >= 1
        ),
        CONSTRAINT "CHK_knowledge_edges_self_reference" CHECK (
          "source_node_id" <> "target_node_id" OR
          "kind" IN ('calls', 'depends_on', 'transitions_to')
        )
      )`,
      `CREATE TABLE "knowledge_evidence" (
        "id" SERIAL NOT NULL,
        "organization_id" uuid NOT NULL,
        "repository_id" integer NOT NULL,
        "branch_id" integer NOT NULL,
        "snapshot_id" integer NOT NULL,
        "indexed_file_id" integer NOT NULL,
        "file_hash_id" integer NOT NULL,
        "code_symbol_id" integer,
        "identity_hash" character varying(64) NOT NULL,
        "role" "public"."knowledge_evidence_role" NOT NULL,
        "start_line" integer,
        "start_column" integer,
        "start_offset" integer,
        "end_line" integer,
        "end_column" integer,
        "end_offset" integer,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_knowledge_evidence" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_knowledge_evidence_identity_hash" CHECK (
          "identity_hash" ~ '^[0-9a-f]{64}$'
        ),
        CONSTRAINT "CHK_knowledge_evidence_source_range" CHECK (
          (
            "start_line" IS NULL AND "start_column" IS NULL AND
            "start_offset" IS NULL AND "end_line" IS NULL AND
            "end_column" IS NULL AND "end_offset" IS NULL
          ) OR (
            "start_line" >= 1 AND "start_column" >= 1 AND
            "start_offset" >= 0 AND "end_line" >= "start_line" AND
            "end_column" >= 1 AND
            ("end_line" > "start_line" OR "end_column" >= "start_column") AND
            "end_offset" >= "start_offset"
          )
        )
      )`,
      `CREATE TABLE "knowledge_node_evidence" (
        "knowledge_node_id" integer NOT NULL,
        "knowledge_evidence_id" integer NOT NULL,
        CONSTRAINT "PK_knowledge_node_evidence"
          PRIMARY KEY ("knowledge_node_id", "knowledge_evidence_id")
      )`,
      `CREATE TABLE "knowledge_edge_evidence" (
        "knowledge_edge_id" integer NOT NULL,
        "knowledge_evidence_id" integer NOT NULL,
        CONSTRAINT "PK_knowledge_edge_evidence"
          PRIMARY KEY ("knowledge_edge_id", "knowledge_evidence_id")
      )`,
      `CREATE TABLE "knowledge_build_errors" (
        "id" SERIAL NOT NULL,
        "organization_id" uuid NOT NULL,
        "repository_id" integer NOT NULL,
        "knowledge_build_id" integer NOT NULL,
        "knowledge_evidence_id" integer,
        "phase" "public"."knowledge_build_phase" NOT NULL,
        "analyzer_name" character varying(100),
        "analyzer_version" character varying(100),
        "code" character varying(100) NOT NULL,
        "message" character varying(1000) NOT NULL,
        "retryable" boolean NOT NULL DEFAULT false,
        "attempt_number" integer NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_knowledge_build_errors" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_knowledge_build_errors_attempt_number"
          CHECK ("attempt_number" >= 1)
      )`,
    ];

    for (const statement of statements) {
      await queryRunner.query(statement);
    }

    await this.createIndexes(queryRunner);
    await this.createForeignKeys(queryRunner);
    await this.createScopeTriggers(queryRunner);
  }

  private async createIndexes(queryRunner: QueryRunner): Promise<void> {
    const statements = [
      `CREATE UNIQUE INDEX "uq_knowledge_builds_active_repository_branch"
       ON "knowledge_builds" ("repository_id", "branch_id")
       WHERE "status" IN ('queued', 'running')`,
      `CREATE INDEX "idx_knowledge_builds_organization_repository_created"
       ON "knowledge_builds" ("organization_id", "repository_id", "created_at")`,
      `CREATE INDEX "idx_knowledge_builds_organization_status_created"
       ON "knowledge_builds" ("organization_id", "status", "created_at")`,
      `CREATE INDEX "idx_knowledge_builds_source_index_job_id"
       ON "knowledge_builds" ("source_index_job_id")`,
      `CREATE INDEX "idx_knowledge_builds_requested_by_user_id"
       ON "knowledge_builds" ("requested_by_user_id")`,
      `CREATE INDEX "idx_knowledge_builds_claimable"
       ON "knowledge_builds" ("status", "next_attempt_at", "created_at")
       WHERE "status" = 'queued'`,
      `CREATE INDEX "idx_knowledge_builds_expired_lease"
       ON "knowledge_builds" ("lease_expires_at")
       WHERE "status" = 'running'`,
      `CREATE UNIQUE INDEX "uq_knowledge_builds_lease_token"
       ON "knowledge_builds" ("lease_token") WHERE "lease_token" IS NOT NULL`,
      `CREATE UNIQUE INDEX "uq_knowledge_snapshots_build_id"
       ON "knowledge_snapshots" ("knowledge_build_id")`,
      `CREATE UNIQUE INDEX "uq_knowledge_snapshots_branch_commit_analyzer_configuration"
       ON "knowledge_snapshots" (
         "branch_id", "target_commit_sha", "analyzer_bundle_version",
         "configuration_digest"
       )`,
      `CREATE UNIQUE INDEX "uq_knowledge_snapshots_current_branch"
       ON "knowledge_snapshots" ("branch_id") WHERE "is_current" = true`,
      `CREATE INDEX "idx_knowledge_snapshots_organization_repository_created"
       ON "knowledge_snapshots" ("organization_id", "repository_id", "created_at")`,
      `CREATE INDEX "idx_knowledge_snapshots_source_index_job_id"
       ON "knowledge_snapshots" ("source_index_job_id")`,
      `CREATE UNIQUE INDEX "uq_knowledge_nodes_snapshot_kind_identity"
       ON "knowledge_nodes" ("snapshot_id", "kind", "identity_key")`,
      `CREATE INDEX "idx_knowledge_nodes_snapshot_kind_name"
       ON "knowledge_nodes" ("snapshot_id", "kind", "name")`,
      `CREATE INDEX "idx_knowledge_nodes_organization_repository_kind"
       ON "knowledge_nodes" ("organization_id", "repository_id", "kind")`,
      `CREATE INDEX "idx_knowledge_nodes_analyzer_fingerprint"
       ON "knowledge_nodes" (
         "analyzer_name", "analyzer_version", "content_fingerprint"
       )`,
      `CREATE UNIQUE INDEX "uq_knowledge_edges_snapshot_kind_identity"
       ON "knowledge_edges" ("snapshot_id", "kind", "identity_key")`,
      `CREATE INDEX "idx_knowledge_edges_snapshot_source_kind"
       ON "knowledge_edges" ("snapshot_id", "source_node_id", "kind")`,
      `CREATE INDEX "idx_knowledge_edges_snapshot_target_kind"
       ON "knowledge_edges" ("snapshot_id", "target_node_id", "kind")`,
      `CREATE INDEX "idx_knowledge_edges_organization_repository_kind"
       ON "knowledge_edges" ("organization_id", "repository_id", "kind")`,
      `CREATE INDEX "idx_knowledge_edges_analyzer_fingerprint"
       ON "knowledge_edges" (
         "analyzer_name", "analyzer_version", "content_fingerprint"
       )`,
      `CREATE UNIQUE INDEX "uq_knowledge_evidence_snapshot_identity"
       ON "knowledge_evidence" ("snapshot_id", "identity_hash")`,
      `CREATE INDEX "idx_knowledge_evidence_snapshot_file_hash"
       ON "knowledge_evidence" ("snapshot_id", "file_hash_id")`,
      `CREATE INDEX "idx_knowledge_evidence_code_symbol_id"
       ON "knowledge_evidence" ("code_symbol_id")`,
      `CREATE INDEX "idx_knowledge_evidence_organization_repository_role"
       ON "knowledge_evidence" ("organization_id", "repository_id", "role")`,
      `CREATE INDEX "idx_knowledge_node_evidence_evidence_id"
       ON "knowledge_node_evidence" ("knowledge_evidence_id")`,
      `CREATE INDEX "idx_knowledge_edge_evidence_evidence_id"
       ON "knowledge_edge_evidence" ("knowledge_evidence_id")`,
      `CREATE INDEX "idx_knowledge_build_errors_build_created"
       ON "knowledge_build_errors" ("knowledge_build_id", "created_at")`,
      `CREATE INDEX "idx_knowledge_build_errors_evidence_id"
       ON "knowledge_build_errors" ("knowledge_evidence_id")`,
      `CREATE INDEX "idx_knowledge_build_errors_organization_repository"
       ON "knowledge_build_errors" ("organization_id", "repository_id")`,
    ];

    for (const statement of statements) {
      await queryRunner.query(statement);
    }
  }

  private async createForeignKeys(queryRunner: QueryRunner): Promise<void> {
    const statements = [
      this.foreignKey(
        'knowledge_builds',
        'organization_id',
        'organizations',
        'id',
        'RESTRICT',
      ),
      this.foreignKey(
        'knowledge_builds',
        'repository_id',
        'repositories',
        'id',
        'CASCADE',
      ),
      this.foreignKey(
        'knowledge_builds',
        'branch_id',
        'repository_branches',
        'id',
        'CASCADE',
      ),
      this.foreignKey(
        'knowledge_builds',
        'source_index_job_id',
        'index_jobs',
        'id',
        'CASCADE',
      ),
      this.foreignKey(
        'knowledge_builds',
        'requested_by_user_id',
        'users',
        'id',
        'SET NULL',
      ),
      this.foreignKey(
        'knowledge_snapshots',
        'organization_id',
        'organizations',
        'id',
        'RESTRICT',
      ),
      this.foreignKey(
        'knowledge_snapshots',
        'repository_id',
        'repositories',
        'id',
        'CASCADE',
      ),
      this.foreignKey(
        'knowledge_snapshots',
        'branch_id',
        'repository_branches',
        'id',
        'CASCADE',
      ),
      this.foreignKey(
        'knowledge_snapshots',
        'knowledge_build_id',
        'knowledge_builds',
        'id',
        'CASCADE',
        'build_id',
      ),
      this.foreignKey(
        'knowledge_snapshots',
        'source_index_job_id',
        'index_jobs',
        'id',
        'CASCADE',
      ),
      this.foreignKey(
        'knowledge_nodes',
        'organization_id',
        'organizations',
        'id',
        'RESTRICT',
      ),
      this.foreignKey(
        'knowledge_nodes',
        'repository_id',
        'repositories',
        'id',
        'CASCADE',
      ),
      this.foreignKey(
        'knowledge_nodes',
        'branch_id',
        'repository_branches',
        'id',
        'CASCADE',
      ),
      this.foreignKey(
        'knowledge_nodes',
        'snapshot_id',
        'knowledge_snapshots',
        'id',
        'CASCADE',
      ),
      this.foreignKey(
        'knowledge_edges',
        'organization_id',
        'organizations',
        'id',
        'RESTRICT',
      ),
      this.foreignKey(
        'knowledge_edges',
        'repository_id',
        'repositories',
        'id',
        'CASCADE',
      ),
      this.foreignKey(
        'knowledge_edges',
        'branch_id',
        'repository_branches',
        'id',
        'CASCADE',
      ),
      this.foreignKey(
        'knowledge_edges',
        'snapshot_id',
        'knowledge_snapshots',
        'id',
        'CASCADE',
      ),
      this.foreignKey(
        'knowledge_edges',
        'source_node_id',
        'knowledge_nodes',
        'id',
        'CASCADE',
      ),
      this.foreignKey(
        'knowledge_edges',
        'target_node_id',
        'knowledge_nodes',
        'id',
        'CASCADE',
      ),
      this.foreignKey(
        'knowledge_evidence',
        'organization_id',
        'organizations',
        'id',
        'RESTRICT',
      ),
      this.foreignKey(
        'knowledge_evidence',
        'repository_id',
        'repositories',
        'id',
        'CASCADE',
      ),
      this.foreignKey(
        'knowledge_evidence',
        'branch_id',
        'repository_branches',
        'id',
        'CASCADE',
      ),
      this.foreignKey(
        'knowledge_evidence',
        'snapshot_id',
        'knowledge_snapshots',
        'id',
        'CASCADE',
      ),
      this.foreignKey(
        'knowledge_evidence',
        'indexed_file_id',
        'indexed_files',
        'id',
        'RESTRICT',
      ),
      this.foreignKey(
        'knowledge_evidence',
        'file_hash_id',
        'file_hashes',
        'id',
        'RESTRICT',
      ),
      this.foreignKey(
        'knowledge_evidence',
        'code_symbol_id',
        'code_symbols',
        'id',
        'RESTRICT',
      ),
      this.foreignKey(
        'knowledge_node_evidence',
        'knowledge_node_id',
        'knowledge_nodes',
        'id',
        'CASCADE',
        'node_id',
      ),
      this.foreignKey(
        'knowledge_node_evidence',
        'knowledge_evidence_id',
        'knowledge_evidence',
        'id',
        'CASCADE',
        'evidence_id',
      ),
      this.foreignKey(
        'knowledge_edge_evidence',
        'knowledge_edge_id',
        'knowledge_edges',
        'id',
        'CASCADE',
        'edge_id',
      ),
      this.foreignKey(
        'knowledge_edge_evidence',
        'knowledge_evidence_id',
        'knowledge_evidence',
        'id',
        'CASCADE',
        'evidence_id',
      ),
      this.foreignKey(
        'knowledge_build_errors',
        'organization_id',
        'organizations',
        'id',
        'RESTRICT',
      ),
      this.foreignKey(
        'knowledge_build_errors',
        'repository_id',
        'repositories',
        'id',
        'CASCADE',
      ),
      this.foreignKey(
        'knowledge_build_errors',
        'knowledge_build_id',
        'knowledge_builds',
        'id',
        'CASCADE',
        'build_id',
      ),
      this.foreignKey(
        'knowledge_build_errors',
        'knowledge_evidence_id',
        'knowledge_evidence',
        'id',
        'SET NULL',
        'evidence_id',
      ),
    ];

    for (const statement of statements) {
      await queryRunner.query(statement);
    }
  }

  private async createScopeTriggers(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE FUNCTION "validate_knowledge_build_scope"()
      RETURNS trigger AS $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM "index_jobs" job
          WHERE job."id" = NEW."source_index_job_id"
            AND job."organization_id" = NEW."organization_id"
            AND job."repository_id" = NEW."repository_id"
            AND job."branch_id" = NEW."branch_id"
            AND job."target_commit_sha" = NEW."target_commit_sha"
            AND job."status" = 'succeeded'
        ) THEN
          RAISE EXCEPTION 'knowledge build source index job scope is invalid'
            USING ERRCODE = '23514';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);
    await queryRunner.query(`
      CREATE TRIGGER "TRG_validate_knowledge_build_scope"
      BEFORE INSERT OR UPDATE OF
        "organization_id", "repository_id", "branch_id",
        "source_index_job_id", "target_commit_sha"
      ON "knowledge_builds"
      FOR EACH ROW EXECUTE FUNCTION "validate_knowledge_build_scope"()
    `);
    await queryRunner.query(`
      CREATE FUNCTION "validate_knowledge_snapshot_scope"()
      RETURNS trigger AS $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM "knowledge_builds" build
          WHERE build."id" = NEW."knowledge_build_id"
            AND build."organization_id" = NEW."organization_id"
            AND build."repository_id" = NEW."repository_id"
            AND build."branch_id" = NEW."branch_id"
            AND build."source_index_job_id" = NEW."source_index_job_id"
            AND build."target_commit_sha" = NEW."target_commit_sha"
            AND build."analyzer_bundle_version" = NEW."analyzer_bundle_version"
            AND build."configuration_digest" = NEW."configuration_digest"
        ) THEN
          RAISE EXCEPTION 'knowledge snapshot build scope is invalid'
            USING ERRCODE = '23514';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);
    await queryRunner.query(`
      CREATE TRIGGER "TRG_validate_knowledge_snapshot_scope"
      BEFORE INSERT OR UPDATE ON "knowledge_snapshots"
      FOR EACH ROW EXECUTE FUNCTION "validate_knowledge_snapshot_scope"()
    `);
    await queryRunner.query(`
      CREATE FUNCTION "validate_knowledge_edge_scope"()
      RETURNS trigger AS $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM "knowledge_nodes" source_node
          JOIN "knowledge_nodes" target_node
            ON target_node."id" = NEW."target_node_id"
          WHERE source_node."id" = NEW."source_node_id"
            AND source_node."snapshot_id" = NEW."snapshot_id"
            AND target_node."snapshot_id" = NEW."snapshot_id"
            AND source_node."organization_id" = NEW."organization_id"
            AND target_node."organization_id" = NEW."organization_id"
            AND source_node."repository_id" = NEW."repository_id"
            AND target_node."repository_id" = NEW."repository_id"
            AND source_node."branch_id" = NEW."branch_id"
            AND target_node."branch_id" = NEW."branch_id"
        ) THEN
          RAISE EXCEPTION 'knowledge edge node scope is invalid'
            USING ERRCODE = '23514';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);
    await queryRunner.query(`
      CREATE TRIGGER "TRG_validate_knowledge_edge_scope"
      BEFORE INSERT OR UPDATE ON "knowledge_edges"
      FOR EACH ROW EXECUTE FUNCTION "validate_knowledge_edge_scope"()
    `);
    await queryRunner.query(`
      CREATE FUNCTION "validate_knowledge_evidence_scope"()
      RETURNS trigger AS $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM "knowledge_snapshots" snapshot
          JOIN "indexed_files" file ON file."id" = NEW."indexed_file_id"
          JOIN "file_hashes" hash ON hash."id" = NEW."file_hash_id"
          WHERE snapshot."id" = NEW."snapshot_id"
            AND snapshot."organization_id" = NEW."organization_id"
            AND snapshot."repository_id" = NEW."repository_id"
            AND snapshot."branch_id" = NEW."branch_id"
            AND file."organization_id" = NEW."organization_id"
            AND file."repository_id" = NEW."repository_id"
            AND file."branch_id" = NEW."branch_id"
            AND file."last_seen_job_id" = snapshot."source_index_job_id"
            AND file."last_seen_commit_sha" = snapshot."target_commit_sha"
            AND file."current_file_hash_id" = NEW."file_hash_id"
            AND hash."organization_id" = NEW."organization_id"
            AND hash."indexed_file_id" = NEW."indexed_file_id"
            AND hash."analysis_completed_at" IS NOT NULL
            AND (
              NEW."end_offset" IS NULL OR
              NEW."end_offset" <= hash."size_bytes"
            )
            AND (
              NEW."code_symbol_id" IS NULL OR EXISTS (
                SELECT 1 FROM "code_symbols" symbol
                WHERE symbol."id" = NEW."code_symbol_id"
                  AND symbol."organization_id" = NEW."organization_id"
                  AND symbol."repository_id" = NEW."repository_id"
                  AND symbol."branch_id" = NEW."branch_id"
                  AND symbol."indexed_file_id" = NEW."indexed_file_id"
                  AND symbol."file_hash_id" = NEW."file_hash_id"
              )
            )
        ) THEN
          RAISE EXCEPTION 'knowledge evidence source scope is invalid'
            USING ERRCODE = '23514';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);
    await queryRunner.query(`
      CREATE TRIGGER "TRG_validate_knowledge_evidence_scope"
      BEFORE INSERT OR UPDATE ON "knowledge_evidence"
      FOR EACH ROW EXECUTE FUNCTION "validate_knowledge_evidence_scope"()
    `);
    await queryRunner.query(`
      CREATE FUNCTION "guard_knowledge_snapshot_identity"()
      RETURNS trigger AS $$
      BEGIN
        IF ROW(
          NEW."organization_id", NEW."repository_id", NEW."branch_id",
          NEW."knowledge_build_id", NEW."source_index_job_id",
          NEW."target_commit_sha", NEW."analyzer_bundle_version",
          NEW."configuration_digest", NEW."created_at"
        ) IS DISTINCT FROM ROW(
          OLD."organization_id", OLD."repository_id", OLD."branch_id",
          OLD."knowledge_build_id", OLD."source_index_job_id",
          OLD."target_commit_sha", OLD."analyzer_bundle_version",
          OLD."configuration_digest", OLD."created_at"
        ) OR (
          OLD."status" = 'published' AND NEW."status" <> 'published'
        ) THEN
          RAISE EXCEPTION 'knowledge snapshot identity is immutable'
            USING ERRCODE = '55000';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);
    await queryRunner.query(`
      CREATE TRIGGER "TRG_guard_knowledge_snapshot_identity"
      BEFORE UPDATE ON "knowledge_snapshots"
      FOR EACH ROW EXECUTE FUNCTION "guard_knowledge_snapshot_identity"()
    `);
    await queryRunner.query(`
      CREATE FUNCTION "guard_knowledge_graph_content"()
      RETURNS trigger AS $$
      DECLARE
        target_snapshot_id integer;
      BEGIN
        target_snapshot_id := CASE
          WHEN TG_OP = 'DELETE' THEN OLD."snapshot_id"
          ELSE NEW."snapshot_id"
        END;

        IF EXISTS (
          SELECT 1 FROM "knowledge_snapshots" snapshot
          WHERE snapshot."id" = target_snapshot_id
            AND snapshot."status" = 'published'
        ) THEN
          RAISE EXCEPTION 'published knowledge snapshot content is immutable'
            USING ERRCODE = '55000';
        END IF;

        IF TG_OP = 'DELETE' THEN
          RETURN OLD;
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);

    for (const table of [
      'knowledge_nodes',
      'knowledge_edges',
      'knowledge_evidence',
    ]) {
      await queryRunner.query(`
        CREATE TRIGGER "TRG_guard_${table}_immutable"
        BEFORE INSERT OR UPDATE OR DELETE ON "${table}"
        FOR EACH ROW EXECUTE FUNCTION "guard_knowledge_graph_content"()
      `);
    }

    await queryRunner.query(`
      CREATE FUNCTION "guard_knowledge_node_evidence"()
      RETURNS trigger AS $$
      DECLARE
        target_node_id integer;
      BEGIN
        target_node_id := CASE
          WHEN TG_OP = 'DELETE' THEN OLD."knowledge_node_id"
          ELSE NEW."knowledge_node_id"
        END;

        IF EXISTS (
          SELECT 1
          FROM "knowledge_nodes" node
          JOIN "knowledge_snapshots" snapshot
            ON snapshot."id" = node."snapshot_id"
          WHERE node."id" = target_node_id
            AND snapshot."status" = 'published'
        ) THEN
          RAISE EXCEPTION 'published knowledge node evidence is immutable'
            USING ERRCODE = '55000';
        END IF;

        IF TG_OP = 'DELETE' THEN
          RETURN OLD;
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);
    await queryRunner.query(`
      CREATE TRIGGER "TRG_guard_knowledge_node_evidence_immutable"
      BEFORE INSERT OR UPDATE OR DELETE ON "knowledge_node_evidence"
      FOR EACH ROW EXECUTE FUNCTION "guard_knowledge_node_evidence"()
    `);
    await queryRunner.query(`
      CREATE FUNCTION "guard_knowledge_edge_evidence"()
      RETURNS trigger AS $$
      DECLARE
        target_edge_id integer;
      BEGIN
        target_edge_id := CASE
          WHEN TG_OP = 'DELETE' THEN OLD."knowledge_edge_id"
          ELSE NEW."knowledge_edge_id"
        END;

        IF EXISTS (
          SELECT 1
          FROM "knowledge_edges" edge
          JOIN "knowledge_snapshots" snapshot
            ON snapshot."id" = edge."snapshot_id"
          WHERE edge."id" = target_edge_id
            AND snapshot."status" = 'published'
        ) THEN
          RAISE EXCEPTION 'published knowledge edge evidence is immutable'
            USING ERRCODE = '55000';
        END IF;

        IF TG_OP = 'DELETE' THEN
          RETURN OLD;
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);
    await queryRunner.query(`
      CREATE TRIGGER "TRG_guard_knowledge_edge_evidence_immutable"
      BEFORE INSERT OR UPDATE OR DELETE ON "knowledge_edge_evidence"
      FOR EACH ROW EXECUTE FUNCTION "guard_knowledge_edge_evidence"()
    `);
  }

  private foreignKey(
    table: string,
    column: string,
    referencedTable: string,
    referencedColumn: string,
    onDelete: 'CASCADE' | 'RESTRICT' | 'SET NULL',
    constraintSuffix = column,
  ): string {
    return `ALTER TABLE "${table}"
      ADD CONSTRAINT "FK_${table}_${constraintSuffix}"
      FOREIGN KEY ("${column}") REFERENCES "${referencedTable}"("${referencedColumn}")
      ON DELETE ${onDelete} ON UPDATE NO ACTION`;
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP TRIGGER "TRG_guard_knowledge_edge_evidence_immutable" ON "knowledge_edge_evidence"`,
    );
    await queryRunner.query(`DROP FUNCTION "guard_knowledge_edge_evidence"`);
    await queryRunner.query(
      `DROP TRIGGER "TRG_guard_knowledge_node_evidence_immutable" ON "knowledge_node_evidence"`,
    );
    await queryRunner.query(`DROP FUNCTION "guard_knowledge_node_evidence"`);
    for (const table of [
      'knowledge_evidence',
      'knowledge_edges',
      'knowledge_nodes',
    ]) {
      await queryRunner.query(
        `DROP TRIGGER "TRG_guard_${table}_immutable" ON "${table}"`,
      );
    }
    await queryRunner.query(`DROP FUNCTION "guard_knowledge_graph_content"`);
    await queryRunner.query(
      `DROP TRIGGER "TRG_guard_knowledge_snapshot_identity" ON "knowledge_snapshots"`,
    );
    await queryRunner.query(
      `DROP FUNCTION "guard_knowledge_snapshot_identity"`,
    );
    await queryRunner.query(
      `DROP TRIGGER "TRG_validate_knowledge_evidence_scope" ON "knowledge_evidence"`,
    );
    await queryRunner.query(
      `DROP FUNCTION "validate_knowledge_evidence_scope"`,
    );
    await queryRunner.query(
      `DROP TRIGGER "TRG_validate_knowledge_edge_scope" ON "knowledge_edges"`,
    );
    await queryRunner.query(`DROP FUNCTION "validate_knowledge_edge_scope"`);
    await queryRunner.query(
      `DROP TRIGGER "TRG_validate_knowledge_snapshot_scope" ON "knowledge_snapshots"`,
    );
    await queryRunner.query(
      `DROP FUNCTION "validate_knowledge_snapshot_scope"`,
    );
    await queryRunner.query(
      `DROP TRIGGER "TRG_validate_knowledge_build_scope" ON "knowledge_builds"`,
    );
    await queryRunner.query(`DROP FUNCTION "validate_knowledge_build_scope"`);

    for (const table of [
      'knowledge_build_errors',
      'knowledge_edge_evidence',
      'knowledge_node_evidence',
      'knowledge_evidence',
      'knowledge_edges',
      'knowledge_nodes',
      'knowledge_snapshots',
      'knowledge_builds',
    ]) {
      await queryRunner.query(`DROP TABLE "${table}"`);
    }

    for (const type of [
      'knowledge_evidence_role',
      'knowledge_derivation_type',
      'knowledge_edge_kind',
      'knowledge_node_kind',
      'knowledge_snapshot_status',
      'knowledge_build_phase',
      'knowledge_build_status',
      'knowledge_build_trigger',
    ]) {
      await queryRunner.query(`DROP TYPE "public"."${type}"`);
    }
  }
}
