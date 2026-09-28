import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { CodeSymbolEntity } from '../../indexing/entities/code-symbol.entity';
import { FileHashEntity } from '../../indexing/entities/file-hash.entity';
import { IndexedFileEntity } from '../../indexing/entities/indexed-file.entity';
import { KnowledgeNodeEntity } from '../../knowledge/entities/knowledge-node.entity';
import { OrganizationEntity } from '../../organizations/entities/organization.entity';
import { RepositoryBranchEntity } from '../../repositories/entities/repository-branch.entity';
import { RepositoryEntity } from '../../repositories/entities/repository.entity';
import { SearchDocumentSourceType } from '../enums/search-document-source-type.enum';
import { SearchIndexEntity } from './search-index.entity';

@Entity({ name: 'search_documents' })
@Index(
  'uq_search_documents_index_source_identity',
  ['searchIndexId', 'sourceType', 'sourceIdentityKey'],
  { unique: true },
)
@Index('idx_search_documents_index_source_type', [
  'searchIndexId',
  'sourceType',
])
@Index('idx_search_documents_organization_repository_branch', [
  'organizationId',
  'repositoryId',
  'branchId',
])
@Index('idx_search_documents_indexed_file_id', ['indexedFileId'])
@Index('idx_search_documents_file_hash_id', ['fileHashId'])
@Index('idx_search_documents_code_symbol_id', ['codeSymbolId'])
@Index('idx_search_documents_knowledge_node_id', ['knowledgeNodeId'])
@Index('idx_search_documents_search_vector', { synchronize: false })
@Check(
  'CHK_search_documents_source_identity_key',
  `length(trim("source_identity_key")) > 0`,
)
@Check('CHK_search_documents_title', `length(trim("title")) > 0`)
@Check('CHK_search_documents_content_size', `octet_length("content") <= 131072`)
@Check(
  'CHK_search_documents_metadata_size',
  `octet_length("metadata"::text) <= 65536`,
)
@Check(
  'CHK_search_documents_source_reference',
  `(
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
  )`,
)
export class SearchDocumentEntity {
  @PrimaryGeneratedColumn('increment', {
    type: 'integer',
    primaryKeyConstraintName: 'PK_search_documents',
  })
  id!: number;

  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId!: string;

  @Column({ name: 'repository_id', type: 'integer' })
  repositoryId!: number;

  @Column({ name: 'branch_id', type: 'integer' })
  branchId!: number;

  @Column({ name: 'search_index_id', type: 'integer' })
  searchIndexId!: number;

  @Column({
    name: 'source_type',
    type: 'enum',
    enum: SearchDocumentSourceType,
    enumName: 'search_document_source_type',
  })
  sourceType!: SearchDocumentSourceType;

  @Column({ name: 'source_identity_key', type: 'varchar', length: 512 })
  sourceIdentityKey!: string;

  @Column({ name: 'indexed_file_id', type: 'integer', nullable: true })
  indexedFileId!: number | null;

  @Column({ name: 'file_hash_id', type: 'integer', nullable: true })
  fileHashId!: number | null;

  @Column({ name: 'code_symbol_id', type: 'integer', nullable: true })
  codeSymbolId!: number | null;

  @Column({ name: 'knowledge_node_id', type: 'integer', nullable: true })
  knowledgeNodeId!: number | null;

  @Column({ type: 'varchar', length: 512 })
  title!: string;

  @Column({ type: 'text' })
  content!: string;

  @Column({ type: 'varchar', length: 1024, nullable: true })
  path!: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  language!: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  kind!: string | null;

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  metadata!: Record<string, unknown>;

  @Column({
    name: 'search_vector',
    type: 'tsvector',
    select: false,
    insert: false,
    update: false,
    default: () => "''::tsvector",
  })
  searchVector!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @ManyToOne(() => OrganizationEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'organization_id',
    foreignKeyConstraintName: 'FK_search_documents_organization_id',
  })
  organization!: OrganizationEntity;

  @ManyToOne(() => RepositoryEntity, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'repository_id',
    foreignKeyConstraintName: 'FK_search_documents_repository_id',
  })
  repository!: RepositoryEntity;

  @ManyToOne(() => RepositoryBranchEntity, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'branch_id',
    foreignKeyConstraintName: 'FK_search_documents_branch_id',
  })
  branch!: RepositoryBranchEntity;

  @ManyToOne(() => SearchIndexEntity, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'search_index_id',
    foreignKeyConstraintName: 'FK_search_documents_search_index_id',
  })
  searchIndex!: SearchIndexEntity;

  @ManyToOne(() => IndexedFileEntity, {
    nullable: true,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({
    name: 'indexed_file_id',
    foreignKeyConstraintName: 'FK_search_documents_indexed_file_id',
  })
  indexedFile!: IndexedFileEntity | null;

  @ManyToOne(() => FileHashEntity, {
    nullable: true,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({
    name: 'file_hash_id',
    foreignKeyConstraintName: 'FK_search_documents_file_hash_id',
  })
  fileHash!: FileHashEntity | null;

  @ManyToOne(() => CodeSymbolEntity, {
    nullable: true,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({
    name: 'code_symbol_id',
    foreignKeyConstraintName: 'FK_search_documents_code_symbol_id',
  })
  codeSymbol!: CodeSymbolEntity | null;

  @ManyToOne(() => KnowledgeNodeEntity, {
    nullable: true,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({
    name: 'knowledge_node_id',
    foreignKeyConstraintName: 'FK_search_documents_knowledge_node_id',
  })
  knowledgeNode!: KnowledgeNodeEntity | null;
}
