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
import { CodeSymbolKind } from '../enums/code-symbol-kind.enum';
import { CodeSymbolVisibility } from '../enums/code-symbol-visibility.enum';
import { FileHashEntity } from './file-hash.entity';
import { IndexJobEntity } from './index-job.entity';
import { IndexedFileEntity } from './indexed-file.entity';

@Entity({ name: 'code_symbols' })
@Index(
  'uq_code_symbols_file_hash_kind_qualified_start',
  ['fileHashId', 'kind', 'qualifiedName', 'startOffset'],
  { unique: true },
)
@Index('idx_code_symbols_organization_repository_kind', [
  'organizationId',
  'repositoryId',
  'kind',
])
@Index('idx_code_symbols_organization_repository_name', [
  'organizationId',
  'repositoryId',
  'name',
])
@Index('idx_code_symbols_branch_id', ['branchId'])
@Index('idx_code_symbols_indexed_file_id', ['indexedFileId'])
@Index('idx_code_symbols_file_hash_id', ['fileHashId'])
@Index('idx_code_symbols_observed_by_job_id', ['observedByJobId'])
@Check(
  'CHK_code_symbols_source_range',
  `"start_line" >= 1 AND
   "start_column" >= 1 AND
   "start_offset" >= 0 AND
   "end_line" >= "start_line" AND
   "end_column" >= 1 AND
   ("end_line" > "start_line" OR "end_column" >= "start_column") AND
   "end_offset" >= "start_offset"`,
)
export class CodeSymbolEntity {
  @PrimaryGeneratedColumn('increment', {
    type: 'integer',
    primaryKeyConstraintName: 'PK_code_symbols',
  })
  id!: number;

  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId!: string;

  @Column({ name: 'repository_id', type: 'integer' })
  repositoryId!: number;

  @Column({ name: 'branch_id', type: 'integer' })
  branchId!: number;

  @Column({ name: 'indexed_file_id', type: 'integer' })
  indexedFileId!: number;

  @Column({ name: 'file_hash_id', type: 'integer' })
  fileHashId!: number;

  @Column({ name: 'observed_by_job_id', type: 'integer', nullable: true })
  observedByJobId!: number | null;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ name: 'qualified_name', type: 'varchar', length: 512 })
  qualifiedName!: string;

  @Column({
    type: 'enum',
    enum: CodeSymbolKind,
    enumName: 'code_symbol_kind',
  })
  kind!: CodeSymbolKind;

  @Column({
    type: 'enum',
    enum: CodeSymbolVisibility,
    enumName: 'code_symbol_visibility',
    nullable: true,
  })
  visibility!: CodeSymbolVisibility | null;

  @Column({ type: 'boolean', default: false })
  exported!: boolean;

  @Column({ name: 'default_export', type: 'boolean', default: false })
  defaultExport!: boolean;

  @Column({ type: 'varchar', length: 2000, nullable: true })
  signature!: string | null;

  @Column({ type: 'varchar', length: 4000, nullable: true })
  documentation!: string | null;

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

  @ManyToOne(() => OrganizationEntity, {
    onDelete: 'RESTRICT',
  })
  @JoinColumn({
    name: 'organization_id',
    foreignKeyConstraintName: 'FK_code_symbols_organization_id',
  })
  organization!: OrganizationEntity;

  @ManyToOne(() => RepositoryEntity, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({
    name: 'repository_id',
    foreignKeyConstraintName: 'FK_code_symbols_repository_id',
  })
  repository!: RepositoryEntity;

  @ManyToOne(() => RepositoryBranchEntity, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({
    name: 'branch_id',
    foreignKeyConstraintName: 'FK_code_symbols_branch_id',
  })
  branch!: RepositoryBranchEntity;

  @ManyToOne(() => IndexedFileEntity, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({
    name: 'indexed_file_id',
    foreignKeyConstraintName: 'FK_code_symbols_indexed_file_id',
  })
  indexedFile!: IndexedFileEntity;

  @ManyToOne(() => FileHashEntity, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({
    name: 'file_hash_id',
    foreignKeyConstraintName: 'FK_code_symbols_file_hash_id',
  })
  fileHash!: FileHashEntity;

  @ManyToOne(() => IndexJobEntity, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({
    name: 'observed_by_job_id',
    foreignKeyConstraintName: 'FK_code_symbols_observed_by_job_id',
  })
  observedByJob!: IndexJobEntity | null;
}
