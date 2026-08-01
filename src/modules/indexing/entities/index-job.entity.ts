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
import { UserEntity } from '../../users/entities/user.entity';
import { IndexJobStatus } from '../enums/index-job-status.enum';
import { IndexJobTrigger } from '../enums/index-job-trigger.enum';
import { IndexingMode } from '../enums/indexing-mode.enum';

@Entity({ name: 'index_jobs' })
@Index('uq_index_jobs_active_repository_branch', ['repositoryId', 'branchId'], {
  unique: true,
  where: `"status" IN ('queued', 'running')`,
})
@Index('idx_index_jobs_organization_repository_created', [
  'organizationId',
  'repositoryId',
  'createdAt',
])
@Index('idx_index_jobs_organization_status_created', [
  'organizationId',
  'status',
  'createdAt',
])
@Index('idx_index_jobs_branch_id', ['branchId'])
@Index('idx_index_jobs_requested_by_user_id', ['requestedByUserId'])
@Check(
  'CHK_index_jobs_file_counts',
  `"total_files" >= 0 AND
   "processed_files" >= 0 AND
   "skipped_files" >= 0 AND
   "failed_files" >= 0 AND
   ("processed_files" + "skipped_files" + "failed_files") <= "total_files"`,
)
@Check('CHK_index_jobs_attempt_count', '"attempt_count" >= 0')
export class IndexJobEntity {
  @PrimaryGeneratedColumn('increment', {
    type: 'integer',
    primaryKeyConstraintName: 'PK_index_jobs',
  })
  id!: number;

  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId!: string;

  @Column({ name: 'repository_id', type: 'integer' })
  repositoryId!: number;

  @Column({ name: 'branch_id', type: 'integer' })
  branchId!: number;

  @Column({ name: 'requested_by_user_id', type: 'uuid', nullable: true })
  requestedByUserId!: string | null;

  @Column({
    type: 'enum',
    enum: IndexJobTrigger,
    enumName: 'index_job_trigger',
    default: IndexJobTrigger.Manual,
  })
  trigger!: IndexJobTrigger;

  @Column({
    type: 'enum',
    enum: IndexingMode,
    enumName: 'indexing_mode',
    default: IndexingMode.Incremental,
  })
  mode!: IndexingMode;

  @Column({
    type: 'enum',
    enum: IndexJobStatus,
    enumName: 'index_job_status',
    default: IndexJobStatus.Queued,
  })
  status!: IndexJobStatus;

  @Column({ name: 'target_commit_sha', type: 'varchar', length: 64 })
  targetCommitSha!: string;

  @Column({ name: 'total_files', type: 'integer', default: 0 })
  totalFiles!: number;

  @Column({ name: 'processed_files', type: 'integer', default: 0 })
  processedFiles!: number;

  @Column({ name: 'skipped_files', type: 'integer', default: 0 })
  skippedFiles!: number;

  @Column({ name: 'failed_files', type: 'integer', default: 0 })
  failedFiles!: number;

  @Column({ name: 'attempt_count', type: 'integer', default: 0 })
  attemptCount!: number;

  @Column({
    name: 'failure_code',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  failureCode!: string | null;

  @Column({
    name: 'failure_message',
    type: 'varchar',
    length: 1000,
    nullable: true,
  })
  failureMessage!: string | null;

  @Column({ name: 'started_at', type: 'timestamptz', nullable: true })
  startedAt!: Date | null;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @ManyToOne(() => OrganizationEntity, {
    onDelete: 'RESTRICT',
  })
  @JoinColumn({
    name: 'organization_id',
    foreignKeyConstraintName: 'FK_index_jobs_organization_id',
  })
  organization!: OrganizationEntity;

  @ManyToOne(() => RepositoryEntity, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({
    name: 'repository_id',
    foreignKeyConstraintName: 'FK_index_jobs_repository_id',
  })
  repository!: RepositoryEntity;

  @ManyToOne(() => RepositoryBranchEntity, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({
    name: 'branch_id',
    foreignKeyConstraintName: 'FK_index_jobs_branch_id',
  })
  branch!: RepositoryBranchEntity;

  @ManyToOne(() => UserEntity, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({
    name: 'requested_by_user_id',
    foreignKeyConstraintName: 'FK_index_jobs_requested_by_user_id',
  })
  requestedByUser!: UserEntity | null;
}
