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
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
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
  @Post('register')
  register(@Body() input: RegisterDto): Promise<RegisterResponse> {
    return this.authService.register(input);
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('login')
  login(
    @Body() input: LoginDto,
    @Req() request: Request,
  ): Promise<LoginResponse> {
    return this.authService.login(input, {
      ipAddress: request.ip?.slice(0, 45) ?? null,
      userAgent: request.get('user-agent')?.slice(0, 512) ?? null,
    });
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('refresh')
  refresh(@Body() input: RefreshTokenDto): Promise<TokenPairResponse> {
    return this.authService.refresh(input.refreshToken);
  }

  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('logout')
  async logout(@CurrentUser() user: AuthenticatedRequestUser): Promise<void> {
    await this.authService.logout(user.sessionId, user.id);
  }

  @HttpCode(HttpStatus.OK)
  @Post('logout-all')
  logoutAll(
    @CurrentUser() user: AuthenticatedRequestUser,
  ): Promise<{ revokedSessions: number }> {
    return this.authService.logoutAll(user.id);
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('invitations/accept')
  acceptInvitation(
    @Body() input: AcceptInvitationDto,
  ): Promise<UserResponseDto> {
    return this.authService.acceptInvitation(input);
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
  ): Promise<void> {
    return this.authService.revokeSession(sessionId, user.id);
  }
}
