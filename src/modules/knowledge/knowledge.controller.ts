import { Controller, Get, Param, ParseIntPipe, Query } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import {
  CurrentKnowledgeSnapshotQueryDto,
  ListKnowledgeEdgesQueryDto,
  ListKnowledgeNodesQueryDto,
  ListKnowledgeSnapshotsQueryDto,
} from './dto/knowledge-query.dto';
import {
  KnowledgeEdgeDetailResponseDto,
  KnowledgeEdgeListResponseDto,
  KnowledgeNodeDetailResponseDto,
  KnowledgeNodeListResponseDto,
  KnowledgeSnapshotDetailResponseDto,
  KnowledgeSnapshotListResponseDto,
} from './dto/knowledge-response.dto';
import { KnowledgeQueryService } from './services/knowledge-query.service';

@Controller({
  path: 'repositories/:repositoryId/knowledge',
  version: '1',
})
@RequirePermissions('repository.read')
export class KnowledgeController {
  constructor(private readonly knowledgeQueryService: KnowledgeQueryService) {}

  @Get('snapshots/current')
  findCurrentSnapshot(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('repositoryId', ParseIntPipe) repositoryId: number,
    @Query() query: CurrentKnowledgeSnapshotQueryDto,
  ): Promise<KnowledgeSnapshotDetailResponseDto> {
    return this.knowledgeQueryService.findCurrentSnapshot(
      currentUser.organization.id,
      repositoryId,
      query,
    );
  }

  @Get('snapshots')
  listSnapshots(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('repositoryId', ParseIntPipe) repositoryId: number,
    @Query() query: ListKnowledgeSnapshotsQueryDto,
  ): Promise<KnowledgeSnapshotListResponseDto> {
    return this.knowledgeQueryService.listSnapshots(
      currentUser.organization.id,
      repositoryId,
      query,
    );
  }

  @Get('snapshots/:snapshotId')
  findSnapshot(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('repositoryId', ParseIntPipe) repositoryId: number,
    @Param('snapshotId', ParseIntPipe) snapshotId: number,
  ): Promise<KnowledgeSnapshotDetailResponseDto> {
    return this.knowledgeQueryService.findSnapshot(
      currentUser.organization.id,
      repositoryId,
      snapshotId,
    );
  }

  @Get('snapshots/:snapshotId/nodes')
  listNodes(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('repositoryId', ParseIntPipe) repositoryId: number,
    @Param('snapshotId', ParseIntPipe) snapshotId: number,
    @Query() query: ListKnowledgeNodesQueryDto,
  ): Promise<KnowledgeNodeListResponseDto> {
    return this.knowledgeQueryService.listNodes(
      currentUser.organization.id,
      repositoryId,
      snapshotId,
      query,
    );
  }

  @Get('snapshots/:snapshotId/nodes/:nodeId')
  findNode(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('repositoryId', ParseIntPipe) repositoryId: number,
    @Param('snapshotId', ParseIntPipe) snapshotId: number,
    @Param('nodeId', ParseIntPipe) nodeId: number,
  ): Promise<KnowledgeNodeDetailResponseDto> {
    return this.knowledgeQueryService.findNode(
      currentUser.organization.id,
      repositoryId,
      snapshotId,
      nodeId,
    );
  }

  @Get('snapshots/:snapshotId/edges')
  listEdges(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('repositoryId', ParseIntPipe) repositoryId: number,
    @Param('snapshotId', ParseIntPipe) snapshotId: number,
    @Query() query: ListKnowledgeEdgesQueryDto,
  ): Promise<KnowledgeEdgeListResponseDto> {
    return this.knowledgeQueryService.listEdges(
      currentUser.organization.id,
      repositoryId,
      snapshotId,
      query,
    );
  }

  @Get('snapshots/:snapshotId/edges/:edgeId')
  findEdge(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('repositoryId', ParseIntPipe) repositoryId: number,
    @Param('snapshotId', ParseIntPipe) snapshotId: number,
    @Param('edgeId', ParseIntPipe) edgeId: number,
  ): Promise<KnowledgeEdgeDetailResponseDto> {
    return this.knowledgeQueryService.findEdge(
      currentUser.organization.id,
      repositoryId,
      snapshotId,
      edgeId,
    );
  }
}
