import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import knowledgeConfig from '../../config/knowledge.config';
import { AnalysisModule } from '../analysis/analysis.module';
import { IndexingModule } from '../indexing/indexing.module';
import { RepositoriesModule } from '../repositories/repositories.module';
import { KnowledgeBuildErrorEntity } from './entities/knowledge-build-error.entity';
import { KnowledgeBuildEntity } from './entities/knowledge-build.entity';
import { KnowledgeEdgeEvidenceEntity } from './entities/knowledge-edge-evidence.entity';
import { KnowledgeEdgeEntity } from './entities/knowledge-edge.entity';
import { KnowledgeEvidenceEntity } from './entities/knowledge-evidence.entity';
import { KnowledgeNodeEvidenceEntity } from './entities/knowledge-node-evidence.entity';
import { KnowledgeNodeEntity } from './entities/knowledge-node.entity';
import { KnowledgeSnapshotEntity } from './entities/knowledge-snapshot.entity';
import { KnowledgeBuildsController } from './knowledge-builds.controller';
import { KnowledgeController } from './knowledge.controller';
import { KnowledgeBuildLifecycleRepository } from './lifecycle/knowledge-build-lifecycle.repository';
import { KnowledgeBuildLifecycleService } from './lifecycle/knowledge-build-lifecycle.service';
import { KnowledgePersistenceRepository } from './persistence/knowledge-persistence.repository';
import { KnowledgeProcessor } from './queue/knowledge.processor';
import { KnowledgeQueue } from './queue/knowledge.queue';
import { KnowledgeQueryRepository } from './repositories/knowledge-query.repository';
import { ArchitectureKnowledgeProjector } from './services/architecture-knowledge.projector';
import { BusinessKnowledgeProjector } from './services/business-knowledge.projector';
import { EventKnowledgeProjector } from './services/event-knowledge.projector';
import { KnowledgeBuildService } from './services/knowledge-build.service';
import { KnowledgeGraphBuilderService } from './services/knowledge-graph-builder.service';
import { KnowledgePersistenceService } from './services/knowledge-persistence.service';
import { KnowledgeQueryService } from './services/knowledge-query.service';
import { StateKnowledgeProjector } from './services/state-knowledge.projector';
import { WorkflowKnowledgeProjector } from './services/workflow-knowledge.projector';
import { KnowledgeWorker } from './workers/knowledge.worker';

@Module({
  imports: [
    ConfigModule.forFeature(knowledgeConfig),
    AnalysisModule,
    IndexingModule,
    RepositoriesModule,
    TypeOrmModule.forFeature([
      KnowledgeBuildEntity,
      KnowledgeSnapshotEntity,
      KnowledgeNodeEntity,
      KnowledgeEdgeEntity,
      KnowledgeEvidenceEntity,
      KnowledgeNodeEvidenceEntity,
      KnowledgeEdgeEvidenceEntity,
      KnowledgeBuildErrorEntity,
    ]),
  ],
  controllers: [KnowledgeController, KnowledgeBuildsController],
  providers: [
    KnowledgeBuildLifecycleRepository,
    KnowledgeBuildLifecycleService,
    KnowledgePersistenceRepository,
    KnowledgePersistenceService,
    KnowledgeBuildService,
    KnowledgeGraphBuilderService,
    KnowledgeQueue,
    KnowledgeProcessor,
    KnowledgeWorker,
    KnowledgeQueryRepository,
    KnowledgeQueryService,
    ArchitectureKnowledgeProjector,
    BusinessKnowledgeProjector,
    StateKnowledgeProjector,
    EventKnowledgeProjector,
    WorkflowKnowledgeProjector,
  ],
  exports: [
    KnowledgeBuildLifecycleService,
    KnowledgeBuildService,
    KnowledgePersistenceService,
    KnowledgeQueryService,
    ArchitectureKnowledgeProjector,
    BusinessKnowledgeProjector,
    StateKnowledgeProjector,
    EventKnowledgeProjector,
    WorkflowKnowledgeProjector,
  ],
})
export class KnowledgeModule {}
