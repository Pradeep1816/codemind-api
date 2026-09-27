import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { KnowledgeBuildErrorEntity } from './entities/knowledge-build-error.entity';
import { KnowledgeBuildEntity } from './entities/knowledge-build.entity';
import { KnowledgeEdgeEvidenceEntity } from './entities/knowledge-edge-evidence.entity';
import { KnowledgeEdgeEntity } from './entities/knowledge-edge.entity';
import { KnowledgeEvidenceEntity } from './entities/knowledge-evidence.entity';
import { KnowledgeNodeEvidenceEntity } from './entities/knowledge-node-evidence.entity';
import { KnowledgeNodeEntity } from './entities/knowledge-node.entity';
import { KnowledgeSnapshotEntity } from './entities/knowledge-snapshot.entity';
import { KnowledgePersistenceRepository } from './persistence/knowledge-persistence.repository';
import { ArchitectureKnowledgeProjector } from './services/architecture-knowledge.projector';
import { BusinessKnowledgeProjector } from './services/business-knowledge.projector';
import { EventKnowledgeProjector } from './services/event-knowledge.projector';
import { KnowledgePersistenceService } from './services/knowledge-persistence.service';
import { StateKnowledgeProjector } from './services/state-knowledge.projector';

@Module({
  imports: [
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
  providers: [
    KnowledgePersistenceRepository,
    KnowledgePersistenceService,
    ArchitectureKnowledgeProjector,
    BusinessKnowledgeProjector,
    StateKnowledgeProjector,
    EventKnowledgeProjector,
  ],
  exports: [
    KnowledgePersistenceService,
    ArchitectureKnowledgeProjector,
    BusinessKnowledgeProjector,
    StateKnowledgeProjector,
    EventKnowledgeProjector,
  ],
})
export class KnowledgeModule {}
