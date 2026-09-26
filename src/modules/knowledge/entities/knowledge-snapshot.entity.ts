import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { IndexJobEntity } from '../../indexing/entities/index-job.entity';
import { OrganizationEntity } from '../../organizations/entities/organization.entity';
import { RepositoryBranchEntity } from '../../repositories/entities/repository-branch.entity';
import { RepositoryEntity } from '../../repositories/entities/repository.entity';
import { KnowledgeSnapshotStatus } from '../enums/knowledge-snapshot-status.enum';
import { KnowledgeBuildEntity } from './knowledge-build.entity';

@Entity({ name: 'knowledge_snapshots' })
@Index('uq_knowledge_snapshots_build_id', ['knowledgeBuildId'], {
  unique: true,
})
@Index(
  'uq_knowledge_snapshots_branch_commit_analyzer_configuration',
  [
    'branchId',
    'targetCommitSha',
    'analyzerBundleVersion',
    'configurationDigest',
  ],
  { unique: true },
)
@Index('uq_knowledge_snapshots_current_branch', ['branchId'], {
  unique: true,
  where: `"is_current" = true`,
})
@Index('idx_knowledge_snapshots_organization_repository_created', [
  'organizationId',
  'repositoryId',
  'createdAt',
])
@Index('idx_knowledge_snapshots_source_index_job_id', ['sourceIndexJobId'])
@Check(
  'CHK_knowledge_snapshots_configuration_digest',
  `"configuration_digest" ~ '^[0-9a-f]{64}$'`,
)
@Check(
  'CHK_knowledge_snapshots_target_commit_sha',
  `"target_commit_sha" ~ '^[0-9a-f]{40}([0-9a-f]{24})?$'`,
)
@Check(
  'CHK_knowledge_snapshots_publication_state',
  `(
     "status" = 'draft' AND
     "is_current" = false AND
     "published_at" IS NULL AND
     "superseded_at" IS NULL
   ) OR (
     "status" = 'published' AND
     "published_at" IS NOT NULL AND
     (
       ("is_current" = true AND "superseded_at" IS NULL) OR
       ("is_current" = false)
     )
  )`,
)
export class KnowledgeSnapshotEntity {
  @PrimaryGeneratedColumn('increment', {
    type: 'integer',
    primaryKeyConstraintName: 'PK_knowledge_snapshots',
  })
  id!: number;

  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId!: string;

  @Column({ name: 'repository_id', type: 'integer' })
  repositoryId!: number;

  @Column({ name: 'branch_id', type: 'integer' })
  branchId!: number;

  @Column({ name: 'knowledge_build_id', type: 'integer' })
  knowledgeBuildId!: number;

  @Column({ name: 'source_index_job_id', type: 'integer' })
  sourceIndexJobId!: number;

  @Column({ name: 'target_commit_sha', type: 'varchar', length: 64 })
  targetCommitSha!: string;

  @Column({ name: 'analyzer_bundle_version', type: 'varchar', length: 100 })
  analyzerBundleVersion!: string;

  @Column({ name: 'configuration_digest', type: 'varchar', length: 64 })
  configurationDigest!: string;

  @Column({
    type: 'enum',
    enum: KnowledgeSnapshotStatus,
    enumName: 'knowledge_snapshot_status',
    default: KnowledgeSnapshotStatus.Draft,
  })
  status!: KnowledgeSnapshotStatus;

  @Column({ name: 'is_current', type: 'boolean', default: false })
  isCurrent!: boolean;

  @Column({ name: 'published_at', type: 'timestamptz', nullable: true })
  publishedAt!: Date | null;

  @Column({ name: 'superseded_at', type: 'timestamptz', nullable: true })
  supersededAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @ManyToOne(() => OrganizationEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'organization_id',
    foreignKeyConstraintName: 'FK_knowledge_snapshots_organization_id',
  })
  organization!: OrganizationEntity;

  @ManyToOne(() => RepositoryEntity, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'repository_id',
    foreignKeyConstraintName: 'FK_knowledge_snapshots_repository_id',
  })
  repository!: RepositoryEntity;

  @ManyToOne(() => RepositoryBranchEntity, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'branch_id',
    foreignKeyConstraintName: 'FK_knowledge_snapshots_branch_id',
  })
  branch!: RepositoryBranchEntity;

  @OneToOne(() => KnowledgeBuildEntity, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'knowledge_build_id',
    foreignKeyConstraintName: 'FK_knowledge_snapshots_build_id',
  })
  knowledgeBuild!: KnowledgeBuildEntity;

  @ManyToOne(() => IndexJobEntity, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'source_index_job_id',
    foreignKeyConstraintName: 'FK_knowledge_snapshots_source_index_job_id',
  })
  sourceIndexJob!: IndexJobEntity;
}
