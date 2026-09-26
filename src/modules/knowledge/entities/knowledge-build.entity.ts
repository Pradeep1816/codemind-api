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
import { IndexJobEntity } from '../../indexing/entities/index-job.entity';
import { OrganizationEntity } from '../../organizations/entities/organization.entity';
import { RepositoryBranchEntity } from '../../repositories/entities/repository-branch.entity';
import { RepositoryEntity } from '../../repositories/entities/repository.entity';
import { UserEntity } from '../../users/entities/user.entity';
import { KnowledgeBuildPhase } from '../enums/knowledge-build-phase.enum';
import { KnowledgeBuildStatus } from '../enums/knowledge-build-status.enum';
import { KnowledgeBuildTrigger } from '../enums/knowledge-build-trigger.enum';

@Entity({ name: 'knowledge_builds' })
@Index(
  'uq_knowledge_builds_active_repository_branch',
  ['repositoryId', 'branchId'],
  {
    unique: true,
    where: `"status" IN ('queued', 'running')`,
  },
)
@Index('idx_knowledge_builds_organization_repository_created', [
  'organizationId',
  'repositoryId',
  'createdAt',
])
@Index('idx_knowledge_builds_organization_status_created', [
  'organizationId',
  'status',
  'createdAt',
])
@Index('idx_knowledge_builds_source_index_job_id', ['sourceIndexJobId'])
@Index('idx_knowledge_builds_requested_by_user_id', ['requestedByUserId'])
@Index(
  'idx_knowledge_builds_claimable',
  ['status', 'nextAttemptAt', 'createdAt'],
  {
    where: `"status" = 'queued'`,
  },
)
@Index('idx_knowledge_builds_expired_lease', ['leaseExpiresAt'], {
  where: `"status" = 'running'`,
})
@Index('uq_knowledge_builds_lease_token', ['leaseToken'], {
  unique: true,
  where: `"lease_token" IS NOT NULL`,
})
@Check(
  'CHK_knowledge_builds_progress',
  `"total_files" >= 0 AND
   "processed_files" >= 0 AND
   "failed_files" >= 0 AND
   ("processed_files" + "failed_files") <= "total_files" AND
   "emitted_facts" >= 0 AND
   "persisted_nodes" >= 0 AND
   "persisted_edges" >= 0`,
)
@Check(
  'CHK_knowledge_builds_attempt_limit',
  `"attempt_count" >= 0 AND
   "max_attempts" >= 1 AND
   "attempt_count" <= "max_attempts"`,
)
@Check(
  'CHK_knowledge_builds_target_commit_sha',
  `"target_commit_sha" ~ '^[0-9a-f]{40}([0-9a-f]{24})?$'`,
)
@Check(
  'CHK_knowledge_builds_configuration_digest',
  `"configuration_digest" ~ '^[0-9a-f]{64}$'`,
)
@Check(
  'CHK_knowledge_builds_lease_state',
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
  'CHK_knowledge_builds_status_phase',
  `(
     "status" = 'queued' AND "phase" = 'queued'
   ) OR (
     "status" = 'running' AND
     "phase" IN ('preparing', 'analyzing', 'validating', 'publishing')
   ) OR (
     "status" IN ('succeeded', 'failed', 'cancelled') AND
     "phase" = 'finished'
  )`,
)
@Check(
  'CHK_knowledge_builds_current_file_state',
  `"status" = 'running' OR "current_file" IS NULL`,
)
export class KnowledgeBuildEntity {
  @PrimaryGeneratedColumn('increment', {
    type: 'integer',
    primaryKeyConstraintName: 'PK_knowledge_builds',
  })
  id!: number;

  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId!: string;

  @Column({ name: 'repository_id', type: 'integer' })
  repositoryId!: number;

  @Column({ name: 'branch_id', type: 'integer' })
  branchId!: number;

  @Column({ name: 'source_index_job_id', type: 'integer' })
  sourceIndexJobId!: number;

  @Column({ name: 'requested_by_user_id', type: 'uuid', nullable: true })
  requestedByUserId!: string | null;

  @Column({
    type: 'enum',
    enum: KnowledgeBuildTrigger,
    enumName: 'knowledge_build_trigger',
    default: KnowledgeBuildTrigger.Manual,
  })
  trigger!: KnowledgeBuildTrigger;

  @Column({
    type: 'enum',
    enum: KnowledgeBuildStatus,
    enumName: 'knowledge_build_status',
    default: KnowledgeBuildStatus.Queued,
  })
  status!: KnowledgeBuildStatus;

  @Column({
    type: 'enum',
    enum: KnowledgeBuildPhase,
    enumName: 'knowledge_build_phase',
    default: KnowledgeBuildPhase.Queued,
  })
  phase!: KnowledgeBuildPhase;

  @Column({ name: 'target_commit_sha', type: 'varchar', length: 64 })
  targetCommitSha!: string;

  @Column({ name: 'analyzer_bundle_version', type: 'varchar', length: 100 })
  analyzerBundleVersion!: string;

  @Column({ name: 'configuration_digest', type: 'varchar', length: 64 })
  configurationDigest!: string;

  @Column({ name: 'total_files', type: 'integer', default: 0 })
  totalFiles!: number;

  @Column({ name: 'processed_files', type: 'integer', default: 0 })
  processedFiles!: number;

  @Column({ name: 'failed_files', type: 'integer', default: 0 })
  failedFiles!: number;

  @Column({ name: 'emitted_facts', type: 'integer', default: 0 })
  emittedFacts!: number;

  @Column({ name: 'persisted_nodes', type: 'integer', default: 0 })
  persistedNodes!: number;

  @Column({ name: 'persisted_edges', type: 'integer', default: 0 })
  persistedEdges!: number;

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

  @Column({
    name: 'current_file',
    type: 'varchar',
    length: 1024,
    nullable: true,
  })
  currentFile!: string | null;

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

  @ManyToOne(() => OrganizationEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'organization_id',
    foreignKeyConstraintName: 'FK_knowledge_builds_organization_id',
  })
  organization!: OrganizationEntity;

  @ManyToOne(() => RepositoryEntity, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'repository_id',
    foreignKeyConstraintName: 'FK_knowledge_builds_repository_id',
  })
  repository!: RepositoryEntity;

  @ManyToOne(() => RepositoryBranchEntity, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'branch_id',
    foreignKeyConstraintName: 'FK_knowledge_builds_branch_id',
  })
  branch!: RepositoryBranchEntity;

  @ManyToOne(() => IndexJobEntity, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'source_index_job_id',
    foreignKeyConstraintName: 'FK_knowledge_builds_source_index_job_id',
  })
  sourceIndexJob!: IndexJobEntity;

  @ManyToOne(() => UserEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({
    name: 'requested_by_user_id',
    foreignKeyConstraintName: 'FK_knowledge_builds_requested_by_user_id',
  })
  requestedByUser!: UserEntity | null;
}
