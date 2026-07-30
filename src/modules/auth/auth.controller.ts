import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { AuthService, LoginResponse, RegisterResponse } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import type { AuthenticatedUser } from './interfaces/authenticated-user.interface';
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
  login(@Body() input: LoginDto): Promise<LoginResponse> {
    return this.authService.login(input);
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
  me(@CurrentUser() user: AuthenticatedUser): AuthenticatedUser {
    return user;
  }

  @RequirePermissions('organization.read')
  @Get('me/permissions')
  permissions(
    @CurrentUser() user: AuthenticatedUser,
  ): CurrentUserPermissionsResponse {
    return {
      permissions: user.permissions ?? [],
    };
  }
}
