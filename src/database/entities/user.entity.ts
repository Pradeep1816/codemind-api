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
import { OrganizationEntity } from './organization.entity';
import { UserRoleEntity } from './user-role.entity';

export enum UserStatus {
  Invited = 'invited',
  Active = 'active',
  Inactive = 'inactive',
  Suspended = 'suspended',
}

@Entity({ name: 'users' })
@Index('uq_users_email', ['email'], { unique: true })
@Index('idx_users_organization_id', ['organizationId'])
@Index('uq_users_invitation_token_hash', ['invitationTokenHash'], {
  unique: true,
})
@Index('idx_users_invited_by_user_id', ['invitedByUserId'])
export class UserEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId!: string;

  @Column({ type: 'varchar', length: 320 })
  email!: string;

  @Column({
    name: 'password_hash',
    type: 'varchar',
    length: 255,
    nullable: true,
    select: false,
  })
  passwordHash!: string | null;

  @Column({ type: 'varchar', length: 150 })
  name!: string;

  @Column({
    type: 'enum',
    enum: UserStatus,
    enumName: 'user_status',
    default: UserStatus.Active,
  })
  status!: UserStatus;

  @Column({ name: 'last_login_at', type: 'timestamptz', nullable: true })
  lastLoginAt!: Date | null;

  @Column({
    name: 'invitation_token_hash',
    type: 'varchar',
    length: 64,
    nullable: true,
    select: false,
  })
  invitationTokenHash!: string | null;

  @Column({
    name: 'invitation_expires_at',
    type: 'timestamptz',
    nullable: true,
  })
  invitationExpiresAt!: Date | null;

  @Column({ name: 'invited_by_user_id', type: 'uuid', nullable: true })
  invitedByUserId!: string | null;

  @Column({
    name: 'invitation_accepted_at',
    type: 'timestamptz',
    nullable: true,
  })
  invitationAcceptedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @ManyToOne(() => OrganizationEntity, (organization) => organization.users, {
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'organization_id' })
  organization!: OrganizationEntity;

  @OneToMany(() => UserRoleEntity, (userRole) => userRole.user)
  userRoles!: UserRoleEntity[];

  @ManyToOne(() => UserEntity, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({
    name: 'invited_by_user_id',
    foreignKeyConstraintName: 'FK_users_invited_by_user_id',
  })
  invitedBy!: UserEntity | null;
}
