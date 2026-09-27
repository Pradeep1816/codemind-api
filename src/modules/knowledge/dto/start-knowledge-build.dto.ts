import { Type } from 'class-transformer';
import { IsInt, Min } from 'class-validator';

export class StartKnowledgeBuildDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  sourceIndexJobId!: number;
}
