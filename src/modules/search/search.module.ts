import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import searchConfig from '../../config/search.config';
import { IndexingModule } from '../indexing/indexing.module';
import { KnowledgeModule } from '../knowledge/knowledge.module';
import { RepositoriesModule } from '../repositories/repositories.module';
import { SearchDocumentEntity } from './entities/search-document.entity';
import { SearchIndexEntity } from './entities/search-index.entity';
import { SearchDocumentBuilderService } from './projection/search-document-builder.service';
import { SearchProjectionRepository } from './projection/search-projection.repository';
import { SearchProjectionService } from './projection/search-projection.service';
import { SearchGraphExpansionRepository } from './query/search-graph-expansion.repository';
import { SearchQueryRepository } from './query/search-query.repository';
import { SearchQueryService } from './query/search-query.service';
import { SearchRankingService } from './ranking/search-ranking.service';
import { SearchController } from './search.controller';

@Module({
  imports: [
    ConfigModule.forFeature(searchConfig),
    IndexingModule,
    KnowledgeModule,
    RepositoriesModule,
    TypeOrmModule.forFeature([SearchIndexEntity, SearchDocumentEntity]),
  ],
  controllers: [SearchController],
  providers: [
    SearchDocumentBuilderService,
    SearchProjectionRepository,
    SearchProjectionService,
    SearchGraphExpansionRepository,
    SearchRankingService,
    SearchQueryRepository,
    SearchQueryService,
  ],
  exports: [SearchProjectionService, SearchQueryService],
})
export class SearchModule {}
