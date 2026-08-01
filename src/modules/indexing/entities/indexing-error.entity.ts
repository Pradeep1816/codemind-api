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
import { IndexingErrorPhase } from '../enums/indexing-error-phase.enum';
import { IndexJobEntity } from './index-job.entity';
import { IndexedFileEntity } from './indexed-file.entity';

@Entity({ name: 'indexing_errors' })
@Index('idx_indexing_errors_organization_job_created', [
  'organizationId',
  'indexJobId',
  'createdAt',
])
@Index('idx_indexing_errors_indexed_file_id', ['indexedFileId'])
@Check('CHK_indexing_errors_attempt_number', '"attempt_number" >= 0')
export class IndexingErrorEntity {
  @PrimaryGeneratedColumn('increment', {
    type: 'integer',
    primaryKeyConstraintName: 'PK_indexing_errors',
  })
  id!: number;

  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId!: string;

  @Column({ name: 'index_job_id', type: 'integer' })
  indexJobId!: number;

  @Column({ name: 'indexed_file_id', type: 'integer', nullable: true })
  indexedFileId!: number | null;

  @Column({
    type: 'enum',
    enum: IndexingErrorPhase,
    enumName: 'indexing_error_phase',
  })
  phase!: IndexingErrorPhase;

  @Column({ type: 'varchar', length: 100 })
  code!: string;

  @Column({ type: 'varchar', length: 1000 })
  message!: string;

  @Column({ type: 'boolean', default: false })
  retryable!: boolean;

  @Column({ name: 'attempt_number', type: 'integer', default: 0 })
  attemptNumber!: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @ManyToOne(() => OrganizationEntity, {
    onDelete: 'RESTRICT',
  })
  @JoinColumn({
    name: 'organization_id',
    foreignKeyConstraintName: 'FK_indexing_errors_organization_id',
  })
  organization!: OrganizationEntity;

  @ManyToOne(() => IndexJobEntity, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({
    name: 'index_job_id',
    foreignKeyConstraintName: 'FK_indexing_errors_index_job_id',
  })
  indexJob!: IndexJobEntity;

  @ManyToOne(() => IndexedFileEntity, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({
    name: 'indexed_file_id',
    foreignKeyConstraintName: 'FK_indexing_errors_indexed_file_id',
  })
  indexedFile!: IndexedFileEntity | null;
}
