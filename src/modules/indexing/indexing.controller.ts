import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import {
  IndexJobListResponseDto,
  IndexStatusDto,
} from './dto/index-status.dto';
import { ListIndexJobsQueryDto } from './dto/list-index-jobs-query.dto';
import { StartIndexDto } from './dto/start-index.dto';
import { IndexingService } from './indexing.service';

@Controller({
  path: 'repositories/:repositoryId/index-jobs',
  version: '1',
})
@RequirePermissions('repository.read')
export class IndexingController {
  constructor(private readonly indexingService: IndexingService) {}

  @RequirePermissions('repository.read', 'repository.index')
  @Post()
  create(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('repositoryId', ParseIntPipe) repositoryId: number,
    @Body() input: StartIndexDto,
  ): Promise<IndexStatusDto> {
    return this.indexingService.createJob(
      currentUser.organization.id,
      currentUser.id,
      repositoryId,
      input,
    );
  }

  @Get()
  list(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('repositoryId', ParseIntPipe) repositoryId: number,
    @Query() query: ListIndexJobsQueryDto,
  ): Promise<IndexJobListResponseDto> {
    return this.indexingService.listJobs(
      currentUser.organization.id,
      repositoryId,
      query,
    );
  }

  @Get(':jobId')
  findOne(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('repositoryId', ParseIntPipe) repositoryId: number,
    @Param('jobId', ParseIntPipe) jobId: number,
  ): Promise<IndexStatusDto> {
    return this.indexingService.findJob(
      currentUser.organization.id,
      repositoryId,
      jobId,
    );
  }

  @RequirePermissions('repository.read', 'repository.index')
  @Post(':jobId/cancel')
  @HttpCode(HttpStatus.OK)
  cancel(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('repositoryId', ParseIntPipe) repositoryId: number,
    @Param('jobId', ParseIntPipe) jobId: number,
  ): Promise<IndexStatusDto> {
    return this.indexingService.cancelJob(
      currentUser.organization.id,
      repositoryId,
      jobId,
    );
  }

  @RequirePermissions('repository.read', 'repository.index')
  @Post(':jobId/retry')
  retry(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('repositoryId', ParseIntPipe) repositoryId: number,
    @Param('jobId', ParseIntPipe) jobId: number,
  ): Promise<IndexStatusDto> {
    return this.indexingService.retryJob(
      currentUser.organization.id,
      currentUser.id,
      repositoryId,
      jobId,
    );
  }
}
