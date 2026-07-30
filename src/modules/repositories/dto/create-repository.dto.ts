import { Transform, TransformFnParams } from 'class-transformer';
import {
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

function trimString({ value }: TransformFnParams): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export class CreateRepositoryDto {
  @Transform(trimString)
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  name!: string;

  @Transform(trimString)
  @IsUrl({
    protocols: ['https'],
    require_protocol: true,
    require_tld: false,
    disallow_auth: true,
    allow_fragments: false,
    allow_query_components: false,
    max_allowed_length: 2048,
  })
  @MaxLength(2048)
  remoteUrl!: string;

  @Transform(trimString)
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  @Matches(/^[A-Za-z0-9._/-]+$/)
  defaultBranch?: string;
}
