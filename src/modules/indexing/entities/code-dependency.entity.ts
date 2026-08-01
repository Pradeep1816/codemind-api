import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { OrganizationEntity } from '../../organizations/entities/organization.entity';
import { RepositoryBranchEntity } from '../../repositories/entities/repository-branch.entity';
import { RepositoryEntity } from '../../repositories/entities/repository.entity';
import { CodeDependencyKind } from '../enums/code-dependency-kind.enum';
import { CodeSymbolEntity } from './code-symbol.entity';
import { FileHashEntity } from './file-hash.entity';
import { IndexJobEntity } from './index-job.entity';
import { IndexedFileEntity } from './indexed-file.entity';

@Entity({ name: 'code_dependencies' })
@Index(
  'uq_code_dependencies_source_hash_identity',
  ['sourceFileHashId', 'identityHash'],
  { unique: true },
)
@Index('idx_code_dependencies_organization_repository_kind', [
  'organizationId',
  'repositoryId',
  'kind',
])
@Index('idx_code_dependencies_branch_id', ['branchId'])
@Index('idx_code_dependencies_source_indexed_file_id', ['sourceIndexedFileId'])
@Index('idx_code_dependencies_source_file_hash_id', ['sourceFileHashId'])
@Index('idx_code_dependencies_source_symbol_id', ['sourceSymbolId'])
@Index('idx_code_dependencies_target_indexed_file_id', ['targetIndexedFileId'])
@Index('idx_code_dependencies_target_file_hash_id', ['targetFileHashId'])
@Index('idx_code_dependencies_target_symbol_id', ['targetSymbolId'])
@Index('idx_code_dependencies_observed_by_job_id', ['observedByJobId'])
@Check(
  'CHK_code_dependencies_identity_hash',
  `"identity_hash" ~ '^[0-9a-f]{64}$'`,
)
@Check(
  'CHK_code_dependencies_source_range',
  `"start_line" >= 1 AND
   "start_column" >= 1 AND
   "start_offset" >= 0 AND
   "end_line" >= "start_line" AND
   "end_column" >= 1 AND
   ("end_line" > "start_line" OR "end_column" >= "start_column") AND
   "end_offset" >= "start_offset"`,
)
@Check(
  'CHK_code_dependencies_target_symbol_file',
  `"target_symbol_id" IS NULL OR
   ("target_indexed_file_id" IS NOT NULL AND "target_file_hash_id" IS NOT NULL)`,
)
export class CodeDependencyEntity {
  @PrimaryGeneratedColumn('increment', {
    type: 'integer',
    primaryKeyConstraintName: 'PK_code_dependencies',
  })
  id!: number;

  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId!: string;

  @Column({ name: 'repository_id', type: 'integer' })
  repositoryId!: number;

  @Column({ name: 'branch_id', type: 'integer' })
  branchId!: number;

  @Column({ name: 'source_indexed_file_id', type: 'integer' })
  sourceIndexedFileId!: number;

  @Column({ name: 'source_file_hash_id', type: 'integer' })
  sourceFileHashId!: number;

  @Column({ name: 'source_symbol_id', type: 'integer', nullable: true })
  sourceSymbolId!: number | null;

  @Column({ name: 'observed_by_job_id', type: 'integer', nullable: true })
  observedByJobId!: number | null;

  @Column({ name: 'identity_hash', type: 'varchar', length: 64 })
  identityHash!: string;

  @Column({
    type: 'enum',
    enum: CodeDependencyKind,
    enumName: 'code_dependency_kind',
  })
  kind!: CodeDependencyKind;

  @Column({
    name: 'module_specifier',
    type: 'varchar',
    length: 1024,
    nullable: true,
  })
  moduleSpecifier!: string | null;

  @Column({ name: 'target_name', type: 'varchar', length: 512, nullable: true })
  targetName!: string | null;

  @Column({ name: 'local_name', type: 'varchar', length: 255, nullable: true })
  localName!: string | null;

  @Column({ name: 'type_only', type: 'boolean', default: false })
  typeOnly!: boolean;

  @Column({ name: 'target_indexed_file_id', type: 'integer', nullable: true })
  targetIndexedFileId!: number | null;

  @Column({ name: 'target_file_hash_id', type: 'integer', nullable: true })
  targetFileHashId!: number | null;

  @Column({ name: 'target_symbol_id', type: 'integer', nullable: true })
  targetSymbolId!: number | null;

  @Column({ name: 'start_line', type: 'integer' })
  startLine!: number;

  @Column({ name: 'start_column', type: 'integer' })
  startColumn!: number;

  @Column({ name: 'start_offset', type: 'integer' })
  startOffset!: number;

  @Column({ name: 'end_line', type: 'integer' })
  endLine!: number;

  @Column({ name: 'end_column', type: 'integer' })
  endColumn!: number;

  @Column({ name: 'end_offset', type: 'integer' })
  endOffset!: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @ManyToOne(() => OrganizationEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'organization_id',
    foreignKeyConstraintName: 'FK_code_dependencies_organization_id',
  })
  organization!: OrganizationEntity;

  @ManyToOne(() => RepositoryEntity, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'repository_id',
    foreignKeyConstraintName: 'FK_code_dependencies_repository_id',
  })
  repository!: RepositoryEntity;

  @ManyToOne(() => RepositoryBranchEntity, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'branch_id',
    foreignKeyConstraintName: 'FK_code_dependencies_branch_id',
  })
  branch!: RepositoryBranchEntity;

  @ManyToOne(() => IndexedFileEntity, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'source_indexed_file_id',
    foreignKeyConstraintName: 'FK_code_dependencies_source_indexed_file_id',
  })
  sourceIndexedFile!: IndexedFileEntity;

  @ManyToOne(() => FileHashEntity, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'source_file_hash_id',
    foreignKeyConstraintName: 'FK_code_dependencies_source_file_hash_id',
  })
  sourceFileHash!: FileHashEntity;

  @ManyToOne(() => CodeSymbolEntity, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({
    name: 'source_symbol_id',
    foreignKeyConstraintName: 'FK_code_dependencies_source_symbol_id',
  })
  sourceSymbol!: CodeSymbolEntity | null;

  @ManyToOne(() => IndexedFileEntity, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({
    name: 'target_indexed_file_id',
    foreignKeyConstraintName: 'FK_code_dependencies_target_indexed_file_id',
  })
  targetIndexedFile!: IndexedFileEntity | null;

  @ManyToOne(() => FileHashEntity, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({
    name: 'target_file_hash_id',
    foreignKeyConstraintName: 'FK_code_dependencies_target_file_hash_id',
  })
  targetFileHash!: FileHashEntity | null;

  @ManyToOne(() => CodeSymbolEntity, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({
    name: 'target_symbol_id',
    foreignKeyConstraintName: 'FK_code_dependencies_target_symbol_id',
  })
  targetSymbol!: CodeSymbolEntity | null;

  @ManyToOne(() => IndexJobEntity, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({
    name: 'observed_by_job_id',
    foreignKeyConstraintName: 'FK_code_dependencies_observed_by_job_id',
  })
  observedByJob!: IndexJobEntity | null;
}
