import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import {
  AuthAuditEventType,
  AuthAuditOutcome,
} from '../entities/auth-audit-event.entity';

export class ListAuthAuditEventsQueryDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;

  @IsOptional()
  @IsEnum(AuthAuditEventType)
  eventType?: AuthAuditEventType;

  @IsOptional()
  @IsEnum(AuthAuditOutcome)
  outcome?: AuthAuditOutcome;
}
