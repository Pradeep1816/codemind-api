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
import { IndexedFileStatus } from '../enums/indexed-file-status.enum';
import { IndexJobEntity } from './index-job.entity';

@Entity({ name: 'indexed_files' })
@Index('uq_indexed_files_branch_path', ['branchId', 'path'], { unique: true })
@Index('idx_indexed_files_organization_repository_status', [
  'organizationId',
  'repositoryId',
  'status',
])
@Index('idx_indexed_files_branch_status', ['branchId', 'status'])
@Index('idx_indexed_files_last_seen_job_id', ['lastSeenJobId'])
@Check('CHK_indexed_files_size_bytes', '"size_bytes" >= 0')
export class IndexedFileEntity {
  @PrimaryGeneratedColumn('increment', {
    type: 'integer',
    primaryKeyConstraintName: 'PK_indexed_files',
  })
  id!: number;

  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId!: string;

  @Column({ name: 'repository_id', type: 'integer' })
  repositoryId!: number;

  @Column({ name: 'branch_id', type: 'integer' })
  branchId!: number;

  @Column({ name: 'last_seen_job_id', type: 'integer', nullable: true })
  lastSeenJobId!: number | null;

  @Column({ type: 'varchar', length: 1024 })
  path!: string;

  @Column({ type: 'varchar', length: 32, nullable: true })
  extension!: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  language!: string | null;

  @Column({ name: 'size_bytes', type: 'integer' })
  sizeBytes!: number;

  @Column({
    type: 'enum',
    enum: IndexedFileStatus,
    enumName: 'indexed_file_status',
    default: IndexedFileStatus.Active,
  })
  status!: IndexedFileStatus;

  @Column({ name: 'last_seen_commit_sha', type: 'varchar', length: 64 })
  lastSeenCommitSha!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @ManyToOne(() => OrganizationEntity, {
    onDelete: 'RESTRICT',
  })
  @JoinColumn({
    name: 'organization_id',
    foreignKeyConstraintName: 'FK_indexed_files_organization_id',
  })
  organization!: OrganizationEntity;

  @ManyToOne(() => RepositoryEntity, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({
    name: 'repository_id',
    foreignKeyConstraintName: 'FK_indexed_files_repository_id',
  })
  repository!: RepositoryEntity;

  @ManyToOne(() => RepositoryBranchEntity, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({
    name: 'branch_id',
    foreignKeyConstraintName: 'FK_indexed_files_branch_id',
  })
  branch!: RepositoryBranchEntity;

  @ManyToOne(() => IndexJobEntity, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({
    name: 'last_seen_job_id',
    foreignKeyConstraintName: 'FK_indexed_files_last_seen_job_id',
  })
  lastSeenJob!: IndexJobEntity | null;
}
