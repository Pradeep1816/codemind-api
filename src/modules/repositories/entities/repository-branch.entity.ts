import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { RepositoryEntity } from './repository.entity';

export enum BranchStatus {
  Active = 'active',
  Deleted = 'deleted',
}

@Entity({ name: 'repository_branches' })
@Index('uq_repository_branches_repository_name', ['repositoryId', 'name'], {
  unique: true,
})
@Index('idx_repository_branches_repository_status', ['repositoryId', 'status'])
@Index('idx_repository_branches_last_indexed_at', ['lastIndexedAt'])
export class RepositoryBranchEntity {
  @PrimaryGeneratedColumn('increment', {
    type: 'integer',
    primaryKeyConstraintName: 'PK_repository_branches',
  })
  id!: number;

  @Column({ name: 'repository_id', type: 'integer' })
  repositoryId!: number;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({
    name: 'commit_sha',
    type: 'varchar',
    length: 64,
    nullable: true,
  })
  commitSha!: string | null;

  @Column({
    type: 'enum',
    enum: BranchStatus,
    enumName: 'repository_branch_status',
    default: BranchStatus.Active,
  })
  status!: BranchStatus;

  @Column({ name: 'last_indexed_at', type: 'timestamptz', nullable: true })
  lastIndexedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @ManyToOne(() => RepositoryEntity, (repository) => repository.branches, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({
    name: 'repository_id',
    foreignKeyConstraintName: 'FK_repository_branches_repository_id',
  })
  repository!: RepositoryEntity;
}
