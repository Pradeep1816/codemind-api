import { Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { CodeSymbolKind } from '../../indexing/enums/code-symbol-kind.enum';
import { SourceLanguage } from '../../indexing/enums/source-language.enum';
import { KnowledgeNodeKind } from '../../knowledge/enums/knowledge-node-kind.enum';
import { SearchDocumentSourceType } from '../enums/search-document-source-type.enum';
import type { SearchDocumentKind } from '../query/search-query.types';

const SEARCH_DOCUMENT_KINDS: SearchDocumentKind[] = [
  'file',
  ...Object.values(CodeSymbolKind),
  ...Object.values(KnowledgeNodeKind),
];

export class SearchQueryDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  branchId!: number;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  query!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;

  @IsOptional()
  @IsEnum(SearchDocumentSourceType)
  sourceType?: SearchDocumentSourceType;

  @IsOptional()
  @IsEnum(SourceLanguage)
  language?: SourceLanguage;

  @IsOptional()
  @IsIn(SEARCH_DOCUMENT_KINDS)
  kind?: SearchDocumentKind;
}
