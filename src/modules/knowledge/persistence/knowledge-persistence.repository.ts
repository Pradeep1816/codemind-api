import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager, MoreThan, QueryFailedError } from 'typeorm';
import { IndexJobEntity } from '../../indexing/entities/index-job.entity';
import { IndexJobStatus } from '../../indexing/enums/index-job-status.enum';
import { RepositoryBranchEntity } from '../../repositories/entities/repository-branch.entity';
import { KnowledgeBuildEntity } from '../entities/knowledge-build.entity';
import { KnowledgeEdgeEvidenceEntity } from '../entities/knowledge-edge-evidence.entity';
import { KnowledgeEdgeEntity } from '../entities/knowledge-edge.entity';
import { KnowledgeEvidenceEntity } from '../entities/knowledge-evidence.entity';
import { KnowledgeNodeEvidenceEntity } from '../entities/knowledge-node-evidence.entity';
import { KnowledgeNodeEntity } from '../entities/knowledge-node.entity';
import { KnowledgeSnapshotEntity } from '../entities/knowledge-snapshot.entity';
import { KnowledgeBuildPhase } from '../enums/knowledge-build-phase.enum';
import { KnowledgeBuildStatus } from '../enums/knowledge-build-status.enum';
import { KnowledgeSnapshotStatus } from '../enums/knowledge-snapshot-status.enum';
import {
  KnowledgePersistenceError,
  KnowledgePersistenceErrorCode,
} from './knowledge-persistence.errors';
import {
  CreatedKnowledgeBuild,
  CreateKnowledgeBuildInput,
  KnowledgeEdgeInput,
  KnowledgeEvidenceInput,
  KnowledgeNodeInput,
  KnowledgeNodeReference,
  OwnedKnowledgeBuildInput,
  PersistKnowledgeGraphBatchInput,
  PersistKnowledgeGraphBatchResult,
  PublishKnowledgeSnapshotResult,
} from './knowledge-persistence.types';

interface OwnedDraft {
  build: KnowledgeBuildEntity;
  snapshot: KnowledgeSnapshotEntity;
}

@Injectable()
export class KnowledgePersistenceRepository {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  /** Creates the durable build and its invisible draft snapshot atomically. */
  createBuildWithDraft(
    input: CreateKnowledgeBuildInput,
  ): Promise<CreatedKnowledgeBuild> {
    return this.dataSource.transaction(async (manager) => {
      const sourceJob = await manager.getRepository(IndexJobEntity).findOne({
        where: {
          id: input.sourceIndexJobId,
          organizationId: input.organizationId,
          repositoryId: input.repositoryId,
          branchId: input.branchId,
          status: IndexJobStatus.Succeeded,
        },
      });

      if (!sourceJob) {
        throw new KnowledgePersistenceError(
          'Successful source index snapshot was not found',
          KnowledgePersistenceErrorCode.SourceSnapshotNotFound,
        );
      }

      const buildRepository = manager.getRepository(KnowledgeBuildEntity);
      const build = buildRepository.create({
        organizationId: input.organizationId,
        repositoryId: input.repositoryId,
        branchId: input.branchId,
        sourceIndexJobId: input.sourceIndexJobId,
        requestedByUserId: input.requestedByUserId,
        trigger: input.trigger,
        status: KnowledgeBuildStatus.Queued,
        phase: KnowledgeBuildPhase.Queued,
        targetCommitSha: sourceJob.targetCommitSha,
        analyzerBundleVersion: input.analyzerBundleVersion,
        configurationDigest: input.configurationDigest,
        totalFiles: sourceJob.totalFiles,
        processedFiles: 0,
        failedFiles: 0,
        emittedFacts: 0,
        persistedNodes: 0,
        persistedEdges: 0,
        attemptCount: 0,
        maxAttempts: input.maxAttempts,
        claimedBy: null,
        leaseToken: null,
        failureCode: null,
        failureMessage: null,
        currentFile: null,
        startedAt: null,
        completedAt: null,
        lastHeartbeatAt: null,
        leaseExpiresAt: null,
        nextAttemptAt: null,
        cancellationRequestedAt: null,
      });

      try {
        const savedBuild = await buildRepository.save(build);
        const snapshot = await manager
          .getRepository(KnowledgeSnapshotEntity)
          .save(
            manager.getRepository(KnowledgeSnapshotEntity).create({
              organizationId: savedBuild.organizationId,
              repositoryId: savedBuild.repositoryId,
              branchId: savedBuild.branchId,
              knowledgeBuildId: savedBuild.id,
              sourceIndexJobId: savedBuild.sourceIndexJobId,
              targetCommitSha: savedBuild.targetCommitSha,
              analyzerBundleVersion: savedBuild.analyzerBundleVersion,
              configurationDigest: savedBuild.configurationDigest,
              status: KnowledgeSnapshotStatus.Draft,
              isCurrent: false,
              publishedAt: null,
              supersededAt: null,
            }),
          );

        return {
          buildId: savedBuild.id,
          snapshotId: snapshot.id,
          targetCommitSha: savedBuild.targetCommitSha,
        };
      } catch (error: unknown) {
        throw this.mapCreateConflict(error);
      }
    });
  }

  /**
   * Writes one retry-safe batch to an unpublished snapshot. A batch either
   * persists all nodes, edges, evidence, and links or persists none of them.
   */
  persistGraphBatch(
    input: PersistKnowledgeGraphBatchInput,
  ): Promise<PersistKnowledgeGraphBatchResult> {
    return this.dataSource.transaction(async (manager) => {
      const owned = await this.requireOwnedDraft(manager, input);

      if (owned.build.phase !== KnowledgeBuildPhase.Analyzing) {
        throw new KnowledgePersistenceError(
          'Knowledge build is not accepting graph batches',
          KnowledgePersistenceErrorCode.BuildNotOwned,
        );
      }

      const evidenceByIdentity = new Map<string, KnowledgeEvidenceEntity>();
      const nodeByReference = new Map<string, KnowledgeNodeEntity>();

      for (const nodeInput of input.nodes) {
        const node = await this.persistNode(
          manager,
          owned,
          nodeInput,
          evidenceByIdentity,
        );
        nodeByReference.set(this.nodeReferenceKey(nodeInput), node);
      }

      for (const edgeInput of input.edges) {
        await this.persistEdge(
          manager,
          owned,
          edgeInput,
          evidenceByIdentity,
          nodeByReference,
        );
      }

      const [persistedNodes, persistedEdges] = await Promise.all([
        manager.getRepository(KnowledgeNodeEntity).countBy({
          snapshotId: owned.snapshot.id,
        }),
        manager.getRepository(KnowledgeEdgeEntity).countBy({
          snapshotId: owned.snapshot.id,
        }),
      ]);

      owned.build.persistedNodes = persistedNodes;
      owned.build.persistedEdges = persistedEdges;
      owned.build.emittedFacts = persistedNodes + persistedEdges;
      await manager.getRepository(KnowledgeBuildEntity).save(owned.build);

      return {
        snapshotId: owned.snapshot.id,
        persistedNodes,
        persistedEdges,
      };
    });
  }

  /** Publishes a complete draft and selects it as current when the branch has not moved. */
  publishSnapshot(
    input: OwnedKnowledgeBuildInput,
  ): Promise<PublishKnowledgeSnapshotResult> {
    return this.dataSource.transaction(async (manager) => {
      const owned = await this.requireOwnedDraft(manager, input);

      if (owned.build.phase !== KnowledgeBuildPhase.Publishing) {
        throw new KnowledgePersistenceError(
          'Knowledge build is not ready to publish',
          KnowledgePersistenceErrorCode.BuildNotOwned,
        );
      }

      await this.assertCompleteEvidence(manager, owned.snapshot.id);

      const branch = await manager
        .getRepository(RepositoryBranchEntity)
        .findOne({
          where: {
            id: owned.build.branchId,
            repositoryId: owned.build.repositoryId,
          },
          lock: { mode: 'pessimistic_write' },
        });

      if (!branch) {
        throw new KnowledgePersistenceError(
          'Knowledge build branch was not found',
          KnowledgePersistenceErrorCode.BuildNotOwned,
        );
      }

      const publishedAt = new Date();
      const isCurrent = branch.commitSha === owned.build.targetCommitSha;
      const snapshotRepository = manager.getRepository(KnowledgeSnapshotEntity);

      if (isCurrent) {
        const currentSnapshots = await snapshotRepository.find({
          where: {
            branchId: owned.build.branchId,
            isCurrent: true,
          },
          lock: { mode: 'pessimistic_write' },
        });

        for (const current of currentSnapshots) {
          current.isCurrent = false;
          current.supersededAt = publishedAt;
        }

        if (currentSnapshots.length > 0) {
          await snapshotRepository.save(currentSnapshots);
        }
      }

      owned.snapshot.status = KnowledgeSnapshotStatus.Published;
      owned.snapshot.isCurrent = isCurrent;
      owned.snapshot.publishedAt = publishedAt;
      owned.snapshot.supersededAt = null;
      await snapshotRepository.save(owned.snapshot);

      owned.build.status = KnowledgeBuildStatus.Succeeded;
      owned.build.phase = KnowledgeBuildPhase.Finished;
      owned.build.completedAt = publishedAt;
      owned.build.claimedBy = null;
      owned.build.leaseToken = null;
      owned.build.lastHeartbeatAt = null;
      owned.build.leaseExpiresAt = null;
      owned.build.currentFile = null;
      await manager.getRepository(KnowledgeBuildEntity).save(owned.build);

      return {
        buildId: owned.build.id,
        snapshotId: owned.snapshot.id,
        targetCommitSha: owned.snapshot.targetCommitSha,
        isCurrent,
        publishedAt,
      };
    });
  }

  private async persistNode(
    manager: EntityManager,
    owned: OwnedDraft,
    input: KnowledgeNodeInput,
    evidenceByIdentity: Map<string, KnowledgeEvidenceEntity>,
  ): Promise<KnowledgeNodeEntity> {
    const repository = manager.getRepository(KnowledgeNodeEntity);
    let node = await repository.findOneBy({
      snapshotId: owned.snapshot.id,
      kind: input.kind,
      identityKey: input.identityKey,
    });

    if (node && node.contentFingerprint !== input.contentFingerprint) {
      throw new KnowledgePersistenceError(
        'Knowledge node identity has conflicting content',
        KnowledgePersistenceErrorCode.NodeConflict,
      );
    }

    node ??= await repository.save(
      repository.create({
        organizationId: owned.build.organizationId,
        repositoryId: owned.build.repositoryId,
        branchId: owned.build.branchId,
        snapshotId: owned.snapshot.id,
        identityKey: input.identityKey,
        kind: input.kind,
        name: input.name,
        summary: input.summary,
        derivationType: input.derivationType,
        confidence: input.confidence,
        analyzerName: input.analyzerName,
        analyzerVersion: input.analyzerVersion,
        contentFingerprint: input.contentFingerprint,
        propertySchemaVersion: input.propertySchemaVersion,
        properties: { ...input.properties },
      }),
    );

    const evidence = await this.persistEvidenceList(
      manager,
      owned,
      input.evidence,
      evidenceByIdentity,
    );

    await manager
      .createQueryBuilder()
      .insert()
      .into(KnowledgeNodeEvidenceEntity)
      .values(
        evidence.map((item) => ({
          knowledgeNodeId: node.id,
          knowledgeEvidenceId: item.id,
        })),
      )
      .orIgnore()
      .execute();

    return node;
  }

  private async persistEdge(
    manager: EntityManager,
    owned: OwnedDraft,
    input: KnowledgeEdgeInput,
    evidenceByIdentity: Map<string, KnowledgeEvidenceEntity>,
    nodeByReference: Map<string, KnowledgeNodeEntity>,
  ): Promise<void> {
    const source = await this.findReferencedNode(
      manager,
      owned.snapshot.id,
      input.source,
      nodeByReference,
    );
    const target = await this.findReferencedNode(
      manager,
      owned.snapshot.id,
      input.target,
      nodeByReference,
    );
    const repository = manager.getRepository(KnowledgeEdgeEntity);
    let edge = await repository.findOneBy({
      snapshotId: owned.snapshot.id,
      kind: input.kind,
      identityKey: input.identityKey,
    });

    if (edge && edge.contentFingerprint !== input.contentFingerprint) {
      throw new KnowledgePersistenceError(
        'Knowledge edge identity has conflicting content',
        KnowledgePersistenceErrorCode.EdgeConflict,
      );
    }

    edge ??= await repository.save(
      repository.create({
        organizationId: owned.build.organizationId,
        repositoryId: owned.build.repositoryId,
        branchId: owned.build.branchId,
        snapshotId: owned.snapshot.id,
        sourceNodeId: source.id,
        targetNodeId: target.id,
        identityKey: input.identityKey,
        kind: input.kind,
        derivationType: input.derivationType,
        confidence: input.confidence,
        analyzerName: input.analyzerName,
        analyzerVersion: input.analyzerVersion,
        contentFingerprint: input.contentFingerprint,
        propertySchemaVersion: input.propertySchemaVersion,
        properties: { ...input.properties },
      }),
    );

    const evidence = await this.persistEvidenceList(
      manager,
      owned,
      input.evidence,
      evidenceByIdentity,
    );

    await manager
      .createQueryBuilder()
      .insert()
      .into(KnowledgeEdgeEvidenceEntity)
      .values(
        evidence.map((item) => ({
          knowledgeEdgeId: edge.id,
          knowledgeEvidenceId: item.id,
        })),
      )
      .orIgnore()
      .execute();
  }

  private async findReferencedNode(
    manager: EntityManager,
    snapshotId: number,
    reference: KnowledgeNodeReference,
    cache: Map<string, KnowledgeNodeEntity>,
  ): Promise<KnowledgeNodeEntity> {
    const key = this.nodeReferenceKey(reference);
    const cached = cache.get(key);

    if (cached) {
      return cached;
    }

    const node = await manager.getRepository(KnowledgeNodeEntity).findOneBy({
      snapshotId,
      kind: reference.kind,
      identityKey: reference.identityKey,
    });

    if (!node) {
      throw new KnowledgePersistenceError(
        'Knowledge edge references an unknown node',
        KnowledgePersistenceErrorCode.NodeReferenceNotFound,
      );
    }

    cache.set(key, node);
    return node;
  }

  private async persistEvidenceList(
    manager: EntityManager,
    owned: OwnedDraft,
    input: readonly KnowledgeEvidenceInput[],
    cache: Map<string, KnowledgeEvidenceEntity>,
  ): Promise<KnowledgeEvidenceEntity[]> {
    const evidence: KnowledgeEvidenceEntity[] = [];

    for (const item of input) {
      const identityHash = this.evidenceIdentityHash(item);
      const cached = cache.get(identityHash);

      if (cached) {
        evidence.push(cached);
        continue;
      }

      const repository = manager.getRepository(KnowledgeEvidenceEntity);
      let entity = await repository.findOneBy({
        snapshotId: owned.snapshot.id,
        identityHash,
      });

      entity ??= await repository.save(
        repository.create({
          organizationId: owned.build.organizationId,
          repositoryId: owned.build.repositoryId,
          branchId: owned.build.branchId,
          snapshotId: owned.snapshot.id,
          indexedFileId: item.indexedFileId,
          fileHashId: item.fileHashId,
          codeSymbolId: item.codeSymbolId,
          identityHash,
          role: item.role,
          startLine: item.range?.startLine ?? null,
          startColumn: item.range?.startColumn ?? null,
          startOffset: item.range?.startOffset ?? null,
          endLine: item.range?.endLine ?? null,
          endColumn: item.range?.endColumn ?? null,
          endOffset: item.range?.endOffset ?? null,
        }),
      );

      cache.set(identityHash, entity);
      evidence.push(entity);
    }

    return evidence;
  }

  private async requireOwnedDraft(
    manager: EntityManager,
    input: OwnedKnowledgeBuildInput,
  ): Promise<OwnedDraft> {
    const build = await manager.getRepository(KnowledgeBuildEntity).findOne({
      where: {
        id: input.buildId,
        organizationId: input.organizationId,
        repositoryId: input.repositoryId,
        status: KnowledgeBuildStatus.Running,
        leaseToken: input.leaseToken,
        leaseExpiresAt: MoreThan(new Date()),
      },
      lock: { mode: 'pessimistic_write' },
    });

    if (!build || build.cancellationRequestedAt !== null) {
      throw new KnowledgePersistenceError(
        'Knowledge build lease is expired, cancelled, or no longer owned',
        KnowledgePersistenceErrorCode.BuildNotOwned,
      );
    }

    const snapshot = await manager
      .getRepository(KnowledgeSnapshotEntity)
      .findOne({
        where: {
          knowledgeBuildId: build.id,
          organizationId: build.organizationId,
          repositoryId: build.repositoryId,
          status: KnowledgeSnapshotStatus.Draft,
        },
        lock: { mode: 'pessimistic_write' },
      });

    if (!snapshot) {
      throw new KnowledgePersistenceError(
        'Draft knowledge snapshot was not found',
        KnowledgePersistenceErrorCode.DraftSnapshotNotFound,
      );
    }

    return { build, snapshot };
  }

  private async assertCompleteEvidence(
    manager: EntityManager,
    snapshotId: number,
  ): Promise<void> {
    const [nodesWithoutEvidence, edgesWithoutEvidence] = await Promise.all([
      manager
        .getRepository(KnowledgeNodeEntity)
        .createQueryBuilder('node')
        .where('node.snapshotId = :snapshotId', { snapshotId })
        .andWhere(
          `NOT EXISTS (
            SELECT 1 FROM knowledge_node_evidence link
            WHERE link.knowledge_node_id = node.id
          )`,
        )
        .getCount(),
      manager
        .getRepository(KnowledgeEdgeEntity)
        .createQueryBuilder('edge')
        .where('edge.snapshotId = :snapshotId', { snapshotId })
        .andWhere(
          `NOT EXISTS (
            SELECT 1 FROM knowledge_edge_evidence link
            WHERE link.knowledge_edge_id = edge.id
          )`,
        )
        .getCount(),
    ]);

    if (nodesWithoutEvidence > 0 || edgesWithoutEvidence > 0) {
      throw new KnowledgePersistenceError(
        'Knowledge snapshot contains facts without source evidence',
        KnowledgePersistenceErrorCode.EvidenceIncomplete,
      );
    }
  }

  private evidenceIdentityHash(input: KnowledgeEvidenceInput): string {
    return createHash('sha256')
      .update(
        JSON.stringify({
          codeSymbolId: input.codeSymbolId,
          fileHashId: input.fileHashId,
          indexedFileId: input.indexedFileId,
          range: input.range,
          role: input.role,
        }),
      )
      .digest('hex');
  }

  private nodeReferenceKey(reference: KnowledgeNodeReference): string {
    return `${reference.kind}\0${reference.identityKey}`;
  }

  private mapCreateConflict(error: unknown): Error {
    if (!(error instanceof QueryFailedError)) {
      return error instanceof Error
        ? error
        : new Error('Knowledge build failed');
    }

    const driverError = error.driverError as {
      code?: string;
      constraint?: string;
    };

    if (driverError.code !== '23505') {
      return error;
    }

    if (
      driverError.constraint === 'uq_knowledge_builds_active_repository_branch'
    ) {
      return new KnowledgePersistenceError(
        'An active knowledge build already exists for this branch',
        KnowledgePersistenceErrorCode.ActiveBuildExists,
        { cause: error },
      );
    }

    return new KnowledgePersistenceError(
      'This knowledge snapshot version already exists',
      KnowledgePersistenceErrorCode.SnapshotAlreadyExists,
      { cause: error },
    );
  }
}
