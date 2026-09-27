import { IsEnum, IsOptional } from 'class-validator';
import { KnowledgeBuildStatus } from '../enums/knowledge-build-status.enum';
import { PaginationQueryDto } from './knowledge-query.dto';

export class ListKnowledgeBuildsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(KnowledgeBuildStatus)
  status?: KnowledgeBuildStatus;
}
