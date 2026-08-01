import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCurrentFileHash1785630000000 implements MigrationInterface {
  name = 'AddCurrentFileHash1785630000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "indexed_files"
      ADD "current_file_hash_id" integer
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_indexed_files_current_file_hash_id"
      ON "indexed_files" ("current_file_hash_id")
    `);
    await queryRunner.query(`
      ALTER TABLE "indexed_files"
      ADD CONSTRAINT "FK_indexed_files_current_file_hash_id"
      FOREIGN KEY ("current_file_hash_id") REFERENCES "file_hashes"("id")
      ON DELETE SET NULL ON UPDATE NO ACTION
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "indexed_files"
      DROP CONSTRAINT "FK_indexed_files_current_file_hash_id"
    `);
    await queryRunner.query(`
      DROP INDEX "public"."idx_indexed_files_current_file_hash_id"
    `);
    await queryRunner.query(`
      ALTER TABLE "indexed_files"
      DROP COLUMN "current_file_hash_id"
    `);
  }
}
