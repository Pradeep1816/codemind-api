import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import indexingConfig from '../../config/indexing.config';
import { ParserModule } from '../parser/parser.module';
import { RepositoriesModule } from '../repositories/repositories.module';
import { ContentHashService } from './content/content-hash.service';
import { CodeSymbolEntity } from './entities/code-symbol.entity';
import { FileHashEntity } from './entities/file-hash.entity';
import { IndexJobEntity } from './entities/index-job.entity';
import { IndexedFileEntity } from './entities/indexed-file.entity';
import { IndexingErrorEntity } from './entities/indexing-error.entity';
import { FileDiscoveryService } from './discovery/file-discovery.service';
import { FileInventoryService } from './file-inventory.service';
import { IndexingController } from './indexing.controller';
import { IndexingService } from './indexing.service';
import { IndexingWorkspaceService } from './workspace/indexing-workspace.service';
import { IndexingRepository } from './indexing.repository';
import { LanguageDetectionService } from './language/language-detection.service';
import { SourceParsingService } from './parsing/source-parsing.service';
import { CodeSymbolsRepository } from './symbols/code-symbols.repository';
import { SymbolExtractionService } from './symbols/symbol-extraction.service';

@Module({
  imports: [
    ConfigModule.forFeature(indexingConfig),
    ParserModule,
    RepositoriesModule,
    TypeOrmModule.forFeature([
      IndexJobEntity,
      IndexedFileEntity,
      FileHashEntity,
      IndexingErrorEntity,
      CodeSymbolEntity,
    ]),
  ],
  controllers: [IndexingController],
  providers: [
    IndexingService,
    IndexingRepository,
    IndexingWorkspaceService,
    FileDiscoveryService,
    FileInventoryService,
    ContentHashService,
    LanguageDetectionService,
    SourceParsingService,
    CodeSymbolsRepository,
    SymbolExtractionService,
  ],
  exports: [
    IndexingService,
    IndexingWorkspaceService,
    FileDiscoveryService,
    FileInventoryService,
    ContentHashService,
    LanguageDetectionService,
    SourceParsingService,
    SymbolExtractionService,
  ],
})
export class IndexingModule {}
