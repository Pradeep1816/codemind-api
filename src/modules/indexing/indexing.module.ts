import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import indexingConfig from '../../config/indexing.config';
import { ParserModule } from '../parser/parser.module';
import { RepositoriesModule } from '../repositories/repositories.module';
import { ContentHashService } from './content/content-hash.service';
import { CodeDependenciesRepository } from './dependencies/code-dependencies.repository';
import { DependencyExtractionService } from './dependencies/dependency-extraction.service';
import { RelativeModuleResolverService } from './dependencies/relative-module-resolver.service';
import { CodeDependencyEntity } from './entities/code-dependency.entity';
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
import { IndexJobLifecycleRepository } from './lifecycle/index-job-lifecycle.repository';
import { IndexJobLifecycleService } from './lifecycle/index-job-lifecycle.service';
import { SourceParsingService } from './parsing/source-parsing.service';
import { CodeSymbolsRepository } from './symbols/code-symbols.repository';
import { SymbolExtractionService } from './symbols/symbol-extraction.service';
import { IndexingProcessor } from './queue/indexing.processor';
import { IndexingQueue } from './queue/indexing.queue';
import { IndexingJobService } from './services/indexing-job.service';
import { IndexingWorker } from './workers/indexing.worker';
import { CODE_INTELLIGENCE_READER } from './ports/code-intelligence-reader.port';
import { IMMUTABLE_SOURCE_READER } from './ports/immutable-source-reader.port';
import { CodeIntelligenceReaderService } from './readers/code-intelligence-reader.service';
import { ImmutableSourceReaderService } from './readers/immutable-source-reader.service';

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
      CodeDependencyEntity,
    ]),
  ],
  controllers: [IndexingController],
  providers: [
    IndexingService,
    IndexingRepository,
    IndexJobLifecycleRepository,
    IndexJobLifecycleService,
    IndexingJobService,
    IndexingQueue,
    IndexingProcessor,
    IndexingWorker,
    IndexingWorkspaceService,
    FileDiscoveryService,
    FileInventoryService,
    ContentHashService,
    LanguageDetectionService,
    SourceParsingService,
    CodeSymbolsRepository,
    SymbolExtractionService,
    CodeDependenciesRepository,
    RelativeModuleResolverService,
    DependencyExtractionService,
    CodeIntelligenceReaderService,
    ImmutableSourceReaderService,
    {
      provide: CODE_INTELLIGENCE_READER,
      useExisting: CodeIntelligenceReaderService,
    },
    {
      provide: IMMUTABLE_SOURCE_READER,
      useExisting: ImmutableSourceReaderService,
    },
  ],
  exports: [
    IndexingService,
    IndexJobLifecycleService,
    IndexingWorkspaceService,
    FileDiscoveryService,
    FileInventoryService,
    ContentHashService,
    LanguageDetectionService,
    SourceParsingService,
    SymbolExtractionService,
    DependencyExtractionService,
    CODE_INTELLIGENCE_READER,
    IMMUTABLE_SOURCE_READER,
  ],
})
export class IndexingModule {}
