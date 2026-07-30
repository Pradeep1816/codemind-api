import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthSessionsService } from './auth-sessions.service';
import { AuthSessionEntity } from './entities/auth-session.entity';
import { AuthSessionRepository } from './repositories/auth-session.repository';

@Module({
  imports: [TypeOrmModule.forFeature([AuthSessionEntity])],
  providers: [AuthSessionsService, AuthSessionRepository],
  exports: [AuthSessionsService],
})
export class AuthSessionsModule {}
