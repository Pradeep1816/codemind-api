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
import { FileHashAlgorithm } from '../enums/file-hash-algorithm.enum';
import { IndexJobEntity } from './index-job.entity';
import { IndexedFileEntity } from './indexed-file.entity';

@Entity({ name: 'file_hashes' })
@Index(
  'uq_file_hashes_indexed_file_algorithm_value',
  ['indexedFileId', 'algorithm', 'value'],
  { unique: true },
)
@Index('idx_file_hashes_organization_algorithm_value', [
  'organizationId',
  'algorithm',
  'value',
])
@Index('idx_file_hashes_observed_by_job_id', ['observedByJobId'])
@Index('idx_file_hashes_git_blob_oid', ['gitBlobOid'])
@Check('CHK_file_hashes_size_bytes', '"size_bytes" >= 0')
export class FileHashEntity {
  @PrimaryGeneratedColumn('increment', {
    type: 'integer',
    primaryKeyConstraintName: 'PK_file_hashes',
  })
  id!: number;

  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId!: string;

  @Column({ name: 'indexed_file_id', type: 'integer' })
  indexedFileId!: number;

  @Column({ name: 'observed_by_job_id', type: 'integer', nullable: true })
  observedByJobId!: number | null;

  @Column({
    type: 'enum',
    enum: FileHashAlgorithm,
    enumName: 'file_hash_algorithm',
    default: FileHashAlgorithm.Sha256,
  })
  algorithm!: FileHashAlgorithm;

  @Column({ type: 'varchar', length: 128 })
  value!: string;

  @Column({ name: 'git_blob_oid', type: 'varchar', length: 64 })
  gitBlobOid!: string;

  @Column({ name: 'size_bytes', type: 'integer' })
  sizeBytes!: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @ManyToOne(() => OrganizationEntity, {
    onDelete: 'RESTRICT',
  })
  @JoinColumn({
    name: 'organization_id',
    foreignKeyConstraintName: 'FK_file_hashes_organization_id',
  })
  organization!: OrganizationEntity;

  @ManyToOne(() => IndexedFileEntity, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({
    name: 'indexed_file_id',
    foreignKeyConstraintName: 'FK_file_hashes_indexed_file_id',
  })
  indexedFile!: IndexedFileEntity;

  @ManyToOne(() => IndexJobEntity, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({
    name: 'observed_by_job_id',
    foreignKeyConstraintName: 'FK_file_hashes_observed_by_job_id',
  })
  observedByJob!: IndexJobEntity | null;
}
