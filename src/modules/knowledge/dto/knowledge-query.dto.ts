import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { KnowledgeEdgeKind } from '../enums/knowledge-edge-kind.enum';
import { KnowledgeNodeKind } from '../enums/knowledge-node-kind.enum';

export class PaginationQueryDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;
}

export class ListKnowledgeSnapshotsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  branchId?: number;
}

export class CurrentKnowledgeSnapshotQueryDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  branchId!: number;
}

export class ListKnowledgeNodesQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(KnowledgeNodeKind)
  kind?: KnowledgeNodeKind;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;
}

export class ListKnowledgeEdgesQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(KnowledgeEdgeKind)
  kind?: KnowledgeEdgeKind;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  nodeId?: number;
}
