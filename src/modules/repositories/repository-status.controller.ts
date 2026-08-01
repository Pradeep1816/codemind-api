import { Controller, Get, Param, ParseIntPipe } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { RepositoryStatusResponseDto } from './dto/repository-status-response.dto';
import { RepositoryStatusService } from './repository-status.service';

@Controller({
  path: 'repositories/:repositoryId/status',
  version: '1',
})
@RequirePermissions('repository.read')
export class RepositoryStatusController {
  constructor(
    private readonly repositoryStatusService: RepositoryStatusService,
  ) {}

  @Get()
  getStatus(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('repositoryId', ParseIntPipe) repositoryId: number,
  ): Promise<RepositoryStatusResponseDto> {
    return this.repositoryStatusService.getStatus(
      currentUser.organization.id,
      repositoryId,
    );
  }
}
