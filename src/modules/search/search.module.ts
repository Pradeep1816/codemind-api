import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import searchConfig from '../../config/search.config';
import { IndexingModule } from '../indexing/indexing.module';
import { KnowledgeModule } from '../knowledge/knowledge.module';
import { SearchDocumentEntity } from './entities/search-document.entity';
import { SearchIndexEntity } from './entities/search-index.entity';
import { SearchDocumentBuilderService } from './projection/search-document-builder.service';
import { SearchProjectionRepository } from './projection/search-projection.repository';
import { SearchProjectionService } from './projection/search-projection.service';

@Module({
  imports: [
    ConfigModule.forFeature(searchConfig),
    IndexingModule,
    KnowledgeModule,
    TypeOrmModule.forFeature([SearchIndexEntity, SearchDocumentEntity]),
  ],
  providers: [
    SearchDocumentBuilderService,
    SearchProjectionRepository,
    SearchProjectionService,
  ],
  exports: [SearchProjectionService],
})
export class SearchModule {}
