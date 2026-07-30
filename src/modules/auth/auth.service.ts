import {
  ConflictException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { JwtSignOptions } from '@nestjs/jwt';
import { createHash, randomUUID } from 'node:crypto';
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
  AuthenticatedRequestUser,
  AuthenticatedUser,
  RefreshTokenPayload,
} from './interfaces/authenticated-user.interface';
import { PasswordService } from './password.service';
import {
  AuthSessionRotationResult,
  AuthSessionsService,
} from './sessions/auth-sessions.service';
import { AuthSessionResponseDto } from './sessions/dto/auth-session-response.dto';

/**
 * Minimal PostgreSQL driver-error shape used to safely inspect database
 * constraint violations without leaking driver-specific details elsewhere.
 */
interface PostgresDriverError extends Error {
  code?: string;
  constraint?: string;
}

/**
 * Password-safe response returned after creating an organization and its first
 * owner account.
 */
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

/**
 * Access and refresh credentials issued for one database-backed auth session.
 */
export interface TokenPairResponse {
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  expiresIn: string;
  refreshExpiresIn: string;
}

/**
 * Login response containing the token pair and the authenticated public user
 * identity. Password hashes and internal session state are never included.
 */
export interface LoginResponse extends TokenPairResponse {
  user: AuthenticatedUser;
}

/**
 * Bounded request metadata recorded with a session to help users identify
 * their active logins. These values are informational, not trusted identity
 * attributes.
 */
export interface SessionMetadata {
  ipAddress: string | null;
  userAgent: string | null;
}

/**
 * Coordinates CodeMind authentication use cases without performing direct
 * entity-repository access.
 *
 * The service owns registration orchestration, credential verification, JWT
 * issuance, refresh rotation, invitation acceptance, request identity
 * resolution, and user-controlled session revocation. Organization, user,
 * password, and session capabilities remain delegated to their owning
 * services.
 */
@Injectable()
export class AuthService {
  /**
   * Creates the authentication application service and injects all capability
   * boundaries required by its use cases.
   *
   * @param dataSource Opens TypeORM transactions for atomic registration.
   * @param organizationsService Owns organization and role operations.
   * @param usersService Owns user persistence and lifecycle operations.
   * @param passwordService Hashes and verifies passwords with Argon2id.
   * @param jwtService Signs and verifies access and refresh JWTs.
   * @param jwtConfiguration Provides validated token secrets and lifetimes.
   * @param authSessionsService Owns persisted session and rotation state.
   */
  constructor(
    private readonly dataSource: DataSource,
    private readonly organizationsService: OrganizationsService,
    private readonly usersService: UsersService,
    private readonly passwordService: PasswordService,
    private readonly jwtService: JwtService,
    @Inject(jwtConfig.KEY)
    private readonly jwtConfiguration: ConfigType<typeof jwtConfig>,
    private readonly authSessionsService: AuthSessionsService,
  ) {}

  /**
   * Creates a new organization, its default RBAC roles, and its first OWNER
   * user as one atomic operation.
   *
   * User-controlled identity values are normalized before persistence, and the
   * password is hashed before the transaction starts. A failure in any
   * database step rolls back the organization, roles, user, and assignment
   * together. Known PostgreSQL unique constraints are translated into stable
   * HTTP conflict responses.
   *
   * @param input Validated registration data from the public HTTP endpoint.
   * @returns The new organization and password-safe first-owner identity.
   * @throws ConflictException When the email or organization slug is in use.
   */
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

  /**
   * Authenticates an active user and creates a new database-backed login
   * session.
   *
   * The method deliberately uses the same unauthorized response for a missing
   * user, invalid password, inactive user, or inactive organization. After
   * successful verification it generates a UUID session ID, issues the first
   * access/refresh pair, stores only the refresh-token hash, and records
   * bounded client metadata. Updating `lastLoginAt` is best-effort so an
   * observability write cannot invalidate an otherwise successful login.
   *
   * @param input Validated email and plaintext password.
   * @param metadata Informational IP address and user-agent for the session.
   * @returns The initial token pair and password-safe authenticated identity.
   * @throws UnauthorizedException When the credentials or account are invalid.
   */
  async login(
    input: LoginDto,
    metadata: SessionMetadata,
  ): Promise<LoginResponse> {
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
    const sessionId = randomUUID();
    const tokenVersion = 1;
    const tokens = await this.issueTokenPair(
      user.id,
      user.organizationId,
      sessionId,
      tokenVersion,
    );

    await this.authSessionsService.create({
      id: sessionId,
      userId: user.id,
      organizationId: user.organizationId,
      refreshTokenHash: this.hashToken(tokens.refreshToken),
      tokenVersion,
      expiresAt: this.getRefreshExpiration(),
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });

    try {
      await this.usersService.recordSuccessfulLogin(user.id);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);

      console.error('Failed to record successful login', message);
    }

    return {
      ...tokens,
      user: authenticatedUser,
    };
  }

  /**
   * Exchanges a valid refresh token for a newly rotated access/refresh pair.
   *
   * JWT verification establishes that the token was signed by CodeMind. The
   * current user and organization are then reloaded so suspended identities
   * cannot refresh. Rotation locks the session row and compares both the token
   * version and SHA-256 hash. Reuse of an older signed token revokes the
   * session family and is reported without logging the credential itself.
   *
   * @param refreshToken Raw refresh token supplied only to the refresh route.
   * @returns A replacement access token and replacement refresh token.
   * @throws UnauthorizedException When the token, identity, or session is no
   * longer valid, or when token reuse is detected.
   */
  async refresh(refreshToken: string): Promise<TokenPairResponse> {
    const payload = await this.verifyRefreshToken(refreshToken);
    const user = await this.usersService.findAuthenticatedIdentity(
      payload.sub,
      payload.organizationId,
    );

    if (!user || !this.isActive(user)) {
      await this.authSessionsService.revokeAllForUser(
        payload.sub,
        'user_unavailable',
      );
      throw this.invalidRefreshToken();
    }

    const nextVersion = payload.version + 1;
    const tokens = await this.issueTokenPair(
      payload.sub,
      payload.organizationId,
      payload.sessionId,
      nextVersion,
    );
    const rotationResult = await this.authSessionsService.rotate({
      sessionId: payload.sessionId,
      userId: payload.sub,
      organizationId: payload.organizationId,
      tokenVersion: payload.version,
      presentedTokenHash: this.hashToken(refreshToken),
      nextTokenHash: this.hashToken(tokens.refreshToken),
      nextExpiresAt: this.getRefreshExpiration(),
    });

    if (rotationResult === AuthSessionRotationResult.Reused) {
      console.error(
        'Refresh token reuse detected; session revoked',
        payload.sessionId,
      );
    }

    if (rotationResult !== AuthSessionRotationResult.Rotated) {
      throw this.invalidRefreshToken();
    }

    return tokens;
  }

  /**
   * Accepts a one-time invitation and establishes the invited user's initial
   * password.
   *
   * The invitation is checked before Argon2 work to reject arbitrary invalid
   * tokens cheaply. UsersService checks it again under a database lock when
   * activating the user, preventing concurrent or repeated acceptance.
   *
   * @param input One-time invitation token and validated initial password.
   * @returns The activated, password-safe organization user.
   * @throws BadRequestException indirectly when the invitation is invalid,
   * expired, or already used.
   */
  async acceptInvitation(input: AcceptInvitationDto): Promise<UserResponseDto> {
    await this.usersService.ensureInvitationCanBeAccepted(input.token);

    const passwordHash = await this.passwordService.hash(input.password);

    return this.usersService.acceptInvitation(input.token, passwordHash);
  }

  /**
   * Resolves the live request identity represented by an access-token payload.
   *
   * An access token is accepted only while its referenced session remains
   * active. The user, organization, and roles are reloaded from PostgreSQL on
   * every protected request, ensuring logout, suspension, organization status,
   * and role changes take effect without waiting for JWT expiry.
   *
   * @param payload Verified and structurally validated access-token payload.
   * @returns The current identity plus its internal request session ID.
   * @throws UnauthorizedException When the session, user, or organization is
   * unavailable.
   */
  async resolveAuthenticatedUser(
    payload: AccessTokenPayload,
  ): Promise<AuthenticatedRequestUser> {
    const isSessionActive = await this.authSessionsService.isActive(
      payload.sessionId,
      payload.sub,
      payload.organizationId,
    );

    if (!isSessionActive) {
      throw new UnauthorizedException('Session is not available');
    }

    const user = await this.usersService.findAuthenticatedIdentity(
      payload.sub,
      payload.organizationId,
    );

    if (!user || !this.isActive(user)) {
      throw new UnauthorizedException('User is not available');
    }

    return {
      ...this.toAuthenticatedUser(user),
      sessionId: payload.sessionId,
    };
  }

  /**
   * Revokes the session associated with the current access token.
   *
   * @param sessionId Session ID obtained from the authenticated request.
   * @param userId Authenticated owner of the session.
   * @returns `true` when an active session was revoked, otherwise `false`.
   */
  logout(sessionId: string, userId: string): Promise<boolean> {
    return this.authSessionsService.revokeCurrent(sessionId, userId);
  }

  /**
   * Revokes every active session owned by the authenticated user.
   *
   * This supports account-wide logout across browsers and devices. Because
   * access-token validation checks session state, all associated access tokens
   * stop working immediately.
   *
   * @param userId Authenticated user whose sessions must be revoked.
   * @returns The number of sessions changed to revoked state.
   */
  async logoutAll(userId: string): Promise<{ revokedSessions: number }> {
    const revokedSessions = await this.authSessionsService.revokeAllForUser(
      userId,
      'logout_all',
    );

    return { revokedSessions };
  }

  /**
   * Lists active, unexpired sessions owned by the authenticated user.
   *
   * The returned records contain password-safe, token-free metadata and mark
   * which session corresponds to the caller's current access token.
   *
   * @param userId Authenticated owner used as the mandatory query scope.
   * @param currentSessionId Session ID to mark as the current login.
   * @returns Active sessions ordered by recent use and creation time.
   */
  listSessions(
    userId: string,
    currentSessionId: string,
  ): Promise<AuthSessionResponseDto[]> {
    return this.authSessionsService.list(userId, currentSessionId);
  }

  /**
   * Revokes a specific active session owned by the authenticated user.
   *
   * Ownership is enforced by the persistence query, so a user cannot discover
   * or revoke another user's session by guessing its UUID.
   *
   * @param sessionId UUID of the session selected for remote logout.
   * @param userId Authenticated owner used as the mandatory query scope.
   * @throws NotFoundException indirectly when no owned active session exists.
   */
  revokeSession(sessionId: string, userId: string): Promise<void> {
    return this.authSessionsService.revokeSession(sessionId, userId);
  }

  /**
   * Determines whether both sides of an authenticated identity are currently
   * allowed to access CodeMind.
   *
   * @param user User entity loaded with its organization relation.
   * @returns `true` only when both user and organization statuses are active.
   */
  private isActive(user: UserEntity): boolean {
    return (
      user.status === UserStatus.Active &&
      user.organization?.status === OrganizationStatus.Active
    );
  }

  /**
   * Maps a persisted user into the password-safe identity exposed by auth
   * responses and request decorators.
   *
   * Role names are deduplicated and sorted to produce stable responses when a
   * user has multiple join-table assignments.
   *
   * @param user User loaded with organization and user-role relations.
   * @returns Public identity containing organization context and role names.
   */
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

  /**
   * Creates the intentionally generic credential error used for all login
   * failures, preventing account-state or email-enumeration disclosures.
   *
   * @returns A consistent HTTP 401 exception.
   */
  private invalidCredentials(): UnauthorizedException {
    return new UnauthorizedException('Invalid email or password');
  }

  /**
   * Creates the generic refresh failure returned for bad signatures, malformed
   * claims, expiry, revocation, and replay.
   *
   * @returns A consistent HTTP 401 exception.
   */
  private invalidRefreshToken(): UnauthorizedException {
    return new UnauthorizedException('Invalid or expired refresh token');
  }

  /**
   * Verifies a refresh token with the refresh-token secret and validates every
   * application claim required for database session rotation.
   *
   * Cryptographic verification is restricted to HS256. Structural checks stop
   * an access token or incomplete payload from entering the session workflow.
   *
   * @param refreshToken Raw JWT received from the refresh endpoint.
   * @returns Verified refresh payload containing user, organization, session,
   * and token-version identifiers.
   * @throws UnauthorizedException When verification or claim validation fails.
   */
  private async verifyRefreshToken(
    refreshToken: string,
  ): Promise<RefreshTokenPayload> {
    let payload: RefreshTokenPayload;

    try {
      payload = await this.jwtService.verifyAsync<RefreshTokenPayload>(
        refreshToken,
        {
          secret: this.jwtConfiguration.refreshSecret,
          algorithms: ['HS256'],
        },
      );
    } catch {
      throw this.invalidRefreshToken();
    }

    if (
      payload.type !== 'refresh' ||
      typeof payload.sub !== 'string' ||
      typeof payload.organizationId !== 'string' ||
      typeof payload.sessionId !== 'string' ||
      !Number.isInteger(payload.version) ||
      payload.version < 1
    ) {
      throw this.invalidRefreshToken();
    }

    return payload;
  }

  /**
   * Signs a coordinated access/refresh token pair for one session generation.
   *
   * Access tokens use the JwtModule's configured access secret and lifetime.
   * Refresh tokens use the separately configurable refresh secret, include the
   * rotation version, and use the longer refresh lifetime. Both tokens bind to
   * the same user, organization, and session.
   *
   * @param userId Subject that owns the token pair.
   * @param organizationId Tenant boundary encoded into both tokens.
   * @param sessionId UUID of the persisted login session.
   * @param tokenVersion Current refresh-token rotation generation.
   * @returns Signed token pair and client-visible lifetime strings.
   */
  private async issueTokenPair(
    userId: string,
    organizationId: string,
    sessionId: string,
    tokenVersion: number,
  ): Promise<TokenPairResponse> {
    const accessPayload: AccessTokenPayload = {
      sub: userId,
      organizationId,
      sessionId,
      type: 'access',
    };
    const refreshPayload: RefreshTokenPayload = {
      sub: userId,
      organizationId,
      sessionId,
      version: tokenVersion,
      type: 'refresh',
    };
    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(accessPayload),
      this.jwtService.signAsync(refreshPayload, {
        secret: this.jwtConfiguration.refreshSecret,
        algorithm: 'HS256',
        expiresIn: this.jwtConfiguration
          .refreshExpiresIn as JwtSignOptions['expiresIn'],
      }),
    ]);

    return {
      accessToken,
      refreshToken,
      tokenType: 'Bearer',
      expiresIn: this.jwtConfiguration.expiresIn,
      refreshExpiresIn: this.jwtConfiguration.refreshExpiresIn,
    };
  }

  /**
   * Produces the fixed-length token fingerprint persisted in PostgreSQL.
   *
   * Raw refresh tokens remain client-side; only this SHA-256 digest is stored
   * or compared by the server.
   *
   * @param token Raw refresh token to fingerprint.
   * @returns Lowercase 64-character hexadecimal SHA-256 digest.
   */
  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  /**
   * Calculates the absolute database expiration for a refresh session.
   *
   * The calculation uses the same validated duration configured for the JWT so
   * database and cryptographic expiry remain aligned.
   *
   * @returns Date after which the persisted session cannot be refreshed.
   */
  private getRefreshExpiration(): Date {
    return new Date(
      Date.now() +
        this.durationToMilliseconds(this.jwtConfiguration.refreshExpiresIn),
    );
  }

  /**
   * Converts the validated compact duration syntax into milliseconds.
   *
   * Supported units are milliseconds, seconds, minutes, hours, days, weeks,
   * and years. The environment validator normally guarantees this format; the
   * explicit error protects programmatic or test configuration as well.
   *
   * @param duration Positive duration such as `15m`, `30d`, or `1y`.
   * @returns Equivalent duration in milliseconds.
   * @throws Error When the supplied duration does not match the supported
   * syntax.
   */
  private durationToMilliseconds(duration: string): number {
    const match = /^([1-9]\d*)(ms|s|m|h|d|w|y)$/.exec(duration);

    if (!match) {
      throw new Error(`Invalid duration: ${duration}`);
    }

    const value = Number.parseInt(match[1], 10);
    const unit = match[2];
    const unitMilliseconds: Record<string, number> = {
      ms: 1,
      s: 1_000,
      m: 60_000,
      h: 3_600_000,
      d: 86_400_000,
      w: 604_800_000,
      y: 31_536_000_000,
    };

    return value * unitMilliseconds[unit];
  }

  /**
   * Extracts a PostgreSQL unique-constraint name from a TypeORM query failure.
   *
   * Non-PostgreSQL errors and non-unique SQLSTATE codes are deliberately
   * ignored so callers can rethrow their original unexpected failures.
   *
   * @param error Unknown exception caught around a persistence operation.
   * @returns Violated constraint name for SQLSTATE `23505`, otherwise
   * `undefined`.
   */
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
