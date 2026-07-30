import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../../../common/decorators/public.decorator';
import { REQUIRED_PERMISSIONS_KEY } from '../../../common/decorators/require-permissions.decorator';
import { OrganizationsService } from '../../organizations/organizations.service';
import type { AuthenticatedUser } from '../interfaces/authenticated-user.interface';

interface RequestWithAuthenticatedUser {
  user?: AuthenticatedUser;
}

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly organizationsService: OrganizationsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    try {
      const targets = [context.getHandler(), context.getClass()];
      const isPublic = this.reflector.getAllAndOverride<boolean>(
        IS_PUBLIC_KEY,
        targets,
      );

      if (isPublic) {
        return true;
      }

      const requiredPermissions = this.reflector.getAllAndOverride<string[]>(
        REQUIRED_PERMISSIONS_KEY,
        targets,
      );

      if (!requiredPermissions?.length) {
        return true;
      }

      const request = context
        .switchToHttp()
        .getRequest<RequestWithAuthenticatedUser>();
      const user = request.user;

      if (!user) {
        throw new UnauthorizedException('Authenticated user is required');
      }

      const grantedPermissions =
        await this.organizationsService.getUserPermissionNames(
          user.id,
          user.organization.id,
        );
      const grantedPermissionSet = new Set(grantedPermissions);
      const hasEveryPermission = requiredPermissions.every((permission) =>
        grantedPermissionSet.has(permission),
      );

      if (!hasEveryPermission) {
        throw new ForbiddenException(
          'You do not have permission to perform this action',
        );
      }

      request.user = {
        ...user,
        permissions: grantedPermissions,
      };

      return true;
    } catch (error: unknown) {
      if (
        error instanceof UnauthorizedException ||
        error instanceof ForbiddenException
      ) {
        throw error;
      }

      const message = error instanceof Error ? error.message : String(error);

      console.error('Permission authorization check failed', message);

      throw new ServiceUnavailableException(
        'Authorization service is temporarily unavailable',
      );
    }
  }
}
