import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SearchDocumentEntity } from './entities/search-document.entity';
import { SearchIndexEntity } from './entities/search-index.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([SearchIndexEntity, SearchDocumentEntity]),
  ],
})
export class SearchModule {}
