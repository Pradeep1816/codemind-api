import { Controller, Get, Param, ParseIntPipe, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { REPOSITORY_RATE_LIMIT_POLICIES } from '../../config/rate-limit.config';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { RepositoryBranchesResponseDto } from './dto/repository-branch-response.dto';
import { RepositoryBranchesService } from './repository-branches.service';

@Controller({
  path: 'repositories/:repositoryId/branches',
  version: '1',
})
@RequirePermissions('repository.read')
export class RepositoryBranchesController {
  constructor(
    private readonly repositoryBranchesService: RepositoryBranchesService,
  ) {}

  @Get()
  list(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('repositoryId', ParseIntPipe) repositoryId: number,
  ): Promise<RepositoryBranchesResponseDto> {
    return this.repositoryBranchesService.list(
      currentUser.organization.id,
      repositoryId,
    );
  }

  @RequirePermissions('repository.read', 'repository.index')
  @Throttle({ default: REPOSITORY_RATE_LIMIT_POLICIES.sync })
  @Post('sync')
  synchronize(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('repositoryId', ParseIntPipe) repositoryId: number,
  ): Promise<RepositoryBranchesResponseDto> {
    return this.repositoryBranchesService.synchronize(
      currentUser.organization.id,
      repositoryId,
    );
  }
}
