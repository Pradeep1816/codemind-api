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
import { OrganizationEntity } from '../../../organizations/entities/organization.entity';
import { UserEntity } from '../../../users/entities/user.entity';

@Entity({ name: 'auth_sessions' })
@Index('idx_auth_sessions_user_id', ['userId'])
@Index('idx_auth_sessions_organization_id', ['organizationId'])
@Index('idx_auth_sessions_expires_at', ['expiresAt'])
@Index('uq_auth_sessions_refresh_token_hash', ['refreshTokenHash'], {
  unique: true,
})
export class AuthSessionEntity {
  @PrimaryGeneratedColumn('uuid', {
    primaryKeyConstraintName: 'PK_auth_sessions',
  })
  id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId!: string;

  @Column({
    name: 'refresh_token_hash',
    type: 'varchar',
    length: 64,
    select: false,
  })
  refreshTokenHash!: string;

  @Column({ name: 'token_version', type: 'integer', default: 1 })
  tokenVersion!: number;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt!: Date;

  @Column({ name: 'last_used_at', type: 'timestamptz', nullable: true })
  lastUsedAt!: Date | null;

  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  revokedAt!: Date | null;

  @Column({
    name: 'revoke_reason',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  revokeReason!: string | null;

  @Column({
    name: 'ip_address',
    type: 'varchar',
    length: 45,
    nullable: true,
  })
  ipAddress!: string | null;

  @Column({
    name: 'user_agent',
    type: 'varchar',
    length: 512,
    nullable: true,
  })
  userAgent!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @ManyToOne(() => UserEntity, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({
    name: 'user_id',
    foreignKeyConstraintName: 'FK_auth_sessions_user_id',
  })
  user!: UserEntity;

  @ManyToOne(() => OrganizationEntity, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({
    name: 'organization_id',
    foreignKeyConstraintName: 'FK_auth_sessions_organization_id',
  })
  organization!: OrganizationEntity;
}
