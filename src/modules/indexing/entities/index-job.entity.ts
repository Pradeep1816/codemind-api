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
import { IndexJobPhase } from '../enums/index-job-phase.enum';
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
@Index('idx_index_jobs_retry_of_job_id', ['retryOfJobId'])
@Index('idx_index_jobs_claimable', ['status', 'nextAttemptAt', 'createdAt'], {
  where: `"status" = 'queued'`,
})
@Index('idx_index_jobs_expired_lease', ['leaseExpiresAt'], {
  where: `"status" = 'running'`,
})
@Index('uq_index_jobs_lease_token', ['leaseToken'], {
  unique: true,
  where: `"lease_token" IS NOT NULL`,
})
@Check(
  'CHK_index_jobs_file_counts',
  `"total_files" >= 0 AND
   "processed_files" >= 0 AND
   "skipped_files" >= 0 AND
   "failed_files" >= 0 AND
   ("processed_files" + "skipped_files" + "failed_files") <= "total_files"`,
)
@Check('CHK_index_jobs_attempt_count', '"attempt_count" >= 0')
@Check(
  'CHK_index_jobs_attempt_limit',
  '"max_attempts" >= 1 AND "attempt_count" <= "max_attempts"',
)
@Check(
  'CHK_index_jobs_metadata_counts',
  '"processed_symbols" >= 0 AND "processed_dependencies" >= 0',
)
@Check(
  'CHK_index_jobs_lease_state',
  `(
     "status" = 'running' AND
     "claimed_by" IS NOT NULL AND
     "lease_token" IS NOT NULL AND
     "last_heartbeat_at" IS NOT NULL AND
     "lease_expires_at" IS NOT NULL
   ) OR (
     "status" <> 'running' AND
     "claimed_by" IS NULL AND
     "lease_token" IS NULL AND
     "last_heartbeat_at" IS NULL AND
     "lease_expires_at" IS NULL
  )`,
)
@Check(
  'CHK_index_jobs_status_phase',
  `(
     "status" = 'queued' AND "phase" = 'queued'
   ) OR (
     "status" = 'running' AND
     "phase" IN ('preparing', 'discovering', 'hashing', 'analyzing', 'finalizing')
   ) OR (
     "status" IN ('succeeded', 'failed', 'cancelled') AND "phase" = 'finished'
   )`,
)
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

  @Column({ name: 'retry_of_job_id', type: 'integer', nullable: true })
  retryOfJobId!: number | null;

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

  @Column({
    type: 'enum',
    enum: IndexJobPhase,
    enumName: 'index_job_phase',
    default: IndexJobPhase.Queued,
  })
  phase!: IndexJobPhase;

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

  @Column({ name: 'processed_symbols', type: 'integer', default: 0 })
  processedSymbols!: number;

  @Column({ name: 'processed_dependencies', type: 'integer', default: 0 })
  processedDependencies!: number;

  @Column({ name: 'attempt_count', type: 'integer', default: 0 })
  attemptCount!: number;

  @Column({ name: 'max_attempts', type: 'integer', default: 3 })
  maxAttempts!: number;

  @Column({ name: 'claimed_by', type: 'varchar', length: 200, nullable: true })
  claimedBy!: string | null;

  @Column({ name: 'lease_token', type: 'uuid', nullable: true })
  leaseToken!: string | null;

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

  @Column({ name: 'last_heartbeat_at', type: 'timestamptz', nullable: true })
  lastHeartbeatAt!: Date | null;

  @Column({ name: 'lease_expires_at', type: 'timestamptz', nullable: true })
  leaseExpiresAt!: Date | null;

  @Column({ name: 'next_attempt_at', type: 'timestamptz', nullable: true })
  nextAttemptAt!: Date | null;

  @Column({
    name: 'cancellation_requested_at',
    type: 'timestamptz',
    nullable: true,
  })
  cancellationRequestedAt!: Date | null;

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

  @ManyToOne(() => IndexJobEntity, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({
    name: 'retry_of_job_id',
    foreignKeyConstraintName: 'FK_index_jobs_retry_of_job_id',
  })
  retryOfJob!: IndexJobEntity | null;
}
