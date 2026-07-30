import {
  AuthAuditEventType,
  AuthAuditOutcome,
} from '../entities/auth-audit-event.entity';

export interface AuthAuditEventResponseDto {
  id: string;
  actorUserId: string | null;
  subjectUserId: string | null;
  sessionId: string | null;
  eventType: AuthAuditEventType;
  outcome: AuthAuditOutcome;
  ipAddress: string | null;
  userAgent: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface AuthAuditEventListResponseDto {
  data: AuthAuditEventResponseDto[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
