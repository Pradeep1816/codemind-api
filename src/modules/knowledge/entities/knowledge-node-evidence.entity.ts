import { Entity, Index, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { KnowledgeEvidenceEntity } from './knowledge-evidence.entity';
import { KnowledgeNodeEntity } from './knowledge-node.entity';

@Entity({ name: 'knowledge_node_evidence' })
@Index('idx_knowledge_node_evidence_evidence_id', ['knowledgeEvidenceId'])
export class KnowledgeNodeEvidenceEntity {
  @PrimaryColumn({
    name: 'knowledge_node_id',
    type: 'integer',
    primaryKeyConstraintName: 'PK_knowledge_node_evidence',
  })
  knowledgeNodeId!: number;

  @PrimaryColumn({
    name: 'knowledge_evidence_id',
    type: 'integer',
    primaryKeyConstraintName: 'PK_knowledge_node_evidence',
  })
  knowledgeEvidenceId!: number;

  @ManyToOne(() => KnowledgeNodeEntity, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'knowledge_node_id',
    foreignKeyConstraintName: 'FK_knowledge_node_evidence_node_id',
  })
  knowledgeNode!: KnowledgeNodeEntity;

  @ManyToOne(() => KnowledgeEvidenceEntity, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'knowledge_evidence_id',
    foreignKeyConstraintName: 'FK_knowledge_node_evidence_evidence_id',
  })
  knowledgeEvidence!: KnowledgeEvidenceEntity;
}
