import { Injectable, NotFoundException } from '@nestjs/common';
import { RepositoriesService } from '../../repositories/repositories.service';
import {
  CurrentKnowledgeSnapshotQueryDto,
  ListKnowledgeEdgesQueryDto,
  ListKnowledgeNodesQueryDto,
  ListKnowledgeSnapshotsQueryDto,
} from '../dto/knowledge-query.dto';
import {
  KnowledgeEdgeDetailResponseDto,
  KnowledgeEdgeListResponseDto,
  KnowledgeEdgeResponseDto,
  KnowledgeEvidenceSummaryDto,
  KnowledgeNodeDetailResponseDto,
  KnowledgeNodeListResponseDto,
  KnowledgeNodeResponseDto,
  KnowledgeSnapshotDetailResponseDto,
  KnowledgeSnapshotListResponseDto,
  KnowledgeSnapshotResponseDto,
  PaginationResponseDto,
} from '../dto/knowledge-response.dto';
import { KnowledgeEdgeEvidenceEntity } from '../entities/knowledge-edge-evidence.entity';
import { KnowledgeEdgeEntity } from '../entities/knowledge-edge.entity';
import { KnowledgeEvidenceEntity } from '../entities/knowledge-evidence.entity';
import { KnowledgeNodeEvidenceEntity } from '../entities/knowledge-node-evidence.entity';
import { KnowledgeNodeEntity } from '../entities/knowledge-node.entity';
import { KnowledgeSnapshotEntity } from '../entities/knowledge-snapshot.entity';
import { KnowledgeQueryRepository } from '../repositories/knowledge-query.repository';

const MAX_EVIDENCE_SUMMARIES = 100;

@Injectable()
export class KnowledgeQueryService {
  constructor(
    private readonly repositoriesService: RepositoriesService,
    private readonly queryRepository: KnowledgeQueryRepository,
  ) {}

  /** Lists immutable published snapshots without exposing draft build output. */
  async listSnapshots(
    organizationId: string,
    repositoryId: number,
    query: ListKnowledgeSnapshotsQueryDto,
  ): Promise<KnowledgeSnapshotListResponseDto> {
    await this.repositoriesService.findOne(organizationId, repositoryId);

    const [snapshots, total] =
      await this.queryRepository.findPublishedSnapshots({
        organizationId,
        repositoryId,
        branchId: query.branchId,
        page: query.page,
        limit: query.limit,
      });

    return {
      data: snapshots.map((snapshot) => this.toSnapshotResponse(snapshot)),
      pagination: this.toPagination(query.page, query.limit, total),
    };
  }

  /** Returns the published snapshot currently selected for one branch. */
  async findCurrentSnapshot(
    organizationId: string,
    repositoryId: number,
    query: CurrentKnowledgeSnapshotQueryDto,
  ): Promise<KnowledgeSnapshotDetailResponseDto> {
    await this.repositoriesService.findOne(organizationId, repositoryId);
    const snapshot = await this.queryRepository.findCurrentPublishedSnapshot(
      organizationId,
      repositoryId,
      query.branchId,
    );

    if (!snapshot) {
      throw new NotFoundException('Current knowledge snapshot was not found');
    }

    return this.toSnapshotDetail(snapshot);
  }

  /** Returns one historical published snapshot within the tenant boundary. */
  async findSnapshot(
    organizationId: string,
    repositoryId: number,
    snapshotId: number,
  ): Promise<KnowledgeSnapshotDetailResponseDto> {
    const snapshot = await this.requireSnapshot(
      organizationId,
      repositoryId,
      snapshotId,
    );

    return this.toSnapshotDetail(snapshot);
  }

  /** Lists typed nodes from one published snapshot with bounded pagination. */
  async listNodes(
    organizationId: string,
    repositoryId: number,
    snapshotId: number,
    query: ListKnowledgeNodesQueryDto,
  ): Promise<KnowledgeNodeListResponseDto> {
    await this.requireSnapshot(organizationId, repositoryId, snapshotId);
    const [nodes, total] = await this.queryRepository.findNodes({
      organizationId,
      repositoryId,
      snapshotId,
      page: query.page,
      limit: query.limit,
      kind: query.kind,
      search: query.search?.trim() || undefined,
    });

    return {
      data: nodes.map((node) => this.toNodeResponse(node)),
      pagination: this.toPagination(query.page, query.limit, total),
    };
  }

  /** Returns one node and its source evidence summaries. */
  async findNode(
    organizationId: string,
    repositoryId: number,
    snapshotId: number,
    nodeId: number,
  ): Promise<KnowledgeNodeDetailResponseDto> {
    await this.requireSnapshot(organizationId, repositoryId, snapshotId);
    const node = await this.queryRepository.findNodeById(
      organizationId,
      repositoryId,
      snapshotId,
      nodeId,
    );

    if (!node) {
      throw new NotFoundException('Knowledge node was not found');
    }

    const [links, evidenceTotal] = await this.queryRepository.findNodeEvidence(
      node.id,
      MAX_EVIDENCE_SUMMARIES,
    );

    return {
      ...this.toNodeResponse(node),
      evidence: this.toNodeEvidence(links),
      evidenceTotal,
      evidenceTruncated: evidenceTotal > links.length,
    };
  }

  /** Lists typed graph relationships from one published snapshot. */
  async listEdges(
    organizationId: string,
    repositoryId: number,
    snapshotId: number,
    query: ListKnowledgeEdgesQueryDto,
  ): Promise<KnowledgeEdgeListResponseDto> {
    await this.requireSnapshot(organizationId, repositoryId, snapshotId);
    const [edges, total] = await this.queryRepository.findEdges({
      organizationId,
      repositoryId,
      snapshotId,
      page: query.page,
      limit: query.limit,
      kind: query.kind,
      nodeId: query.nodeId,
    });

    return {
      data: edges.map((edge) => this.toEdgeResponse(edge)),
      pagination: this.toPagination(query.page, query.limit, total),
    };
  }

  /** Returns one relationship and its source evidence summaries. */
  async findEdge(
    organizationId: string,
    repositoryId: number,
    snapshotId: number,
    edgeId: number,
  ): Promise<KnowledgeEdgeDetailResponseDto> {
    await this.requireSnapshot(organizationId, repositoryId, snapshotId);
    const edge = await this.queryRepository.findEdgeById(
      organizationId,
      repositoryId,
      snapshotId,
      edgeId,
    );

    if (!edge) {
      throw new NotFoundException('Knowledge edge was not found');
    }

    const [links, evidenceTotal] = await this.queryRepository.findEdgeEvidence(
      edge.id,
      MAX_EVIDENCE_SUMMARIES,
    );

    return {
      ...this.toEdgeResponse(edge),
      evidence: this.toEdgeEvidence(links),
      evidenceTotal,
      evidenceTruncated: evidenceTotal > links.length,
    };
  }

  private async requireSnapshot(
    organizationId: string,
    repositoryId: number,
    snapshotId: number,
  ): Promise<KnowledgeSnapshotEntity> {
    const snapshot = await this.queryRepository.findPublishedSnapshotById(
      organizationId,
      repositoryId,
      snapshotId,
    );

    if (!snapshot) {
      throw new NotFoundException('Knowledge snapshot was not found');
    }

    return snapshot;
  }

  private async toSnapshotDetail(
    snapshot: KnowledgeSnapshotEntity,
  ): Promise<KnowledgeSnapshotDetailResponseDto> {
    return {
      ...this.toSnapshotResponse(snapshot),
      graph: await this.queryRepository.countGraph(snapshot.id),
    };
  }

  private toSnapshotResponse(
    snapshot: KnowledgeSnapshotEntity,
  ): KnowledgeSnapshotResponseDto {
    return {
      id: snapshot.id,
      repositoryId: snapshot.repositoryId,
      branchId: snapshot.branchId,
      knowledgeBuildId: snapshot.knowledgeBuildId,
      sourceIndexJobId: snapshot.sourceIndexJobId,
      targetCommitSha: snapshot.targetCommitSha,
      analyzerBundleVersion: snapshot.analyzerBundleVersion,
      configurationDigest: snapshot.configurationDigest,
      status: snapshot.status,
      isCurrent: snapshot.isCurrent,
      publishedAt: snapshot.publishedAt!.toISOString(),
      supersededAt: snapshot.supersededAt?.toISOString() ?? null,
      createdAt: snapshot.createdAt.toISOString(),
    };
  }

  private toNodeResponse(node: KnowledgeNodeEntity): KnowledgeNodeResponseDto {
    return {
      id: node.id,
      identityKey: node.identityKey,
      kind: node.kind,
      name: node.name,
      summary: node.summary,
      derivationType: node.derivationType,
      confidence: Number(node.confidence),
      analyzerName: node.analyzerName,
      analyzerVersion: node.analyzerVersion,
      contentFingerprint: node.contentFingerprint,
      propertySchemaVersion: node.propertySchemaVersion,
      properties: { ...node.properties },
      createdAt: node.createdAt.toISOString(),
    };
  }

  private toEdgeResponse(edge: KnowledgeEdgeEntity): KnowledgeEdgeResponseDto {
    return {
      id: edge.id,
      identityKey: edge.identityKey,
      kind: edge.kind,
      source: {
        id: edge.sourceNode.id,
        identityKey: edge.sourceNode.identityKey,
        kind: edge.sourceNode.kind,
        name: edge.sourceNode.name,
      },
      target: {
        id: edge.targetNode.id,
        identityKey: edge.targetNode.identityKey,
        kind: edge.targetNode.kind,
        name: edge.targetNode.name,
      },
      derivationType: edge.derivationType,
      confidence: Number(edge.confidence),
      analyzerName: edge.analyzerName,
      analyzerVersion: edge.analyzerVersion,
      contentFingerprint: edge.contentFingerprint,
      propertySchemaVersion: edge.propertySchemaVersion,
      properties: { ...edge.properties },
      createdAt: edge.createdAt.toISOString(),
    };
  }

  private toNodeEvidence(
    links: readonly KnowledgeNodeEvidenceEntity[],
  ): KnowledgeEvidenceSummaryDto[] {
    return this.sortEvidence(links.map((link) => link.knowledgeEvidence)).map(
      (evidence) => this.toEvidenceResponse(evidence),
    );
  }

  private toEdgeEvidence(
    links: readonly KnowledgeEdgeEvidenceEntity[],
  ): KnowledgeEvidenceSummaryDto[] {
    return this.sortEvidence(links.map((link) => link.knowledgeEvidence)).map(
      (evidence) => this.toEvidenceResponse(evidence),
    );
  }

  private sortEvidence(
    evidence: readonly KnowledgeEvidenceEntity[],
  ): KnowledgeEvidenceEntity[] {
    return [...evidence].sort(
      (left, right) =>
        left.indexedFile.path.localeCompare(right.indexedFile.path) ||
        (left.startOffset ?? -1) - (right.startOffset ?? -1) ||
        left.id - right.id,
    );
  }

  private toEvidenceResponse(
    evidence: KnowledgeEvidenceEntity,
  ): KnowledgeEvidenceSummaryDto {
    return {
      id: evidence.id,
      role: evidence.role,
      file: {
        id: evidence.indexedFileId,
        path: evidence.indexedFile.path,
        hash: {
          id: evidence.fileHashId,
          algorithm: evidence.fileHash.algorithm,
          value: evidence.fileHash.value,
        },
      },
      symbol: evidence.codeSymbol
        ? {
            id: evidence.codeSymbol.id,
            name: evidence.codeSymbol.name,
            qualifiedName: evidence.codeSymbol.qualifiedName,
            kind: evidence.codeSymbol.kind,
          }
        : null,
      range:
        evidence.startLine === null
          ? null
          : {
              startLine: evidence.startLine,
              startColumn: evidence.startColumn!,
              startOffset: evidence.startOffset!,
              endLine: evidence.endLine!,
              endColumn: evidence.endColumn!,
              endOffset: evidence.endOffset!,
            },
    };
  }

  private toPagination(
    page: number,
    limit: number,
    total: number,
  ): PaginationResponseDto {
    return {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    };
  }
}
