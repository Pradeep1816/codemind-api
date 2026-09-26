import { ConflictException, NotFoundException } from '@nestjs/common';
import { KnowledgeBuildTrigger } from '../enums/knowledge-build-trigger.enum';
import { KnowledgeDerivationType } from '../enums/knowledge-derivation-type.enum';
import { KnowledgeEdgeKind } from '../enums/knowledge-edge-kind.enum';
import { KnowledgeEvidenceRole } from '../enums/knowledge-evidence-role.enum';
import { KnowledgeNodeKind } from '../enums/knowledge-node-kind.enum';
import {
  KnowledgePersistenceError,
  KnowledgePersistenceErrorCode,
} from '../persistence/knowledge-persistence.errors';
import { KnowledgePersistenceRepository } from '../persistence/knowledge-persistence.repository';
import {
  CreateKnowledgeBuildInput,
  KnowledgeEdgeInput,
  KnowledgeNodeInput,
  OwnedKnowledgeBuildInput,
} from '../persistence/knowledge-persistence.types';
import { KnowledgePersistenceService } from './knowledge-persistence.service';

describe('KnowledgePersistenceService', () => {
  const organizationId = '5abf1e5e-e03c-4890-83a5-c4e84ad48d18';
  const requestedByUserId = '25d8bd53-047b-42d8-9efa-4ecedfe422d3';
  const leaseToken = '117fe8f2-b400-4aa7-9985-a388b981c17e';
  const fingerprint = 'a'.repeat(64);

  function createService(options?: {
    createError?: unknown;
    persistError?: unknown;
    publishError?: unknown;
  }) {
    const repository = {
      createBuildWithDraft: options?.createError
        ? jest.fn().mockRejectedValue(options.createError)
        : jest.fn().mockResolvedValue({
            buildId: 1,
            snapshotId: 2,
            targetCommitSha: '8e008e725d9e411c5bff3a713b91afeaf4613f13',
          }),
      persistGraphBatch: options?.persistError
        ? jest.fn().mockRejectedValue(options.persistError)
        : jest.fn().mockResolvedValue({
            snapshotId: 2,
            persistedNodes: 1,
            persistedEdges: 1,
          }),
      publishSnapshot: options?.publishError
        ? jest.fn().mockRejectedValue(options.publishError)
        : jest.fn().mockResolvedValue({
            buildId: 1,
            snapshotId: 2,
            targetCommitSha: '8e008e725d9e411c5bff3a713b91afeaf4613f13',
            isCurrent: true,
            publishedAt: new Date('2026-09-26T10:00:00.000Z'),
          }),
    };

    return {
      service: new KnowledgePersistenceService(
        repository as unknown as KnowledgePersistenceRepository,
      ),
      repository,
    };
  }

  function createBuildInput(
    overrides: Partial<CreateKnowledgeBuildInput> = {},
  ): CreateKnowledgeBuildInput {
    return {
      organizationId,
      repositoryId: 2,
      branchId: 3,
      sourceIndexJobId: 4,
      requestedByUserId,
      trigger: KnowledgeBuildTrigger.Manual,
      analyzerBundleVersion: 'phase4-v1',
      configurationDigest: fingerprint,
      maxAttempts: 3,
      ...overrides,
    };
  }

  function createOwnedBuild(): OwnedKnowledgeBuildInput {
    return {
      organizationId,
      repositoryId: 2,
      buildId: 1,
      leaseToken,
    };
  }

  function createNode(
    overrides: Partial<KnowledgeNodeInput> = {},
  ): KnowledgeNodeInput {
    return {
      kind: KnowledgeNodeKind.ArchitecturalComponent,
      identityKey: 'component:doctor-service',
      name: 'DoctorService',
      summary: 'Coordinates doctor scheduling operations.',
      derivationType: KnowledgeDerivationType.Deterministic,
      confidence: 1,
      analyzerName: 'architecture-analyzer',
      analyzerVersion: '1.0.0',
      contentFingerprint: fingerprint,
      propertySchemaVersion: 1,
      properties: { componentType: 'service' },
      evidence: [
        {
          indexedFileId: 10,
          fileHashId: 11,
          codeSymbolId: 12,
          role: KnowledgeEvidenceRole.Declaration,
          range: {
            startLine: 1,
            startColumn: 1,
            startOffset: 0,
            endLine: 5,
            endColumn: 2,
            endOffset: 80,
          },
        },
      ],
      ...overrides,
    };
  }

  function createEdge(
    overrides: Partial<KnowledgeEdgeInput> = {},
  ): KnowledgeEdgeInput {
    const reference = {
      kind: KnowledgeNodeKind.ArchitecturalComponent,
      identityKey: 'component:doctor-service',
    };

    return {
      identityKey: 'calls:doctor-service:schedule-repository',
      kind: KnowledgeEdgeKind.Calls,
      source: reference,
      target: {
        kind: KnowledgeNodeKind.ArchitecturalComponent,
        identityKey: 'component:schedule-repository',
      },
      derivationType: KnowledgeDerivationType.Deterministic,
      confidence: 1,
      analyzerName: 'architecture-analyzer',
      analyzerVersion: '1.0.0',
      contentFingerprint: fingerprint,
      propertySchemaVersion: 1,
      properties: {},
      evidence: [createNode().evidence[0]],
      ...overrides,
    };
  }

  it('creates a build and draft for valid reproducible input', async () => {
    const { service, repository } = createService();
    const input = createBuildInput();

    await expect(service.createBuild(input)).resolves.toMatchObject({
      buildId: 1,
      snapshotId: 2,
    });
    expect(repository.createBuildWithDraft).toHaveBeenCalledWith(input);
  });

  it('rejects malformed build identity before persistence', async () => {
    const { service, repository } = createService();

    await expect(
      service.createBuild(createBuildInput({ configurationDigest: 'bad' })),
    ).rejects.toThrow(ConflictException);
    expect(repository.createBuildWithDraft).not.toHaveBeenCalled();
  });

  it('hides a cross-tenant or unsuccessful source snapshot as not found', async () => {
    const { service } = createService({
      createError: new KnowledgePersistenceError(
        'Successful source index snapshot was not found',
        KnowledgePersistenceErrorCode.SourceSnapshotNotFound,
      ),
    });

    await expect(service.createBuild(createBuildInput())).rejects.toThrow(
      NotFoundException,
    );
  });

  it('persists a valid evidence-backed graph batch', async () => {
    const { service, repository } = createService();
    const input = {
      ...createOwnedBuild(),
      nodes: [createNode()],
      edges: [createEdge()],
    };

    await expect(service.persistGraphBatch(input)).resolves.toEqual({
      snapshotId: 2,
      persistedNodes: 1,
      persistedEdges: 1,
    });
    expect(repository.persistGraphBatch).toHaveBeenCalledWith(input);
  });

  it('rejects duplicate node identities inside one batch', async () => {
    const { service, repository } = createService();
    const node = createNode();

    await expect(
      service.persistGraphBatch({
        ...createOwnedBuild(),
        nodes: [node, { ...node }],
        edges: [],
      }),
    ).rejects.toThrow(ConflictException);
    expect(repository.persistGraphBatch).not.toHaveBeenCalled();
  });

  it('rejects facts without evidence', async () => {
    const { service } = createService();

    await expect(
      service.persistGraphBatch({
        ...createOwnedBuild(),
        nodes: [createNode({ evidence: [] as never })],
        edges: [],
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('rejects evidence ranges that move backwards', async () => {
    const { service } = createService();
    const node = createNode();

    await expect(
      service.persistGraphBatch({
        ...createOwnedBuild(),
        nodes: [
          createNode({
            evidence: [
              {
                ...node.evidence[0],
                range: {
                  startLine: 5,
                  startColumn: 4,
                  startOffset: 50,
                  endLine: 5,
                  endColumn: 2,
                  endOffset: 40,
                },
              },
            ],
          }),
        ],
        edges: [],
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('maps conflicting graph identities to a conflict response', async () => {
    const { service } = createService({
      persistError: new KnowledgePersistenceError(
        'Knowledge node identity has conflicting content',
        KnowledgePersistenceErrorCode.NodeConflict,
      ),
    });

    await expect(
      service.persistGraphBatch({
        ...createOwnedBuild(),
        nodes: [createNode()],
        edges: [],
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('publishes through the lease-scoped repository boundary', async () => {
    const { service, repository } = createService();
    const input = createOwnedBuild();

    await expect(service.publishSnapshot(input)).resolves.toMatchObject({
      buildId: 1,
      snapshotId: 2,
      isCurrent: true,
    });
    expect(repository.publishSnapshot).toHaveBeenCalledWith(input);
  });

  it('rejects an invalid worker lease before publication', async () => {
    const { service, repository } = createService();

    await expect(
      service.publishSnapshot({ ...createOwnedBuild(), leaseToken: 'invalid' }),
    ).rejects.toThrow(ConflictException);
    expect(repository.publishSnapshot).not.toHaveBeenCalled();
  });
});
