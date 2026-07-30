import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { AddRepositoryMemberDto } from './dto/add-repository-member.dto';
import { RepositoryMemberResponseDto } from './dto/repository-member-response.dto';
import { RepositoryMembersService } from './repository-members.service';

@Controller({
  path: 'repositories/:repositoryId/members',
  version: '1',
})
@RequirePermissions('repository.read')
export class RepositoryMembersController {
  constructor(
    private readonly repositoryMembersService: RepositoryMembersService,
  ) {}

  @RequirePermissions('repository.read', 'repository.member.manage')
  @Post()
  add(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('repositoryId', ParseIntPipe) repositoryId: number,
    @Body() input: AddRepositoryMemberDto,
  ): Promise<RepositoryMemberResponseDto> {
    return this.repositoryMembersService.add(
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
  ): Promise<RepositoryMemberResponseDto[]> {
    return this.repositoryMembersService.list(
      currentUser.organization.id,
      repositoryId,
    );
  }

  @RequirePermissions('repository.read', 'repository.member.manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete(':userId')
  remove(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('repositoryId', ParseIntPipe) repositoryId: number,
    @Param('userId', ParseUUIDPipe) userId: string,
  ): Promise<void> {
    return this.repositoryMembersService.remove(
      currentUser.organization.id,
      repositoryId,
      userId,
    );
  }
}
