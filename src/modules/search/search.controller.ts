import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { BuildSearchIndexDto } from './dto/build-search-index.dto';
import { SearchQueryDto } from './dto/search-query.dto';
import { SearchProjectionService } from './projection/search-projection.service';
import type { SearchProjectionResult } from './projection/search-projection.types';
import { SearchQueryService } from './query/search-query.service';
import type { SearchQueryResult } from './query/search-query.types';

@Controller({
  path: 'repositories/:repositoryId/search',
  version: '1',
})
@RequirePermissions('repository.read', 'search.use')
export class SearchController {
  constructor(
    private readonly searchQueryService: SearchQueryService,
    private readonly searchProjectionService: SearchProjectionService,
  ) {}

  /** Builds or reuses the current branch's immutable search projection. */
  @RequirePermissions('repository.read', 'repository.index', 'search.use')
  @Post('indexes')
  buildIndex(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('repositoryId', ParseIntPipe) repositoryId: number,
    @Body() input: BuildSearchIndexDto,
  ): Promise<SearchProjectionResult> {
    return this.searchProjectionService.buildCurrent({
      organizationId: currentUser.organization.id,
      repositoryId,
      branchId: input.branchId,
    });
  }

  /** Returns permission-scoped search results from the current branch index. */
  @Get()
  search(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('repositoryId', ParseIntPipe) repositoryId: number,
    @Query() query: SearchQueryDto,
  ): Promise<SearchQueryResult> {
    return this.searchQueryService.search({
      organizationId: currentUser.organization.id,
      repositoryId,
      branchId: query.branchId,
      query: query.query,
      page: query.page,
      limit: query.limit,
      sourceType: query.sourceType,
      language: query.language,
      kind: query.kind,
    });
  }
}
