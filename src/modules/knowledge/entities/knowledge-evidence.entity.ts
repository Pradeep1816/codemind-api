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
import { OrganizationEntity } from '../../organizations/entities/organization.entity';
import { RepositoryBranchEntity } from '../../repositories/entities/repository-branch.entity';
import { RepositoryEntity } from '../../repositories/entities/repository.entity';
import { KnowledgeEvidenceRole } from '../enums/knowledge-evidence-role.enum';
import { KnowledgeSnapshotEntity } from './knowledge-snapshot.entity';

@Entity({ name: 'knowledge_evidence' })
@Index(
  'uq_knowledge_evidence_snapshot_identity',
  ['snapshotId', 'identityHash'],
  { unique: true },
)
@Index('idx_knowledge_evidence_snapshot_file_hash', [
  'snapshotId',
  'fileHashId',
])
@Index('idx_knowledge_evidence_code_symbol_id', ['codeSymbolId'])
@Index('idx_knowledge_evidence_organization_repository_role', [
  'organizationId',
  'repositoryId',
  'role',
])
@Check(
  'CHK_knowledge_evidence_identity_hash',
  `"identity_hash" ~ '^[0-9a-f]{64}$'`,
)
@Check(
  'CHK_knowledge_evidence_source_range',
  `(
     "start_line" IS NULL AND
     "start_column" IS NULL AND
     "start_offset" IS NULL AND
     "end_line" IS NULL AND
     "end_column" IS NULL AND
     "end_offset" IS NULL
   ) OR (
     "start_line" >= 1 AND
     "start_column" >= 1 AND
     "start_offset" >= 0 AND
     "end_line" >= "start_line" AND
     "end_column" >= 1 AND
     ("end_line" > "start_line" OR "end_column" >= "start_column") AND
     "end_offset" >= "start_offset"
  )`,
)
export class KnowledgeEvidenceEntity {
  @PrimaryGeneratedColumn('increment', {
    type: 'integer',
    primaryKeyConstraintName: 'PK_knowledge_evidence',
  })
  id!: number;

  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId!: string;

  @Column({ name: 'repository_id', type: 'integer' })
  repositoryId!: number;

  @Column({ name: 'branch_id', type: 'integer' })
  branchId!: number;

  @Column({ name: 'snapshot_id', type: 'integer' })
  snapshotId!: number;

  @Column({ name: 'indexed_file_id', type: 'integer' })
  indexedFileId!: number;

  @Column({ name: 'file_hash_id', type: 'integer' })
  fileHashId!: number;

  @Column({ name: 'code_symbol_id', type: 'integer', nullable: true })
  codeSymbolId!: number | null;

  @Column({ name: 'identity_hash', type: 'varchar', length: 64 })
  identityHash!: string;

  @Column({
    type: 'enum',
    enum: KnowledgeEvidenceRole,
    enumName: 'knowledge_evidence_role',
  })
  role!: KnowledgeEvidenceRole;

  @Column({ name: 'start_line', type: 'integer', nullable: true })
  startLine!: number | null;

  @Column({ name: 'start_column', type: 'integer', nullable: true })
  startColumn!: number | null;

  @Column({ name: 'start_offset', type: 'integer', nullable: true })
  startOffset!: number | null;

  @Column({ name: 'end_line', type: 'integer', nullable: true })
  endLine!: number | null;

  @Column({ name: 'end_column', type: 'integer', nullable: true })
  endColumn!: number | null;

  @Column({ name: 'end_offset', type: 'integer', nullable: true })
  endOffset!: number | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @ManyToOne(() => OrganizationEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'organization_id',
    foreignKeyConstraintName: 'FK_knowledge_evidence_organization_id',
  })
  organization!: OrganizationEntity;

  @ManyToOne(() => RepositoryEntity, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'repository_id',
    foreignKeyConstraintName: 'FK_knowledge_evidence_repository_id',
  })
  repository!: RepositoryEntity;

  @ManyToOne(() => RepositoryBranchEntity, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'branch_id',
    foreignKeyConstraintName: 'FK_knowledge_evidence_branch_id',
  })
  branch!: RepositoryBranchEntity;

  @ManyToOne(() => KnowledgeSnapshotEntity, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'snapshot_id',
    foreignKeyConstraintName: 'FK_knowledge_evidence_snapshot_id',
  })
  snapshot!: KnowledgeSnapshotEntity;

  @ManyToOne(() => IndexedFileEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'indexed_file_id',
    foreignKeyConstraintName: 'FK_knowledge_evidence_indexed_file_id',
  })
  indexedFile!: IndexedFileEntity;

  @ManyToOne(() => FileHashEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'file_hash_id',
    foreignKeyConstraintName: 'FK_knowledge_evidence_file_hash_id',
  })
  fileHash!: FileHashEntity;

  @ManyToOne(() => CodeSymbolEntity, {
    nullable: true,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({
    name: 'code_symbol_id',
    foreignKeyConstraintName: 'FK_knowledge_evidence_code_symbol_id',
  })
  codeSymbol!: CodeSymbolEntity | null;
}
