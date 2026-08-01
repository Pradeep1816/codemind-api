import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  ValueTransformer,
} from 'typeorm';
import { OrganizationEntity } from '../../organizations/entities/organization.entity';
import { UserEntity } from '../../users/entities/user.entity';
import { RepositoryBranchEntity } from './repository-branch.entity';
import { RepositoryMemberEntity } from './repository-member.entity';

export enum RepositoryProvider {
  GitHub = 'github',
  GitLab = 'gitlab',
  Bitbucket = 'bitbucket',
  Generic = 'generic',
}

export enum RepositoryStatus {
  Active = 'active',
  Disabled = 'disabled',
}

export enum RepositorySyncStatus {
  Never = 'never',
  Succeeded = 'succeeded',
  Failed = 'failed',
}

const nullableBigintNumberTransformer: ValueTransformer = {
  to: (value: number | null): number | null => value,
  from: (value: string | number | null): number | null => {
    if (value === null) {
      return null;
    }

    const parsedValue = Number(value);

    if (!Number.isSafeInteger(parsedValue) || parsedValue < 0) {
      throw new Error('Repository size is outside the supported integer range');
    }

    return parsedValue;
  },
};

@Entity({ name: 'repositories' })
@Index(
  'uq_repositories_organization_remote_url',
  ['organizationId', 'remoteUrl'],
  { unique: true },
)
@Index('idx_repositories_organization_status_created', [
  'organizationId',
  'status',
  'createdAt',
])
@Index('idx_repositories_created_by_user_id', ['createdByUserId'])
@Index('idx_repositories_organization_sync_status', [
  'organizationId',
  'lastSyncStatus',
])
@Check(
  'CHK_repositories_repository_size_bytes',
  '"repository_size_bytes" IS NULL OR "repository_size_bytes" BETWEEN 0 AND 9007199254740991',
)
export class RepositoryEntity {
  @PrimaryGeneratedColumn('increment', {
    type: 'integer',
    primaryKeyConstraintName: 'PK_repositories',
  })
  id!: number;

  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId!: string;

  @Column({ name: 'created_by_user_id', type: 'uuid', nullable: true })
  createdByUserId!: string | null;

  @Column({ type: 'varchar', length: 160 })
  name!: string;

  @Column({
    type: 'enum',
    enum: RepositoryProvider,
    enumName: 'repository_provider',
  })
  provider!: RepositoryProvider;

  @Column({ name: 'remote_url', type: 'varchar', length: 2048 })
  remoteUrl!: string;

  @Column({
    name: 'default_branch',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  defaultBranch!: string | null;

  @Column({
    type: 'enum',
    enum: RepositoryStatus,
    enumName: 'repository_status',
    default: RepositoryStatus.Active,
  })
  status!: RepositoryStatus;

  @Column({
    name: 'last_sync_status',
    type: 'enum',
    enum: RepositorySyncStatus,
    enumName: 'repository_sync_status',
    default: RepositorySyncStatus.Never,
  })
  lastSyncStatus!: RepositorySyncStatus;

  @Column({
    name: 'last_sync_attempted_at',
    type: 'timestamptz',
    nullable: true,
  })
  lastSyncAttemptedAt!: Date | null;

  @Column({ name: 'last_synced_at', type: 'timestamptz', nullable: true })
  lastSyncedAt!: Date | null;

  @Column({
    name: 'repository_size_bytes',
    type: 'bigint',
    nullable: true,
    transformer: nullableBigintNumberTransformer,
  })
  repositorySizeBytes!: number | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @ManyToOne(() => OrganizationEntity, {
    onDelete: 'RESTRICT',
  })
  @JoinColumn({
    name: 'organization_id',
    foreignKeyConstraintName: 'FK_repositories_organization_id',
  })
  organization!: OrganizationEntity;

  @ManyToOne(() => UserEntity, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({
    name: 'created_by_user_id',
    foreignKeyConstraintName: 'FK_repositories_created_by_user_id',
  })
  createdByUser!: UserEntity | null;

  @OneToMany(() => RepositoryMemberEntity, (member) => member.repository)
  members!: RepositoryMemberEntity[];

  @OneToMany(() => RepositoryBranchEntity, (branch) => branch.repository)
  branches!: RepositoryBranchEntity[];
}
