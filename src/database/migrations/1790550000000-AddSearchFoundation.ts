import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSearchFoundation1790550000000 implements MigrationInterface {
  name = 'AddSearchFoundation1790550000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."search_index_status" AS ENUM('draft', 'published')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."search_document_source_type" AS ENUM('file', 'symbol', 'knowledge_node')`,
    );
    await queryRunner.query(`
      CREATE TABLE "search_indexes" (
        "id" SERIAL NOT NULL,
        "organization_id" uuid NOT NULL,
        "repository_id" integer NOT NULL,
        "branch_id" integer NOT NULL,
        "source_index_job_id" integer NOT NULL,
        "knowledge_snapshot_id" integer NOT NULL,
        "target_commit_sha" character varying(64) NOT NULL,
        "indexer_version" character varying(100) NOT NULL,
        "configuration_digest" character varying(64) NOT NULL,
        "status" "public"."search_index_status" NOT NULL DEFAULT 'draft',
        "is_current" boolean NOT NULL DEFAULT false,
        "document_count" integer NOT NULL DEFAULT 0,
        "published_at" TIMESTAMP WITH TIME ZONE,
        "superseded_at" TIMESTAMP WITH TIME ZONE,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_search_indexes" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_search_indexes_target_commit_sha" CHECK (
          "target_commit_sha" ~ '^[0-9a-f]{40}([0-9a-f]{24})?$'
        ),
        CONSTRAINT "CHK_search_indexes_configuration_digest" CHECK (
          "configuration_digest" ~ '^[0-9a-f]{64}$'
        ),
        CONSTRAINT "CHK_search_indexes_document_count" CHECK (
          "document_count" >= 0
        ),
        CONSTRAINT "CHK_search_indexes_publication_state" CHECK (
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
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "search_documents" (
        "id" SERIAL NOT NULL,
        "organization_id" uuid NOT NULL,
        "repository_id" integer NOT NULL,
        "branch_id" integer NOT NULL,
        "search_index_id" integer NOT NULL,
        "source_type" "public"."search_document_source_type" NOT NULL,
        "source_identity_key" character varying(512) NOT NULL,
        "indexed_file_id" integer,
        "file_hash_id" integer,
        "code_symbol_id" integer,
        "knowledge_node_id" integer,
        "title" character varying(512) NOT NULL,
        "content" text NOT NULL,
        "path" character varying(1024),
        "language" character varying(64),
        "kind" character varying(100),
        "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "search_vector" tsvector NOT NULL DEFAULT ''::tsvector,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_search_documents" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_search_documents_source_identity_key" CHECK (
          length(trim("source_identity_key")) > 0
        ),
        CONSTRAINT "CHK_search_documents_title" CHECK (
          length(trim("title")) > 0
        ),
        CONSTRAINT "CHK_search_documents_content_size" CHECK (
          octet_length("content") <= 131072
        ),
        CONSTRAINT "CHK_search_documents_metadata_size" CHECK (
          octet_length("metadata"::text) <= 65536
        ),
        CONSTRAINT "CHK_search_documents_source_reference" CHECK (
          (
            "source_type" = 'file' AND
            "indexed_file_id" IS NOT NULL AND
            "file_hash_id" IS NOT NULL AND
            "code_symbol_id" IS NULL AND
            "knowledge_node_id" IS NULL
          ) OR (
            "source_type" = 'symbol' AND
            "indexed_file_id" IS NOT NULL AND
            "file_hash_id" IS NOT NULL AND
            "code_symbol_id" IS NOT NULL AND
            "knowledge_node_id" IS NULL
          ) OR (
            "source_type" = 'knowledge_node' AND
            "indexed_file_id" IS NULL AND
            "file_hash_id" IS NULL AND
            "code_symbol_id" IS NULL AND
            "knowledge_node_id" IS NOT NULL
          )
        )
      )
    `);

    await this.createIndexes(queryRunner);
    await this.createForeignKeys(queryRunner);
    await this.createTriggers(queryRunner);
  }

  private async createIndexes(queryRunner: QueryRunner): Promise<void> {
    const statements = [
      `CREATE UNIQUE INDEX "uq_search_indexes_snapshot_indexer_configuration"
       ON "search_indexes" (
         "knowledge_snapshot_id", "indexer_version", "configuration_digest"
       )`,
      `CREATE UNIQUE INDEX "uq_search_indexes_current_branch"
       ON "search_indexes" ("branch_id") WHERE "is_current" = true`,
      `CREATE INDEX "idx_search_indexes_organization_repository_created"
       ON "search_indexes" ("organization_id", "repository_id", "created_at")`,
      `CREATE INDEX "idx_search_indexes_source_index_job_id"
       ON "search_indexes" ("source_index_job_id")`,
      `CREATE UNIQUE INDEX "uq_search_documents_index_source_identity"
       ON "search_documents" (
         "search_index_id", "source_type", "source_identity_key"
       )`,
      `CREATE INDEX "idx_search_documents_index_source_type"
       ON "search_documents" ("search_index_id", "source_type")`,
      `CREATE INDEX "idx_search_documents_organization_repository_branch"
       ON "search_documents" ("organization_id", "repository_id", "branch_id")`,
      `CREATE INDEX "idx_search_documents_indexed_file_id"
       ON "search_documents" ("indexed_file_id")`,
      `CREATE INDEX "idx_search_documents_file_hash_id"
       ON "search_documents" ("file_hash_id")`,
      `CREATE INDEX "idx_search_documents_code_symbol_id"
       ON "search_documents" ("code_symbol_id")`,
      `CREATE INDEX "idx_search_documents_knowledge_node_id"
       ON "search_documents" ("knowledge_node_id")`,
      `CREATE INDEX "idx_search_documents_title_lower"
       ON "search_documents" (lower("title") text_pattern_ops)`,
      `CREATE INDEX "idx_search_documents_search_vector"
       ON "search_documents" USING GIN ("search_vector")`,
    ];

    for (const statement of statements) {
      await queryRunner.query(statement);
    }
  }

  private async createForeignKeys(queryRunner: QueryRunner): Promise<void> {
    const statements = [
      this.foreignKey(
        'search_indexes',
        'organization_id',
        'organizations',
        'id',
        'RESTRICT',
      ),
      this.foreignKey(
        'search_indexes',
        'repository_id',
        'repositories',
        'id',
        'CASCADE',
      ),
      this.foreignKey(
        'search_indexes',
        'branch_id',
        'repository_branches',
        'id',
        'CASCADE',
      ),
      this.foreignKey(
        'search_indexes',
        'source_index_job_id',
        'index_jobs',
        'id',
        'CASCADE',
      ),
      this.foreignKey(
        'search_indexes',
        'knowledge_snapshot_id',
        'knowledge_snapshots',
        'id',
        'CASCADE',
      ),
      this.foreignKey(
        'search_documents',
        'organization_id',
        'organizations',
        'id',
        'RESTRICT',
      ),
      this.foreignKey(
        'search_documents',
        'repository_id',
        'repositories',
        'id',
        'CASCADE',
      ),
      this.foreignKey(
        'search_documents',
        'branch_id',
        'repository_branches',
        'id',
        'CASCADE',
      ),
      this.foreignKey(
        'search_documents',
        'search_index_id',
        'search_indexes',
        'id',
        'CASCADE',
      ),
      this.foreignKey(
        'search_documents',
        'indexed_file_id',
        'indexed_files',
        'id',
        'RESTRICT',
      ),
      this.foreignKey(
        'search_documents',
        'file_hash_id',
        'file_hashes',
        'id',
        'RESTRICT',
      ),
      this.foreignKey(
        'search_documents',
        'code_symbol_id',
        'code_symbols',
        'id',
        'RESTRICT',
      ),
      this.foreignKey(
        'search_documents',
        'knowledge_node_id',
        'knowledge_nodes',
        'id',
        'RESTRICT',
      ),
    ];

    for (const statement of statements) {
      await queryRunner.query(statement);
    }
  }

  private async createTriggers(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE FUNCTION "validate_search_index_scope"()
      RETURNS trigger AS $$
      BEGIN
        IF TG_OP = 'INSERT' AND (
          NEW."status" <> 'draft' OR
          NEW."is_current" = true OR
          NEW."document_count" <> 0
        ) THEN
          RAISE EXCEPTION 'search index must be created as an empty draft'
            USING ERRCODE = '23514';
        END IF;

        IF NOT EXISTS (
          SELECT 1
          FROM "knowledge_snapshots" snapshot
          JOIN "index_jobs" job
            ON job."id" = snapshot."source_index_job_id"
          WHERE snapshot."id" = NEW."knowledge_snapshot_id"
            AND snapshot."organization_id" = NEW."organization_id"
            AND snapshot."repository_id" = NEW."repository_id"
            AND snapshot."branch_id" = NEW."branch_id"
            AND snapshot."source_index_job_id" = NEW."source_index_job_id"
            AND snapshot."target_commit_sha" = NEW."target_commit_sha"
            AND snapshot."status" = 'published'
            AND job."organization_id" = NEW."organization_id"
            AND job."repository_id" = NEW."repository_id"
            AND job."branch_id" = NEW."branch_id"
            AND job."target_commit_sha" = NEW."target_commit_sha"
            AND job."status" = 'succeeded'
        ) THEN
          RAISE EXCEPTION 'search index source scope is invalid'
            USING ERRCODE = '23514';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);
    await queryRunner.query(`
      CREATE TRIGGER "TRG_validate_search_index_scope"
      BEFORE INSERT OR UPDATE OF
        "organization_id", "repository_id", "branch_id",
        "source_index_job_id", "knowledge_snapshot_id", "target_commit_sha"
      ON "search_indexes"
      FOR EACH ROW EXECUTE FUNCTION "validate_search_index_scope"()
    `);
    await queryRunner.query(`
      CREATE FUNCTION "validate_search_document_scope"()
      RETURNS trigger AS $$
      DECLARE
        target_source_index_job_id integer;
        target_knowledge_snapshot_id integer;
        target_commit_sha character varying(64);
      BEGIN
        SELECT search_index."source_index_job_id",
               search_index."knowledge_snapshot_id",
               search_index."target_commit_sha"
          INTO target_source_index_job_id,
               target_knowledge_snapshot_id,
               target_commit_sha
        FROM "search_indexes" search_index
        WHERE search_index."id" = NEW."search_index_id"
          AND search_index."organization_id" = NEW."organization_id"
          AND search_index."repository_id" = NEW."repository_id"
          AND search_index."branch_id" = NEW."branch_id";

        IF NOT FOUND THEN
          RAISE EXCEPTION 'search document index scope is invalid'
            USING ERRCODE = '23514';
        END IF;

        IF NEW."source_type" IN ('file', 'symbol') AND NOT EXISTS (
          SELECT 1
          FROM "indexed_files" file
          JOIN "file_hashes" hash
            ON hash."id" = NEW."file_hash_id"
          WHERE file."id" = NEW."indexed_file_id"
            AND file."organization_id" = NEW."organization_id"
            AND file."repository_id" = NEW."repository_id"
            AND file."branch_id" = NEW."branch_id"
            AND file."last_seen_job_id" = target_source_index_job_id
            AND file."last_seen_commit_sha" = target_commit_sha
            AND file."current_file_hash_id" = NEW."file_hash_id"
            AND hash."organization_id" = NEW."organization_id"
            AND hash."indexed_file_id" = NEW."indexed_file_id"
            AND (
              NEW."source_type" = 'file' OR EXISTS (
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
          RAISE EXCEPTION 'search document code source scope is invalid'
            USING ERRCODE = '23514';
        END IF;

        IF NEW."source_type" = 'knowledge_node' AND NOT EXISTS (
          SELECT 1 FROM "knowledge_nodes" node
          WHERE node."id" = NEW."knowledge_node_id"
            AND node."organization_id" = NEW."organization_id"
            AND node."repository_id" = NEW."repository_id"
            AND node."branch_id" = NEW."branch_id"
            AND node."snapshot_id" = target_knowledge_snapshot_id
        ) THEN
          RAISE EXCEPTION 'search document knowledge source scope is invalid'
            USING ERRCODE = '23514';
        END IF;

        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);
    await queryRunner.query(`
      CREATE TRIGGER "TRG_validate_search_document_scope"
      BEFORE INSERT OR UPDATE ON "search_documents"
      FOR EACH ROW EXECUTE FUNCTION "validate_search_document_scope"()
    `);
    await queryRunner.query(`
      CREATE FUNCTION "set_search_document_vector"()
      RETURNS trigger AS $$
      BEGIN
        NEW."search_vector" :=
          setweight(to_tsvector('simple', coalesce(NEW."title", '')), 'A') ||
          setweight(to_tsvector('simple', coalesce(NEW."path", '')), 'A') ||
          setweight(to_tsvector('simple', coalesce(NEW."kind", '')), 'B') ||
          setweight(to_tsvector('simple', coalesce(NEW."language", '')), 'B') ||
          setweight(to_tsvector('simple', coalesce(NEW."content", '')), 'C');
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);
    await queryRunner.query(`
      CREATE TRIGGER "TRG_set_search_document_vector"
      BEFORE INSERT OR UPDATE OF "title", "path", "kind", "language", "content"
      ON "search_documents"
      FOR EACH ROW EXECUTE FUNCTION "set_search_document_vector"()
    `);
    await queryRunner.query(`
      CREATE FUNCTION "guard_search_index_identity"()
      RETURNS trigger AS $$
      DECLARE
        actual_document_count integer;
      BEGIN
        IF ROW(
          NEW."organization_id", NEW."repository_id", NEW."branch_id",
          NEW."source_index_job_id", NEW."knowledge_snapshot_id",
          NEW."target_commit_sha", NEW."indexer_version",
          NEW."configuration_digest", NEW."created_at"
        ) IS DISTINCT FROM ROW(
          OLD."organization_id", OLD."repository_id", OLD."branch_id",
          OLD."source_index_job_id", OLD."knowledge_snapshot_id",
          OLD."target_commit_sha", OLD."indexer_version",
          OLD."configuration_digest", OLD."created_at"
        ) OR (
          OLD."status" = 'published' AND
          (
            NEW."status" <> 'published' OR
            NEW."document_count" <> OLD."document_count" OR
            NEW."published_at" IS DISTINCT FROM OLD."published_at"
          )
        ) THEN
          RAISE EXCEPTION 'search index identity is immutable'
            USING ERRCODE = '55000';
        END IF;

        IF OLD."status" = 'draft' AND NEW."status" = 'published' THEN
          SELECT count(*) INTO actual_document_count
          FROM "search_documents" document
          WHERE document."search_index_id" = NEW."id";

          IF actual_document_count = 0 OR
             actual_document_count <> NEW."document_count" THEN
            RAISE EXCEPTION 'search index document count is invalid'
              USING ERRCODE = '23514';
          END IF;
        END IF;

        IF NEW."is_current" = true AND NOT EXISTS (
          SELECT 1
          FROM "repository_branches" branch
          JOIN "knowledge_snapshots" snapshot
            ON snapshot."id" = NEW."knowledge_snapshot_id"
          WHERE branch."id" = NEW."branch_id"
            AND branch."repository_id" = NEW."repository_id"
            AND branch."commit_sha" = NEW."target_commit_sha"
            AND snapshot."is_current" = true
            AND snapshot."status" = 'published'
        ) THEN
          RAISE EXCEPTION 'current search index source is stale'
            USING ERRCODE = '23514';
        END IF;

        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);
    await queryRunner.query(`
      CREATE TRIGGER "TRG_guard_search_index_identity"
      BEFORE UPDATE ON "search_indexes"
      FOR EACH ROW EXECUTE FUNCTION "guard_search_index_identity"()
    `);
    await queryRunner.query(`
      CREATE FUNCTION "guard_search_document_content"()
      RETURNS trigger AS $$
      DECLARE
        target_search_index_id integer;
      BEGIN
        target_search_index_id := CASE
          WHEN TG_OP = 'DELETE' THEN OLD."search_index_id"
          ELSE NEW."search_index_id"
        END;

        IF EXISTS (
          SELECT 1 FROM "search_indexes" search_index
          WHERE search_index."id" = target_search_index_id
            AND search_index."status" = 'published'
        ) THEN
          RAISE EXCEPTION 'published search index content is immutable'
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
      CREATE TRIGGER "TRG_guard_search_document_content"
      BEFORE INSERT OR UPDATE OR DELETE ON "search_documents"
      FOR EACH ROW EXECUTE FUNCTION "guard_search_document_content"()
    `);
  }

  private foreignKey(
    table: string,
    column: string,
    referencedTable: string,
    referencedColumn: string,
    onDelete: 'CASCADE' | 'RESTRICT',
  ): string {
    return `ALTER TABLE "${table}"
      ADD CONSTRAINT "FK_${table}_${column}"
      FOREIGN KEY ("${column}") REFERENCES "${referencedTable}"("${referencedColumn}")
      ON DELETE ${onDelete} ON UPDATE NO ACTION`;
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP TRIGGER "TRG_guard_search_document_content" ON "search_documents"`,
    );
    await queryRunner.query(`DROP FUNCTION "guard_search_document_content"`);
    await queryRunner.query(
      `DROP TRIGGER "TRG_guard_search_index_identity" ON "search_indexes"`,
    );
    await queryRunner.query(`DROP FUNCTION "guard_search_index_identity"`);
    await queryRunner.query(
      `DROP TRIGGER "TRG_set_search_document_vector" ON "search_documents"`,
    );
    await queryRunner.query(`DROP FUNCTION "set_search_document_vector"`);
    await queryRunner.query(
      `DROP TRIGGER "TRG_validate_search_document_scope" ON "search_documents"`,
    );
    await queryRunner.query(`DROP FUNCTION "validate_search_document_scope"`);
    await queryRunner.query(
      `DROP TRIGGER "TRG_validate_search_index_scope" ON "search_indexes"`,
    );
    await queryRunner.query(`DROP FUNCTION "validate_search_index_scope"`);
    await queryRunner.query(`DROP TABLE "search_documents"`);
    await queryRunner.query(`DROP TABLE "search_indexes"`);
    await queryRunner.query(`DROP TYPE "public"."search_document_source_type"`);
    await queryRunner.query(`DROP TYPE "public"."search_index_status"`);
  }
}
