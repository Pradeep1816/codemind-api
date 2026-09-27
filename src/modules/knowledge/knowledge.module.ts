import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RepositoriesModule } from '../repositories/repositories.module';
import { KnowledgeBuildErrorEntity } from './entities/knowledge-build-error.entity';
import { KnowledgeBuildEntity } from './entities/knowledge-build.entity';
import { KnowledgeEdgeEvidenceEntity } from './entities/knowledge-edge-evidence.entity';
import { KnowledgeEdgeEntity } from './entities/knowledge-edge.entity';
import { KnowledgeEvidenceEntity } from './entities/knowledge-evidence.entity';
import { KnowledgeNodeEvidenceEntity } from './entities/knowledge-node-evidence.entity';
import { KnowledgeNodeEntity } from './entities/knowledge-node.entity';
import { KnowledgeSnapshotEntity } from './entities/knowledge-snapshot.entity';
import { KnowledgeController } from './knowledge.controller';
import { KnowledgePersistenceRepository } from './persistence/knowledge-persistence.repository';
import { KnowledgeQueryRepository } from './repositories/knowledge-query.repository';
import { ArchitectureKnowledgeProjector } from './services/architecture-knowledge.projector';
import { BusinessKnowledgeProjector } from './services/business-knowledge.projector';
import { EventKnowledgeProjector } from './services/event-knowledge.projector';
import { KnowledgePersistenceService } from './services/knowledge-persistence.service';
import { KnowledgeQueryService } from './services/knowledge-query.service';
import { StateKnowledgeProjector } from './services/state-knowledge.projector';
import { WorkflowKnowledgeProjector } from './services/workflow-knowledge.projector';

@Module({
  imports: [
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
  controllers: [KnowledgeController],
  providers: [
    KnowledgePersistenceRepository,
    KnowledgePersistenceService,
    KnowledgeQueryRepository,
    KnowledgeQueryService,
    ArchitectureKnowledgeProjector,
    BusinessKnowledgeProjector,
    StateKnowledgeProjector,
    EventKnowledgeProjector,
    WorkflowKnowledgeProjector,
  ],
  exports: [
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
