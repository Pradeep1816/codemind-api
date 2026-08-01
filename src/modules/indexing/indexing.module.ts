import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import indexingConfig from '../../config/indexing.config';
import { RepositoriesModule } from '../repositories/repositories.module';
import { ContentHashService } from './content/content-hash.service';
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

@Module({
  imports: [
    ConfigModule.forFeature(indexingConfig),
    RepositoriesModule,
    TypeOrmModule.forFeature([
      IndexJobEntity,
      IndexedFileEntity,
      FileHashEntity,
      IndexingErrorEntity,
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
  ],
  exports: [
    IndexingService,
    IndexingWorkspaceService,
    FileDiscoveryService,
    FileInventoryService,
    ContentHashService,
  ],
})
export class IndexingModule {}
