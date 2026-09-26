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
import { OrganizationEntity } from '../../organizations/entities/organization.entity';
import { RepositoryBranchEntity } from '../../repositories/entities/repository-branch.entity';
import { RepositoryEntity } from '../../repositories/entities/repository.entity';
import { KnowledgeDerivationType } from '../enums/knowledge-derivation-type.enum';
import { KnowledgeNodeKind } from '../enums/knowledge-node-kind.enum';
import { KnowledgeSnapshotEntity } from './knowledge-snapshot.entity';

@Entity({ name: 'knowledge_nodes' })
@Index(
  'uq_knowledge_nodes_snapshot_kind_identity',
  ['snapshotId', 'kind', 'identityKey'],
  { unique: true },
)
@Index('idx_knowledge_nodes_snapshot_kind_name', ['snapshotId', 'kind', 'name'])
@Index('idx_knowledge_nodes_organization_repository_kind', [
  'organizationId',
  'repositoryId',
  'kind',
])
@Index('idx_knowledge_nodes_analyzer_fingerprint', [
  'analyzerName',
  'analyzerVersion',
  'contentFingerprint',
])
@Check(
  'CHK_knowledge_nodes_confidence',
  `"confidence" >= 0 AND "confidence" <= 1`,
)
@Check(
  'CHK_knowledge_nodes_content_fingerprint',
  `"content_fingerprint" ~ '^[0-9a-f]{64}$'`,
)
@Check(
  'CHK_knowledge_nodes_property_schema_version',
  `"property_schema_version" >= 1`,
)
export class KnowledgeNodeEntity {
  @PrimaryGeneratedColumn('increment', {
    type: 'integer',
    primaryKeyConstraintName: 'PK_knowledge_nodes',
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

  @Column({ name: 'identity_key', type: 'varchar', length: 512 })
  identityKey!: string;

  @Column({
    type: 'enum',
    enum: KnowledgeNodeKind,
    enumName: 'knowledge_node_kind',
  })
  kind!: KnowledgeNodeKind;

  @Column({ type: 'varchar', length: 512 })
  name!: string;

  @Column({ type: 'varchar', length: 4000, nullable: true })
  summary!: string | null;

  @Column({
    name: 'derivation_type',
    type: 'enum',
    enum: KnowledgeDerivationType,
    enumName: 'knowledge_derivation_type',
  })
  derivationType!: KnowledgeDerivationType;

  @Column({ type: 'numeric', precision: 5, scale: 4 })
  confidence!: number;

  @Column({ name: 'analyzer_name', type: 'varchar', length: 100 })
  analyzerName!: string;

  @Column({ name: 'analyzer_version', type: 'varchar', length: 100 })
  analyzerVersion!: string;

  @Column({ name: 'content_fingerprint', type: 'varchar', length: 64 })
  contentFingerprint!: string;

  @Column({ name: 'property_schema_version', type: 'integer', default: 1 })
  propertySchemaVersion!: number;

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  properties!: Record<string, unknown>;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @ManyToOne(() => OrganizationEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'organization_id',
    foreignKeyConstraintName: 'FK_knowledge_nodes_organization_id',
  })
  organization!: OrganizationEntity;

  @ManyToOne(() => RepositoryEntity, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'repository_id',
    foreignKeyConstraintName: 'FK_knowledge_nodes_repository_id',
  })
  repository!: RepositoryEntity;

  @ManyToOne(() => RepositoryBranchEntity, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'branch_id',
    foreignKeyConstraintName: 'FK_knowledge_nodes_branch_id',
  })
  branch!: RepositoryBranchEntity;

  @ManyToOne(() => KnowledgeSnapshotEntity, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'snapshot_id',
    foreignKeyConstraintName: 'FK_knowledge_nodes_snapshot_id',
  })
  snapshot!: KnowledgeSnapshotEntity;
}
