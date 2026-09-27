import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { KnowledgeEdgeEvidenceEntity } from '../entities/knowledge-edge-evidence.entity';
import { KnowledgeEdgeEntity } from '../entities/knowledge-edge.entity';
import { KnowledgeNodeEvidenceEntity } from '../entities/knowledge-node-evidence.entity';
import { KnowledgeNodeEntity } from '../entities/knowledge-node.entity';
import { KnowledgeSnapshotEntity } from '../entities/knowledge-snapshot.entity';
import { KnowledgeEdgeKind } from '../enums/knowledge-edge-kind.enum';
import { KnowledgeNodeKind } from '../enums/knowledge-node-kind.enum';
import { KnowledgeSnapshotStatus } from '../enums/knowledge-snapshot-status.enum';

export interface FindKnowledgeSnapshotsOptions {
  organizationId: string;
  repositoryId: number;
  page: number;
  limit: number;
  branchId?: number;
}

export interface FindKnowledgeNodesOptions {
  organizationId: string;
  repositoryId: number;
  snapshotId: number;
  page: number;
  limit: number;
  kind?: KnowledgeNodeKind;
  search?: string;
}

export interface FindKnowledgeEdgesOptions {
  organizationId: string;
  repositoryId: number;
  snapshotId: number;
  page: number;
  limit: number;
  kind?: KnowledgeEdgeKind;
  nodeId?: number;
}

@Injectable()
export class KnowledgeQueryRepository {
  constructor(
    @InjectRepository(KnowledgeSnapshotEntity)
    private readonly snapshotRepository: Repository<KnowledgeSnapshotEntity>,
    @InjectRepository(KnowledgeNodeEntity)
    private readonly nodeRepository: Repository<KnowledgeNodeEntity>,
    @InjectRepository(KnowledgeEdgeEntity)
    private readonly edgeRepository: Repository<KnowledgeEdgeEntity>,
    @InjectRepository(KnowledgeNodeEvidenceEntity)
    private readonly nodeEvidenceRepository: Repository<KnowledgeNodeEvidenceEntity>,
    @InjectRepository(KnowledgeEdgeEvidenceEntity)
    private readonly edgeEvidenceRepository: Repository<KnowledgeEdgeEvidenceEntity>,
  ) {}

  findPublishedSnapshots(
    options: FindKnowledgeSnapshotsOptions,
  ): Promise<[KnowledgeSnapshotEntity[], number]> {
    const query = this.snapshotRepository
      .createQueryBuilder('snapshot')
      .where('snapshot.organizationId = :organizationId', {
        organizationId: options.organizationId,
      })
      .andWhere('snapshot.repositoryId = :repositoryId', {
        repositoryId: options.repositoryId,
      })
      .andWhere('snapshot.status = :status', {
        status: KnowledgeSnapshotStatus.Published,
      });

    if (options.branchId !== undefined) {
      query.andWhere('snapshot.branchId = :branchId', {
        branchId: options.branchId,
      });
    }

    return query
      .orderBy('snapshot.createdAt', 'DESC')
      .addOrderBy('snapshot.id', 'DESC')
      .skip((options.page - 1) * options.limit)
      .take(options.limit)
      .getManyAndCount();
  }

  findCurrentPublishedSnapshot(
    organizationId: string,
    repositoryId: number,
    branchId: number,
  ): Promise<KnowledgeSnapshotEntity | null> {
    return this.snapshotRepository.findOne({
      where: {
        organizationId,
        repositoryId,
        branchId,
        status: KnowledgeSnapshotStatus.Published,
        isCurrent: true,
      },
    });
  }

  findPublishedSnapshotById(
    organizationId: string,
    repositoryId: number,
    snapshotId: number,
  ): Promise<KnowledgeSnapshotEntity | null> {
    return this.snapshotRepository.findOne({
      where: {
        id: snapshotId,
        organizationId,
        repositoryId,
        status: KnowledgeSnapshotStatus.Published,
      },
    });
  }

  async countGraph(
    snapshotId: number,
  ): Promise<{ nodes: number; edges: number }> {
    const [nodes, edges] = await Promise.all([
      this.nodeRepository.countBy({ snapshotId }),
      this.edgeRepository.countBy({ snapshotId }),
    ]);

    return { nodes, edges };
  }

  findNodes(
    options: FindKnowledgeNodesOptions,
  ): Promise<[KnowledgeNodeEntity[], number]> {
    const query = this.nodeRepository
      .createQueryBuilder('node')
      .where('node.organizationId = :organizationId', {
        organizationId: options.organizationId,
      })
      .andWhere('node.repositoryId = :repositoryId', {
        repositoryId: options.repositoryId,
      })
      .andWhere('node.snapshotId = :snapshotId', {
        snapshotId: options.snapshotId,
      });

    if (options.kind !== undefined) {
      query.andWhere('node.kind = :kind', { kind: options.kind });
    }

    if (options.search) {
      query.andWhere('node.name ILIKE :search', {
        search: `%${options.search}%`,
      });
    }

    return query
      .orderBy('node.kind', 'ASC')
      .addOrderBy('node.name', 'ASC')
      .addOrderBy('node.id', 'ASC')
      .skip((options.page - 1) * options.limit)
      .take(options.limit)
      .getManyAndCount();
  }

  findNodeById(
    organizationId: string,
    repositoryId: number,
    snapshotId: number,
    nodeId: number,
  ): Promise<KnowledgeNodeEntity | null> {
    return this.nodeRepository.findOne({
      where: { id: nodeId, organizationId, repositoryId, snapshotId },
    });
  }

  findEdges(
    options: FindKnowledgeEdgesOptions,
  ): Promise<[KnowledgeEdgeEntity[], number]> {
    const query = this.edgeRepository
      .createQueryBuilder('edge')
      .innerJoinAndSelect('edge.sourceNode', 'sourceNode')
      .innerJoinAndSelect('edge.targetNode', 'targetNode')
      .where('edge.organizationId = :organizationId', {
        organizationId: options.organizationId,
      })
      .andWhere('edge.repositoryId = :repositoryId', {
        repositoryId: options.repositoryId,
      })
      .andWhere('edge.snapshotId = :snapshotId', {
        snapshotId: options.snapshotId,
      });

    if (options.kind !== undefined) {
      query.andWhere('edge.kind = :kind', { kind: options.kind });
    }

    if (options.nodeId !== undefined) {
      query.andWhere(
        '(edge.sourceNodeId = :nodeId OR edge.targetNodeId = :nodeId)',
        { nodeId: options.nodeId },
      );
    }

    return query
      .orderBy('edge.kind', 'ASC')
      .addOrderBy('edge.id', 'ASC')
      .skip((options.page - 1) * options.limit)
      .take(options.limit)
      .getManyAndCount();
  }

  findEdgeById(
    organizationId: string,
    repositoryId: number,
    snapshotId: number,
    edgeId: number,
  ): Promise<KnowledgeEdgeEntity | null> {
    return this.edgeRepository.findOne({
      where: { id: edgeId, organizationId, repositoryId, snapshotId },
      relations: { sourceNode: true, targetNode: true },
    });
  }

  findNodeEvidence(
    nodeId: number,
    limit: number,
  ): Promise<[KnowledgeNodeEvidenceEntity[], number]> {
    return this.nodeEvidenceRepository.findAndCount({
      where: { knowledgeNodeId: nodeId },
      relations: {
        knowledgeEvidence: {
          indexedFile: true,
          fileHash: true,
          codeSymbol: true,
        },
      },
      order: { knowledgeEvidenceId: 'ASC' },
      take: limit,
    });
  }

  findEdgeEvidence(
    edgeId: number,
    limit: number,
  ): Promise<[KnowledgeEdgeEvidenceEntity[], number]> {
    return this.edgeEvidenceRepository.findAndCount({
      where: { knowledgeEdgeId: edgeId },
      relations: {
        knowledgeEvidence: {
          indexedFile: true,
          fileHash: true,
          codeSymbol: true,
        },
      },
      order: { knowledgeEvidenceId: 'ASC' },
      take: limit,
    });
  }
}
