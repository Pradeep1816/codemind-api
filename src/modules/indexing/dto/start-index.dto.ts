import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Min } from 'class-validator';
import { IndexingMode } from '../enums/indexing-mode.enum';

export class StartIndexDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  branchId!: number;

  @IsOptional()
  @IsEnum(IndexingMode)
  mode?: IndexingMode = IndexingMode.Incremental;
}
