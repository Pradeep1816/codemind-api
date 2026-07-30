import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { OrganizationEntity } from '../../../database/entities/organization.entity';
import { UserEntity } from '../../../database/entities/user.entity';
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
