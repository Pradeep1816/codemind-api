import { Entity, Index, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { KnowledgeEdgeEntity } from './knowledge-edge.entity';
import { KnowledgeEvidenceEntity } from './knowledge-evidence.entity';

@Entity({ name: 'knowledge_edge_evidence' })
@Index('idx_knowledge_edge_evidence_evidence_id', ['knowledgeEvidenceId'])
export class KnowledgeEdgeEvidenceEntity {
  @PrimaryColumn({
    name: 'knowledge_edge_id',
    type: 'integer',
    primaryKeyConstraintName: 'PK_knowledge_edge_evidence',
  })
  knowledgeEdgeId!: number;

  @PrimaryColumn({
    name: 'knowledge_evidence_id',
    type: 'integer',
    primaryKeyConstraintName: 'PK_knowledge_edge_evidence',
  })
  knowledgeEvidenceId!: number;

  @ManyToOne(() => KnowledgeEdgeEntity, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'knowledge_edge_id',
    foreignKeyConstraintName: 'FK_knowledge_edge_evidence_edge_id',
  })
  knowledgeEdge!: KnowledgeEdgeEntity;

  @ManyToOne(() => KnowledgeEvidenceEntity, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'knowledge_evidence_id',
    foreignKeyConstraintName: 'FK_knowledge_edge_evidence_evidence_id',
  })
  knowledgeEvidence!: KnowledgeEvidenceEntity;
}
