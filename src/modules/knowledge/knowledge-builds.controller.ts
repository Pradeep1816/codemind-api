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
  KnowledgeBuildListResponseDto,
  KnowledgeBuildResponseDto,
} from './dto/knowledge-build-response.dto';
import { ListKnowledgeBuildsQueryDto } from './dto/list-knowledge-builds-query.dto';
import { StartKnowledgeBuildDto } from './dto/start-knowledge-build.dto';
import { KnowledgeBuildService } from './services/knowledge-build.service';

@Controller({
  path: 'repositories/:repositoryId/knowledge/builds',
  version: '1',
})
@RequirePermissions('repository.read')
export class KnowledgeBuildsController {
  constructor(private readonly knowledgeBuildService: KnowledgeBuildService) {}

  @RequirePermissions('repository.read', 'knowledge.manage')
  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  create(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('repositoryId', ParseIntPipe) repositoryId: number,
    @Body() input: StartKnowledgeBuildDto,
  ): Promise<KnowledgeBuildResponseDto> {
    return this.knowledgeBuildService.create(
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
    @Query() query: ListKnowledgeBuildsQueryDto,
  ): Promise<KnowledgeBuildListResponseDto> {
    return this.knowledgeBuildService.list(
      currentUser.organization.id,
      repositoryId,
      query,
    );
  }

  @Get(':buildId')
  findOne(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('repositoryId', ParseIntPipe) repositoryId: number,
    @Param('buildId', ParseIntPipe) buildId: number,
  ): Promise<KnowledgeBuildResponseDto> {
    return this.knowledgeBuildService.findOne(
      currentUser.organization.id,
      repositoryId,
      buildId,
    );
  }

  @RequirePermissions('repository.read', 'knowledge.manage')
  @Post(':buildId/cancel')
  cancel(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('repositoryId', ParseIntPipe) repositoryId: number,
    @Param('buildId', ParseIntPipe) buildId: number,
  ): Promise<KnowledgeBuildResponseDto> {
    return this.knowledgeBuildService.cancel(
      currentUser.organization.id,
      repositoryId,
      buildId,
    );
  }

  @RequirePermissions('repository.read', 'knowledge.manage')
  @Post(':buildId/retry')
  retry(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('repositoryId', ParseIntPipe) repositoryId: number,
    @Param('buildId', ParseIntPipe) buildId: number,
  ): Promise<KnowledgeBuildResponseDto> {
    return this.knowledgeBuildService.retry(
      currentUser.organization.id,
      repositoryId,
      buildId,
    );
  }
}
