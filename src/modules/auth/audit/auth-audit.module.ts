import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthAuditController } from './auth-audit.controller';
import { AuthAuditService } from './auth-audit.service';
import { AuthAuditEventEntity } from './entities/auth-audit-event.entity';
import { AuthAuditRepository } from './repositories/auth-audit.repository';

@Module({
  imports: [TypeOrmModule.forFeature([AuthAuditEventEntity])],
  controllers: [AuthAuditController],
  providers: [AuthAuditService, AuthAuditRepository],
  exports: [AuthAuditService],
})
export class AuthAuditModule {}
