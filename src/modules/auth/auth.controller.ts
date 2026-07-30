import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Delete,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { getRequestMetadata } from '../../common/utils/request-metadata.util';
import { AUTH_RATE_LIMIT_POLICIES } from '../../config/rate-limit.config';
import {
  AuthService,
  LoginResponse,
  RegisterResponse,
  TokenPairResponse,
} from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RegisterDto } from './dto/register.dto';
import type {
  AuthenticatedRequestUser,
  AuthenticatedUser,
} from './interfaces/authenticated-user.interface';
import { AcceptInvitationDto } from '../users/dto/accept-invitation.dto';
import { UserResponseDto } from '../users/dto/user-response.dto';

interface CurrentUserPermissionsResponse {
  permissions: string[];
}

@Controller({
  path: 'auth',
  version: '1',
})
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Throttle({ default: AUTH_RATE_LIMIT_POLICIES.register })
  @Post('register')
  register(
    @Body() input: RegisterDto,
    @Req() request: Request,
  ): Promise<RegisterResponse> {
    return this.authService.register(input, getRequestMetadata(request));
  }

  @Public()
  @Throttle({ default: AUTH_RATE_LIMIT_POLICIES.login })
  @HttpCode(HttpStatus.OK)
  @Post('login')
  login(
    @Body() input: LoginDto,
    @Req() request: Request,
  ): Promise<LoginResponse> {
    return this.authService.login(input, getRequestMetadata(request));
  }

  @Public()
  @Throttle({ default: AUTH_RATE_LIMIT_POLICIES.refresh })
  @HttpCode(HttpStatus.OK)
  @Post('refresh')
  refresh(
    @Body() input: RefreshTokenDto,
    @Req() request: Request,
  ): Promise<TokenPairResponse> {
    return this.authService.refresh(
      input.refreshToken,
      getRequestMetadata(request),
    );
  }

  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('logout')
  async logout(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Req() request: Request,
  ): Promise<void> {
    await this.authService.logout(
      user.sessionId,
      user.id,
      user.organization.id,
      getRequestMetadata(request),
    );
  }

  @HttpCode(HttpStatus.OK)
  @Post('logout-all')
  logoutAll(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Req() request: Request,
  ): Promise<{ revokedSessions: number }> {
    return this.authService.logoutAll(
      user.id,
      user.organization.id,
      user.sessionId,
      getRequestMetadata(request),
    );
  }

  @Public()
  @Throttle({ default: AUTH_RATE_LIMIT_POLICIES.invitationAccept })
  @HttpCode(HttpStatus.OK)
  @Post('invitations/accept')
  acceptInvitation(
    @Body() input: AcceptInvitationDto,
    @Req() request: Request,
  ): Promise<UserResponseDto> {
    return this.authService.acceptInvitation(
      input,
      getRequestMetadata(request),
    );
  }

  @Get('me')
  me(@CurrentUser() user: AuthenticatedRequestUser): AuthenticatedUser {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      organization: user.organization,
      roles: user.roles,
      permissions: user.permissions,
    };
  }

  @RequirePermissions('organization.read')
  @Get('me/permissions')
  permissions(
    @CurrentUser() user: AuthenticatedRequestUser,
  ): CurrentUserPermissionsResponse {
    return {
      permissions: user.permissions ?? [],
    };
  }

  @Get('sessions')
  sessions(@CurrentUser() user: AuthenticatedRequestUser) {
    return this.authService.listSessions(user.id, user.sessionId);
  }

  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete('sessions/:sessionId')
  revokeSession(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Req() request: Request,
  ): Promise<void> {
    return this.authService.revokeSession(
      sessionId,
      user.id,
      user.organization.id,
      getRequestMetadata(request),
    );
  }
}
