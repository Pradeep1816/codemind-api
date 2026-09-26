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
import { RepositoryEntity } from '../../repositories/entities/repository.entity';
import { KnowledgeBuildPhase } from '../enums/knowledge-build-phase.enum';
import { KnowledgeBuildEntity } from './knowledge-build.entity';
import { KnowledgeEvidenceEntity } from './knowledge-evidence.entity';

@Entity({ name: 'knowledge_build_errors' })
@Index('idx_knowledge_build_errors_build_created', [
  'knowledgeBuildId',
  'createdAt',
])
@Index('idx_knowledge_build_errors_evidence_id', ['knowledgeEvidenceId'])
@Index('idx_knowledge_build_errors_organization_repository', [
  'organizationId',
  'repositoryId',
])
@Check('CHK_knowledge_build_errors_attempt_number', `"attempt_number" >= 1`)
export class KnowledgeBuildErrorEntity {
  @PrimaryGeneratedColumn('increment', {
    type: 'integer',
    primaryKeyConstraintName: 'PK_knowledge_build_errors',
  })
  id!: number;

  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId!: string;

  @Column({ name: 'repository_id', type: 'integer' })
  repositoryId!: number;

  @Column({ name: 'knowledge_build_id', type: 'integer' })
  knowledgeBuildId!: number;

  @Column({ name: 'knowledge_evidence_id', type: 'integer', nullable: true })
  knowledgeEvidenceId!: number | null;

  @Column({
    type: 'enum',
    enum: KnowledgeBuildPhase,
    enumName: 'knowledge_build_phase',
  })
  phase!: KnowledgeBuildPhase;

  @Column({
    name: 'analyzer_name',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  analyzerName!: string | null;

  @Column({
    name: 'analyzer_version',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  analyzerVersion!: string | null;

  @Column({ type: 'varchar', length: 100 })
  code!: string;

  @Column({ type: 'varchar', length: 1000 })
  message!: string;

  @Column({ type: 'boolean', default: false })
  retryable!: boolean;

  @Column({ name: 'attempt_number', type: 'integer' })
  attemptNumber!: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @ManyToOne(() => OrganizationEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'organization_id',
    foreignKeyConstraintName: 'FK_knowledge_build_errors_organization_id',
  })
  organization!: OrganizationEntity;

  @ManyToOne(() => RepositoryEntity, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'repository_id',
    foreignKeyConstraintName: 'FK_knowledge_build_errors_repository_id',
  })
  repository!: RepositoryEntity;

  @ManyToOne(() => KnowledgeBuildEntity, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'knowledge_build_id',
    foreignKeyConstraintName: 'FK_knowledge_build_errors_build_id',
  })
  knowledgeBuild!: KnowledgeBuildEntity;

  @ManyToOne(() => KnowledgeEvidenceEntity, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({
    name: 'knowledge_evidence_id',
    foreignKeyConstraintName: 'FK_knowledge_build_errors_evidence_id',
  })
  knowledgeEvidence!: KnowledgeEvidenceEntity | null;
}
