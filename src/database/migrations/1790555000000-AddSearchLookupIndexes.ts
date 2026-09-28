import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSearchLookupIndexes1790555000000 implements MigrationInterface {
  name = 'AddSearchLookupIndexes1790555000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE INDEX "idx_search_documents_path_lower"
      ON "search_documents" (lower("path") text_pattern_ops)
      WHERE "path" IS NOT NULL
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_search_documents_symbol_name_lower"
      ON "search_documents" (lower("metadata"->>'name') text_pattern_ops)
      WHERE "source_type" = 'symbol'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."idx_search_documents_symbol_name_lower"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."idx_search_documents_path_lower"`,
    );
  }
}
