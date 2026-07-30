import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { CreateRepositoryDto } from './dto/create-repository.dto';
import { ListRepositoriesQueryDto } from './dto/list-repositories-query.dto';
import {
  RepositoryListResponseDto,
  RepositoryResponseDto,
} from './dto/repository-response.dto';
import { UpdateRepositoryDto } from './dto/update-repository.dto';
import { RepositoriesService } from './repositories.service';

@Controller({
  path: 'repositories',
  version: '1',
})
@RequirePermissions('repository.read')
export class RepositoriesController {
  constructor(private readonly repositoriesService: RepositoriesService) {}

  @RequirePermissions('repository.create')
  @Post()
  create(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body() input: CreateRepositoryDto,
  ): Promise<RepositoryResponseDto> {
    return this.repositoriesService.create(
      currentUser.organization.id,
      currentUser.id,
      input,
    );
  }

  @Get()
  list(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Query() query: ListRepositoriesQueryDto,
  ): Promise<RepositoryListResponseDto> {
    return this.repositoriesService.list(currentUser.organization.id, query);
  }

  @RequirePermissions('repository.create')
  @Patch(':repositoryId')
  update(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('repositoryId', ParseIntPipe) repositoryId: number,
    @Body() input: UpdateRepositoryDto,
  ): Promise<RepositoryResponseDto> {
    return this.repositoriesService.update(
      currentUser.organization.id,
      repositoryId,
      input,
    );
  }

  @RequirePermissions('repository.delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete(':repositoryId')
  remove(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('repositoryId', ParseIntPipe) repositoryId: number,
  ): Promise<void> {
    return this.repositoriesService.remove(
      currentUser.organization.id,
      repositoryId,
    );
  }

  @Get(':repositoryId')
  findOne(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('repositoryId', ParseIntPipe) repositoryId: number,
  ): Promise<RepositoryResponseDto> {
    return this.repositoriesService.findOne(
      currentUser.organization.id,
      repositoryId,
    );
  }
}
