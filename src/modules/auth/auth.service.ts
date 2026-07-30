import {
  ConflictException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { DataSource, QueryFailedError } from 'typeorm';
import { OrganizationStatus } from '../../database/entities/organization.entity';
import { UserEntity, UserStatus } from '../../database/entities/user.entity';
import jwtConfig from '../../config/jwt.config';
import { DefaultRoleName } from '../../database/seeds/roles.seed';
import { OrganizationsService } from '../organizations/organizations.service';
import { UsersService } from '../users/users.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { AcceptInvitationDto } from '../users/dto/accept-invitation.dto';
import { UserResponseDto } from '../users/dto/user-response.dto';
import {
  AccessTokenPayload,
  AuthenticatedUser,
} from './interfaces/authenticated-user.interface';
import { PasswordService } from './password.service';

interface PostgresDriverError extends Error {
  code?: string;
  constraint?: string;
}

export interface RegisterResponse {
  organization: {
    id: string;
    name: string;
    slug: string;
  };
  user: {
    id: string;
    email: string;
    name: string;
    status: UserStatus;
    role: DefaultRoleName.Owner;
  };
}

export interface LoginResponse {
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: string;
  user: AuthenticatedUser;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly organizationsService: OrganizationsService,
    private readonly usersService: UsersService,
    private readonly passwordService: PasswordService,
    private readonly jwtService: JwtService,
    @Inject(jwtConfig.KEY)
    private readonly jwtConfiguration: ConfigType<typeof jwtConfig>,
  ) {}

  async register(input: RegisterDto): Promise<RegisterResponse> {
    const organizationName = input.organizationName.trim();
    const organizationSlug = this.organizationsService.normalizeSlug(
      input.organizationSlug,
    );
    const name = input.name.trim();
    const email = this.usersService.normalizeEmail(input.email);
    const passwordHash = await this.passwordService.hash(input.password);

    try {
      return await this.dataSource.transaction(async (manager) => {
        await this.organizationsService.ensureSlugAvailable(
          organizationSlug,
          manager,
        );
        await this.usersService.ensureEmailAvailable(email, manager);

        const organization = await this.organizationsService.create(
          {
            name: organizationName,
            slug: organizationSlug,
          },
          manager,
        );
        const roles = await this.organizationsService.createDefaultRoles(
          organization.id,
          manager,
        );
        const ownerRole = roles.find(
          (role) => role.name === String(DefaultRoleName.Owner),
        );

        if (!ownerRole) {
          throw new Error('OWNER role was not created');
        }

        const user = await this.usersService.create(
          {
            organizationId: organization.id,
            email,
            name,
            passwordHash,
          },
          manager,
        );

        await this.organizationsService.assignUserRole(
          user.id,
          ownerRole.id,
          manager,
        );

        return {
          organization: {
            id: organization.id,
            name: organization.name,
            slug: organization.slug,
          },
          user: {
            id: user.id,
            email: user.email,
            name: user.name,
            status: user.status,
            role: DefaultRoleName.Owner,
          },
        };
      });
    } catch (error: unknown) {
      if (error instanceof ConflictException) {
        throw error;
      }

      const constraint = this.getUniqueConstraint(error);

      if (constraint === 'uq_users_email') {
        throw new ConflictException('Email address is already registered');
      }

      if (constraint === 'uq_organizations_slug') {
        throw new ConflictException('Organization slug is already in use');
      }

      if (constraint) {
        throw new ConflictException(
          'Registration conflicts with existing data',
        );
      }

      throw error;
    }
  }

  async login(input: LoginDto): Promise<LoginResponse> {
    const user = await this.usersService.findForAuthentication(input.email);

    if (!user) {
      throw this.invalidCredentials();
    }

    const isPasswordValid =
      this.isActive(user) &&
      typeof user.passwordHash === 'string' &&
      (await this.passwordService.verify(user.passwordHash, input.password));

    if (!isPasswordValid) {
      throw this.invalidCredentials();
    }

    const authenticatedUser = this.toAuthenticatedUser(user);
    const payload: AccessTokenPayload = {
      sub: user.id,
      organizationId: user.organizationId,
      type: 'access',
    };
    const accessToken = await this.jwtService.signAsync(payload);

    await this.usersService.recordSuccessfulLogin(user.id);

    return {
      accessToken,
      tokenType: 'Bearer',
      expiresIn: this.jwtConfiguration.expiresIn,
      user: authenticatedUser,
    };
  }

  async acceptInvitation(input: AcceptInvitationDto): Promise<UserResponseDto> {
    await this.usersService.ensureInvitationCanBeAccepted(input.token);

    const passwordHash = await this.passwordService.hash(input.password);

    return this.usersService.acceptInvitation(input.token, passwordHash);
  }

  async resolveAuthenticatedUser(
    payload: AccessTokenPayload,
  ): Promise<AuthenticatedUser> {
    const user = await this.usersService.findAuthenticatedIdentity(
      payload.sub,
      payload.organizationId,
    );

    if (!user || !this.isActive(user)) {
      throw new UnauthorizedException('User is not available');
    }

    return this.toAuthenticatedUser(user);
  }

  private isActive(user: UserEntity): boolean {
    return (
      user.status === UserStatus.Active &&
      user.organization?.status === OrganizationStatus.Active
    );
  }

  private toAuthenticatedUser(user: UserEntity): AuthenticatedUser {
    const roles = [
      ...new Set(
        (user.userRoles ?? [])
          .map((userRole) => userRole.role?.name)
          .filter((role): role is string => typeof role === 'string'),
      ),
    ].sort();

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      organization: {
        id: user.organization.id,
        name: user.organization.name,
        slug: user.organization.slug,
      },
      roles,
    };
  }

  private invalidCredentials(): UnauthorizedException {
    return new UnauthorizedException('Invalid email or password');
  }

  private getUniqueConstraint(error: unknown): string | undefined {
    if (!(error instanceof QueryFailedError)) {
      return undefined;
    }

    const { code, constraint } = error.driverError as PostgresDriverError;

    return code === '23505' && typeof constraint === 'string'
      ? constraint
      : undefined;
  }
}
