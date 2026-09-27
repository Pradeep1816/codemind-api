import { NotFoundException } from '@nestjs/common';
import { FileHashAlgorithm } from '../../indexing/enums/file-hash-algorithm.enum';
import { CodeSymbolKind } from '../../indexing/enums/code-symbol-kind.enum';
import { RepositoriesService } from '../../repositories/repositories.service';
import {
  CurrentKnowledgeSnapshotQueryDto,
  ListKnowledgeEdgesQueryDto,
  ListKnowledgeNodesQueryDto,
  ListKnowledgeSnapshotsQueryDto,
} from '../dto/knowledge-query.dto';
import { KnowledgeEdgeEvidenceEntity } from '../entities/knowledge-edge-evidence.entity';
import { KnowledgeEdgeEntity } from '../entities/knowledge-edge.entity';
import { KnowledgeEvidenceEntity } from '../entities/knowledge-evidence.entity';
import { KnowledgeNodeEvidenceEntity } from '../entities/knowledge-node-evidence.entity';
import { KnowledgeNodeEntity } from '../entities/knowledge-node.entity';
import { KnowledgeSnapshotEntity } from '../entities/knowledge-snapshot.entity';
import { KnowledgeDerivationType } from '../enums/knowledge-derivation-type.enum';
import { KnowledgeEdgeKind } from '../enums/knowledge-edge-kind.enum';
import { KnowledgeEvidenceRole } from '../enums/knowledge-evidence-role.enum';
import { KnowledgeNodeKind } from '../enums/knowledge-node-kind.enum';
import { KnowledgeSnapshotStatus } from '../enums/knowledge-snapshot-status.enum';
import { KnowledgeQueryRepository } from '../repositories/knowledge-query.repository';
import { KnowledgeQueryService } from './knowledge-query.service';

describe('KnowledgeQueryService', () => {
  const organizationId = '5abf1e5e-e03c-4890-83a5-c4e84ad48d18';
  const repositoryId = 2;
  const createdAt = new Date('2026-09-20T10:00:00.000Z');
  const publishedAt = new Date('2026-09-20T10:01:00.000Z');

  function snapshot(
    overrides: Partial<KnowledgeSnapshotEntity> = {},
  ): KnowledgeSnapshotEntity {
    return {
      id: 7,
      organizationId,
      repositoryId,
      branchId: 3,
      knowledgeBuildId: 11,
      sourceIndexJobId: 4,
      targetCommitSha: '8e008e725d9e411c5bff3a713b91afeaf4613f13',
      analyzerBundleVersion: '4.6.0',
      configurationDigest: 'a'.repeat(64),
      status: KnowledgeSnapshotStatus.Published,
      isCurrent: true,
      publishedAt,
      supersededAt: null,
      createdAt,
      ...overrides,
    } as KnowledgeSnapshotEntity;
  }

  function node(
    id: number,
    kind = KnowledgeNodeKind.ArchitecturalComponent,
    name = 'DoctorService',
  ): KnowledgeNodeEntity {
    return {
      id,
      organizationId,
      repositoryId,
      branchId: 3,
      snapshotId: 7,
      identityKey: `${kind}:${id}`,
      kind,
      name,
      summary: null,
      derivationType: KnowledgeDerivationType.Deterministic,
      confidence: 1,
      analyzerName: 'fixture',
      analyzerVersion: '1.0.0',
      contentFingerprint: String(id).repeat(64).slice(0, 64),
      propertySchemaVersion: 1,
      properties: { componentType: 'service' },
      createdAt,
    } as KnowledgeNodeEntity;
  }

  function edge(): KnowledgeEdgeEntity {
    return {
      id: 21,
      organizationId,
      repositoryId,
      branchId: 3,
      snapshotId: 7,
      sourceNodeId: 31,
      targetNodeId: 32,
      sourceNode: node(31, KnowledgeNodeKind.WorkflowStep, 'schedule'),
      targetNode: node(32, KnowledgeNodeKind.ArchitecturalComponent),
      identityKey: `knowledge_edge:${'b'.repeat(64)}`,
      kind: KnowledgeEdgeKind.Calls,
      derivationType: KnowledgeDerivationType.Deterministic,
      confidence: 1,
      analyzerName: 'fixture-projector',
      analyzerVersion: '1.0.0',
      contentFingerprint: 'c'.repeat(64),
      propertySchemaVersion: 1,
      properties: { sourceFactIdentityKey: 'workflow_step:fixture' },
      createdAt,
    } as KnowledgeEdgeEntity;
  }

  function evidence(): KnowledgeEvidenceEntity {
    return {
      id: 41,
      organizationId,
      repositoryId,
      branchId: 3,
      snapshotId: 7,
      indexedFileId: 51,
      fileHashId: 52,
      codeSymbolId: 53,
      identityHash: 'd'.repeat(64),
      role: KnowledgeEvidenceRole.CallSite,
      startLine: 10,
      startColumn: 3,
      startOffset: 100,
      endLine: 10,
      endColumn: 24,
      endOffset: 121,
      createdAt,
      indexedFile: { id: 51, path: 'src/doctor.service.ts' },
      fileHash: {
        id: 52,
        algorithm: FileHashAlgorithm.Sha256,
        value: 'e'.repeat(64),
      },
      codeSymbol: {
        id: 53,
        name: 'schedule',
        qualifiedName: 'DoctorService.schedule',
        kind: CodeSymbolKind.Method,
      },
    } as KnowledgeEvidenceEntity;
  }

  function createService(
    repositoryOverrides: Partial<KnowledgeQueryRepository> = {},
    repositoriesServiceOverrides: Partial<RepositoriesService> = {},
  ): {
    service: KnowledgeQueryService;
    queryRepository: KnowledgeQueryRepository;
    repositoriesService: RepositoriesService;
    findRepository: jest.Mock;
  } {
    const queryRepository = {
      findPublishedSnapshots: jest.fn(),
      findCurrentPublishedSnapshot: jest.fn(),
      findPublishedSnapshotById: jest.fn(),
      countGraph: jest.fn(),
      findNodes: jest.fn(),
      findNodeById: jest.fn(),
      findEdges: jest.fn(),
      findEdgeById: jest.fn(),
      findNodeEvidence: jest.fn(),
      findEdgeEvidence: jest.fn(),
      ...repositoryOverrides,
    } as unknown as KnowledgeQueryRepository;
    const findRepository = jest.fn().mockResolvedValue({ id: repositoryId });
    const repositoriesService = {
      findOne: findRepository,
      ...repositoriesServiceOverrides,
    } as unknown as RepositoriesService;

    return {
      service: new KnowledgeQueryService(repositoriesService, queryRepository),
      queryRepository,
      repositoriesService,
      findRepository,
    };
  }

  it('lists only published snapshots after verifying repository ownership', async () => {
    const findPublishedSnapshots = jest
      .fn()
      .mockResolvedValue([[snapshot()], 1]);
    const { service, findRepository } = createService({
      findPublishedSnapshots,
    });
    const query = Object.assign(new ListKnowledgeSnapshotsQueryDto(), {
      branchId: 3,
      page: 2,
      limit: 10,
    });

    const result = await service.listSnapshots(
      organizationId,
      repositoryId,
      query,
    );

    expect(findRepository).toHaveBeenCalledWith(organizationId, repositoryId);
    expect(findPublishedSnapshots).toHaveBeenCalledWith({
      organizationId,
      repositoryId,
      branchId: 3,
      page: 2,
      limit: 10,
    });
    expect(result.pagination).toEqual({
      page: 2,
      limit: 10,
      total: 1,
      totalPages: 1,
    });
    expect(result.data[0]).toMatchObject({
      id: 7,
      isCurrent: true,
      publishedAt: publishedAt.toISOString(),
    });
  });

  it('returns the current branch snapshot with graph totals', async () => {
    const findCurrentPublishedSnapshot = jest
      .fn()
      .mockResolvedValue(snapshot());
    const countGraph = jest.fn().mockResolvedValue({ nodes: 42, edges: 61 });
    const { service } = createService({
      findCurrentPublishedSnapshot,
      countGraph,
    });
    const query = Object.assign(new CurrentKnowledgeSnapshotQueryDto(), {
      branchId: 3,
    });

    const result = await service.findCurrentSnapshot(
      organizationId,
      repositoryId,
      query,
    );

    expect(findCurrentPublishedSnapshot).toHaveBeenCalledWith(
      organizationId,
      repositoryId,
      3,
    );
    expect(result.graph).toEqual({ nodes: 42, edges: 61 });
  });

  it('does not disclose a missing or cross-tenant current snapshot', async () => {
    const { service } = createService({
      findCurrentPublishedSnapshot: jest.fn().mockResolvedValue(null),
    });

    await expect(
      service.findCurrentSnapshot(organizationId, repositoryId, {
        branchId: 999,
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it('lists filtered nodes only after resolving a published snapshot', async () => {
    const findPublishedSnapshotById = jest.fn().mockResolvedValue(snapshot());
    const findNodes = jest
      .fn()
      .mockResolvedValue([
        [node(31, KnowledgeNodeKind.DomainConcept, 'Doctor Schedule')],
        1,
      ]);
    const { service } = createService({
      findPublishedSnapshotById,
      findNodes,
    });
    const query = Object.assign(new ListKnowledgeNodesQueryDto(), {
      kind: KnowledgeNodeKind.DomainConcept,
      search: '  Doctor  ',
    });

    const result = await service.listNodes(
      organizationId,
      repositoryId,
      7,
      query,
    );

    expect(findNodes).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId,
        repositoryId,
        snapshotId: 7,
        kind: KnowledgeNodeKind.DomainConcept,
        search: 'Doctor',
      }),
    );
    expect(result.data[0]).toMatchObject({
      id: 31,
      kind: KnowledgeNodeKind.DomainConcept,
      name: 'Doctor Schedule',
    });
  });

  it('never queries graph rows for a draft or inaccessible snapshot', async () => {
    const findNodes = jest.fn();
    const { service } = createService({
      findPublishedSnapshotById: jest.fn().mockResolvedValue(null),
      findNodes,
    });

    await expect(
      service.listNodes(
        organizationId,
        repositoryId,
        999,
        new ListKnowledgeNodesQueryDto(),
      ),
    ).rejects.toThrow('Knowledge snapshot was not found');
    expect(findNodes).not.toHaveBeenCalled();
  });

  it('returns node detail with immutable file, hash, symbol, and range evidence', async () => {
    const fact = node(31);
    const source = evidence();
    const link = {
      knowledgeNodeId: fact.id,
      knowledgeEvidenceId: source.id,
      knowledgeEvidence: source,
    } as KnowledgeNodeEvidenceEntity;
    const { service } = createService({
      findPublishedSnapshotById: jest.fn().mockResolvedValue(snapshot()),
      findNodeById: jest.fn().mockResolvedValue(fact),
      findNodeEvidence: jest.fn().mockResolvedValue([[link], 1]),
    });

    const result = await service.findNode(organizationId, repositoryId, 7, 31);

    expect(result.evidence).toHaveLength(1);
    expect(result.evidenceTotal).toBe(1);
    expect(result.evidenceTruncated).toBe(false);
    expect(result.evidence[0]?.id).toBe(41);
    expect(result.evidence[0]?.role).toBe(KnowledgeEvidenceRole.CallSite);
    expect(result.evidence[0]?.file.path).toBe('src/doctor.service.ts');
    expect(result.evidence[0]?.file.hash.value).toBe('e'.repeat(64));
    expect(result.evidence[0]?.symbol?.qualifiedName).toBe(
      'DoctorService.schedule',
    );
    expect(result.evidence[0]?.range).toMatchObject({
      startLine: 10,
      endOffset: 121,
    });
  });

  it('lists edges touching a requested node and maps both endpoints', async () => {
    const relation = edge();
    const findEdges = jest.fn().mockResolvedValue([[relation], 1]);
    const { service } = createService({
      findPublishedSnapshotById: jest.fn().mockResolvedValue(snapshot()),
      findEdges,
    });
    const query = Object.assign(new ListKnowledgeEdgesQueryDto(), {
      kind: KnowledgeEdgeKind.Calls,
      nodeId: 31,
    });

    const result = await service.listEdges(
      organizationId,
      repositoryId,
      7,
      query,
    );

    expect(findEdges).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: KnowledgeEdgeKind.Calls,
        nodeId: 31,
      }),
    );
    expect(result.data[0]).toMatchObject({
      source: { id: 31, name: 'schedule' },
      target: { id: 32, name: 'DoctorService' },
    });
  });

  it('returns edge detail with evidence and hides unknown edge IDs', async () => {
    const relation = edge();
    const source = evidence();
    const link = {
      knowledgeEdgeId: relation.id,
      knowledgeEvidenceId: source.id,
      knowledgeEvidence: source,
    } as KnowledgeEdgeEvidenceEntity;
    const { service } = createService({
      findPublishedSnapshotById: jest.fn().mockResolvedValue(snapshot()),
      findEdgeById: jest
        .fn()
        .mockResolvedValueOnce(relation)
        .mockResolvedValueOnce(null),
      findEdgeEvidence: jest.fn().mockResolvedValue([[link], 1]),
    });

    const result = await service.findEdge(
      organizationId,
      repositoryId,
      7,
      relation.id,
    );
    expect(result.evidence).toHaveLength(1);

    await expect(
      service.findEdge(organizationId, repositoryId, 7, 999),
    ).rejects.toThrow(NotFoundException);
  });
});
