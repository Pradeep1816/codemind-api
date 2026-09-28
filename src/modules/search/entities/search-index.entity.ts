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
import { IndexJobEntity } from '../../indexing/entities/index-job.entity';
import { KnowledgeSnapshotEntity } from '../../knowledge/entities/knowledge-snapshot.entity';
import { OrganizationEntity } from '../../organizations/entities/organization.entity';
import { RepositoryBranchEntity } from '../../repositories/entities/repository-branch.entity';
import { RepositoryEntity } from '../../repositories/entities/repository.entity';
import { SearchIndexStatus } from '../enums/search-index-status.enum';

@Entity({ name: 'search_indexes' })
@Index(
  'uq_search_indexes_snapshot_indexer_configuration',
  ['knowledgeSnapshotId', 'indexerVersion', 'configurationDigest'],
  { unique: true },
)
@Index('uq_search_indexes_current_branch', ['branchId'], {
  unique: true,
  where: `"is_current" = true`,
})
@Index('idx_search_indexes_organization_repository_created', [
  'organizationId',
  'repositoryId',
  'createdAt',
])
@Index('idx_search_indexes_source_index_job_id', ['sourceIndexJobId'])
@Check(
  'CHK_search_indexes_target_commit_sha',
  `"target_commit_sha" ~ '^[0-9a-f]{40}([0-9a-f]{24})?$'`,
)
@Check(
  'CHK_search_indexes_configuration_digest',
  `"configuration_digest" ~ '^[0-9a-f]{64}$'`,
)
@Check('CHK_search_indexes_document_count', `"document_count" >= 0`)
@Check(
  'CHK_search_indexes_publication_state',
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
export class SearchIndexEntity {
  @PrimaryGeneratedColumn('increment', {
    type: 'integer',
    primaryKeyConstraintName: 'PK_search_indexes',
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

  @Column({ name: 'knowledge_snapshot_id', type: 'integer' })
  knowledgeSnapshotId!: number;

  @Column({ name: 'target_commit_sha', type: 'varchar', length: 64 })
  targetCommitSha!: string;

  @Column({ name: 'indexer_version', type: 'varchar', length: 100 })
  indexerVersion!: string;

  @Column({ name: 'configuration_digest', type: 'varchar', length: 64 })
  configurationDigest!: string;

  @Column({
    type: 'enum',
    enum: SearchIndexStatus,
    enumName: 'search_index_status',
    default: SearchIndexStatus.Draft,
  })
  status!: SearchIndexStatus;

  @Column({ name: 'is_current', type: 'boolean', default: false })
  isCurrent!: boolean;

  @Column({ name: 'document_count', type: 'integer', default: 0 })
  documentCount!: number;

  @Column({ name: 'published_at', type: 'timestamptz', nullable: true })
  publishedAt!: Date | null;

  @Column({ name: 'superseded_at', type: 'timestamptz', nullable: true })
  supersededAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @ManyToOne(() => OrganizationEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'organization_id',
    foreignKeyConstraintName: 'FK_search_indexes_organization_id',
  })
  organization!: OrganizationEntity;

  @ManyToOne(() => RepositoryEntity, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'repository_id',
    foreignKeyConstraintName: 'FK_search_indexes_repository_id',
  })
  repository!: RepositoryEntity;

  @ManyToOne(() => RepositoryBranchEntity, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'branch_id',
    foreignKeyConstraintName: 'FK_search_indexes_branch_id',
  })
  branch!: RepositoryBranchEntity;

  @ManyToOne(() => IndexJobEntity, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'source_index_job_id',
    foreignKeyConstraintName: 'FK_search_indexes_source_index_job_id',
  })
  sourceIndexJob!: IndexJobEntity;

  @ManyToOne(() => KnowledgeSnapshotEntity, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'knowledge_snapshot_id',
    foreignKeyConstraintName: 'FK_search_indexes_knowledge_snapshot_id',
  })
  knowledgeSnapshot!: KnowledgeSnapshotEntity;
}
