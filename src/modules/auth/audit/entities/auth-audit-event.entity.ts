import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { OrganizationEntity } from '../../../organizations/entities/organization.entity';
import { UserEntity } from '../../../users/entities/user.entity';
import { AuthSessionEntity } from '../../sessions/entities/auth-session.entity';

export enum AuthAuditEventType {
  RegistrationSucceeded = 'registration.succeeded',
  RegistrationFailed = 'registration.failed',
  LoginSucceeded = 'login.succeeded',
  LoginFailed = 'login.failed',
  RefreshSucceeded = 'refresh.succeeded',
  RefreshFailed = 'refresh.failed',
  RefreshReuseDetected = 'refresh.reuse_detected',
  Logout = 'logout',
  LogoutAll = 'logout.all',
  SessionRevoked = 'session.revoked',
  InvitationCreated = 'invitation.created',
  InvitationAccepted = 'invitation.accepted',
  UserStatusChanged = 'user.status_changed',
  UserRolesChanged = 'user.roles_changed',
}

export enum AuthAuditOutcome {
  Success = 'success',
  Failure = 'failure',
}

@Entity({ name: 'auth_audit_events' })
@Index('idx_auth_audit_events_organization_created', [
  'organizationId',
  'createdAt',
])
@Index('idx_auth_audit_events_actor_user_id', ['actorUserId'])
@Index('idx_auth_audit_events_subject_user_id', ['subjectUserId'])
@Index('idx_auth_audit_events_event_type_created', ['eventType', 'createdAt'])
export class AuthAuditEventEntity {
  @PrimaryGeneratedColumn('uuid', {
    primaryKeyConstraintName: 'PK_auth_audit_events',
  })
  id!: string;

  @Column({ name: 'organization_id', type: 'uuid', nullable: true })
  organizationId!: string | null;

  @Column({ name: 'actor_user_id', type: 'uuid', nullable: true })
  actorUserId!: string | null;

  @Column({ name: 'subject_user_id', type: 'uuid', nullable: true })
  subjectUserId!: string | null;

  @Column({ name: 'session_id', type: 'uuid', nullable: true })
  sessionId!: string | null;

  @Column({ name: 'event_type', type: 'varchar', length: 80 })
  eventType!: AuthAuditEventType;

  @Column({ type: 'varchar', length: 20 })
  outcome!: AuthAuditOutcome;

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

  @Column({ type: 'jsonb', nullable: true })
  metadata!: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @ManyToOne(() => OrganizationEntity, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({
    name: 'organization_id',
    foreignKeyConstraintName: 'FK_auth_audit_events_organization_id',
  })
  organization!: OrganizationEntity | null;

  @ManyToOne(() => UserEntity, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({
    name: 'actor_user_id',
    foreignKeyConstraintName: 'FK_auth_audit_events_actor_user_id',
  })
  actorUser!: UserEntity | null;

  @ManyToOne(() => UserEntity, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({
    name: 'subject_user_id',
    foreignKeyConstraintName: 'FK_auth_audit_events_subject_user_id',
  })
  subjectUser!: UserEntity | null;

  @ManyToOne(() => AuthSessionEntity, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({
    name: 'session_id',
    foreignKeyConstraintName: 'FK_auth_audit_events_session_id',
  })
  session!: AuthSessionEntity | null;
}
