import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  KnowledgePersistenceError,
  KnowledgePersistenceErrorCode,
} from '../persistence/knowledge-persistence.errors';
import { KnowledgePersistenceRepository } from '../persistence/knowledge-persistence.repository';
import {
  CreatedKnowledgeBuild,
  CreateKnowledgeBuildInput,
  KnowledgeEdgeInput,
  KnowledgeEvidenceInput,
  KnowledgeNodeInput,
  OwnedKnowledgeBuildInput,
  PersistKnowledgeGraphBatchInput,
  PersistKnowledgeGraphBatchResult,
  PublishKnowledgeSnapshotResult,
} from '../persistence/knowledge-persistence.types';

const SHA_256_PATTERN = /^[0-9a-f]{64}$/;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_PROPERTY_BYTES = 16_384;

@Injectable()
export class KnowledgePersistenceService {
  constructor(private readonly repository: KnowledgePersistenceRepository) {}

  /** Validates build identity before creating an invisible draft snapshot. */
  async createBuild(
    input: CreateKnowledgeBuildInput,
  ): Promise<CreatedKnowledgeBuild> {
    if (
      !this.isPositiveInteger(input.repositoryId) ||
      !this.isPositiveInteger(input.branchId) ||
      !this.isPositiveInteger(input.sourceIndexJobId) ||
      !this.isPositiveInteger(input.maxAttempts) ||
      input.maxAttempts > 10 ||
      !this.isBoundedText(input.analyzerBundleVersion, 100) ||
      !SHA_256_PATTERN.test(input.configurationDigest) ||
      !UUID_PATTERN.test(input.organizationId) ||
      (input.requestedByUserId !== null &&
        !UUID_PATTERN.test(input.requestedByUserId))
    ) {
      throw new ConflictException('Knowledge build input is invalid');
    }

    try {
      return await this.repository.createBuildWithDraft(input);
    } catch (error: unknown) {
      this.rethrowPersistenceError(error);
    }
  }

  /** Validates and atomically persists one retry-safe graph batch. */
  async persistGraphBatch(
    input: PersistKnowledgeGraphBatchInput,
  ): Promise<PersistKnowledgeGraphBatchResult> {
    this.assertOwnedBuild(input);

    const nodeIdentities = new Set<string>();
    const edgeIdentities = new Set<string>();

    for (const node of input.nodes) {
      this.assertNode(node);
      const identity = `${node.kind}\0${node.identityKey}`;

      if (nodeIdentities.has(identity)) {
        throw new ConflictException(
          'Knowledge batch contains a duplicate node identity',
        );
      }

      nodeIdentities.add(identity);
    }

    for (const edge of input.edges) {
      this.assertEdge(edge);
      const identity = `${edge.kind}\0${edge.identityKey}`;

      if (edgeIdentities.has(identity)) {
        throw new ConflictException(
          'Knowledge batch contains a duplicate edge identity',
        );
      }

      edgeIdentities.add(identity);
    }

    try {
      return await this.repository.persistGraphBatch(input);
    } catch (error: unknown) {
      this.rethrowPersistenceError(error);
    }
  }

  /** Atomically publishes a complete evidence-backed draft snapshot. */
  async publishSnapshot(
    input: OwnedKnowledgeBuildInput,
  ): Promise<PublishKnowledgeSnapshotResult> {
    this.assertOwnedBuild(input);

    try {
      return await this.repository.publishSnapshot(input);
    } catch (error: unknown) {
      this.rethrowPersistenceError(error);
    }
  }

  private assertNode(input: KnowledgeNodeInput): void {
    this.assertCommonFact(input);

    if (
      !this.isBoundedText(input.name, 512) ||
      (input.summary !== null && !this.isBoundedText(input.summary, 4_000))
    ) {
      throw new ConflictException('Knowledge node text is invalid');
    }
  }

  private assertEdge(input: KnowledgeEdgeInput): void {
    this.assertCommonFact(input);

    if (
      !this.isBoundedText(input.source.identityKey, 512) ||
      !this.isBoundedText(input.target.identityKey, 512)
    ) {
      throw new ConflictException('Knowledge edge node reference is invalid');
    }
  }

  private assertCommonFact(
    input: KnowledgeNodeInput | KnowledgeEdgeInput,
  ): void {
    if (
      !this.isBoundedText(input.identityKey, 512) ||
      !this.isBoundedText(input.analyzerName, 100) ||
      !this.isBoundedText(input.analyzerVersion, 100) ||
      !SHA_256_PATTERN.test(input.contentFingerprint) ||
      !Number.isFinite(input.confidence) ||
      input.confidence < 0 ||
      input.confidence > 1 ||
      !this.isPositiveInteger(input.propertySchemaVersion) ||
      input.evidence.length === 0
    ) {
      throw new ConflictException('Knowledge fact metadata is invalid');
    }

    let properties: string;

    try {
      properties = JSON.stringify(input.properties);
    } catch {
      throw new ConflictException('Knowledge fact properties are invalid');
    }

    if (
      properties === undefined ||
      Buffer.byteLength(properties, 'utf8') > MAX_PROPERTY_BYTES
    ) {
      throw new ConflictException('Knowledge fact properties are invalid');
    }

    for (const evidence of input.evidence) {
      this.assertEvidence(evidence);
    }
  }

  private assertEvidence(input: KnowledgeEvidenceInput): void {
    if (
      !this.isPositiveInteger(input.indexedFileId) ||
      !this.isPositiveInteger(input.fileHashId) ||
      (input.codeSymbolId !== null &&
        !this.isPositiveInteger(input.codeSymbolId))
    ) {
      throw new ConflictException('Knowledge evidence identity is invalid');
    }

    const range = input.range;

    if (
      range !== null &&
      (!this.isPositiveInteger(range.startLine) ||
        !this.isPositiveInteger(range.startColumn) ||
        !Number.isSafeInteger(range.startOffset) ||
        range.startOffset < 0 ||
        !this.isPositiveInteger(range.endLine) ||
        !this.isPositiveInteger(range.endColumn) ||
        !Number.isSafeInteger(range.endOffset) ||
        range.endOffset < range.startOffset ||
        range.endLine < range.startLine ||
        (range.endLine === range.startLine &&
          range.endColumn < range.startColumn))
    ) {
      throw new ConflictException('Knowledge evidence range is invalid');
    }
  }

  private assertOwnedBuild(input: OwnedKnowledgeBuildInput): void {
    if (
      !UUID_PATTERN.test(input.organizationId) ||
      !this.isPositiveInteger(input.repositoryId) ||
      !this.isPositiveInteger(input.buildId) ||
      !UUID_PATTERN.test(input.leaseToken)
    ) {
      throw new ConflictException('Knowledge build ownership is invalid');
    }
  }

  private isPositiveInteger(value: number): boolean {
    return Number.isSafeInteger(value) && value > 0;
  }

  private isBoundedText(value: string, maxLength: number): boolean {
    return (
      value.trim().length > 0 &&
      value.length <= maxLength &&
      !/[\0\r\n]/u.test(value)
    );
  }

  private rethrowPersistenceError(error: unknown): never {
    if (!(error instanceof KnowledgePersistenceError)) {
      throw error;
    }

    if (
      error.code === KnowledgePersistenceErrorCode.SourceSnapshotNotFound ||
      error.code === KnowledgePersistenceErrorCode.DraftSnapshotNotFound
    ) {
      throw new NotFoundException(error.message, { cause: error });
    }

    throw new ConflictException(error.message, { cause: error });
  }
}
