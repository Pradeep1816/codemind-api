import { Injectable } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { KnowledgeSnapshotEntity } from '../../knowledge/entities/knowledge-snapshot.entity';
import { KnowledgeSnapshotStatus } from '../../knowledge/enums/knowledge-snapshot-status.enum';
import { RepositoryBranchEntity } from '../../repositories/entities/repository-branch.entity';
import { SearchDocumentEntity } from '../entities/search-document.entity';
import { SearchIndexEntity } from '../entities/search-index.entity';
import { SearchIndexStatus } from '../enums/search-index-status.enum';
import { SearchDocumentSourceType } from '../enums/search-document-source-type.enum';
import {
  SearchProjectionError,
  SearchProjectionErrorCode,
} from './search-projection.errors';
import {
  CreateSearchIndexInput,
  PublishedSearchIndex,
  SearchDocumentCounts,
  SearchDocumentInput,
  SearchIndexReference,
} from './search-projection.types';

const SEARCH_BUILD_LOCK_NAMESPACE = 1_397_704_184;

@Injectable()
export class SearchProjectionRepository {
  constructor(private readonly dataSource: DataSource) {}

  /**
   * Serializes projection builds for a branch across application processes.
   * The session-level advisory lock is held on a dedicated connection while
   * the callback performs bounded transactions through the normal pool.
   */
  async withBuildLock<T>(branchId: number, work: () => Promise<T>): Promise<T> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();

    try {
      const result: unknown = await queryRunner.query(
        `SELECT pg_try_advisory_lock($1, $2) AS "acquired"`,
        [SEARCH_BUILD_LOCK_NAMESPACE, branchId],
      );
      const first: unknown = Array.isArray(result) ? result[0] : undefined;
      const acquired = this.isRecord(first) && first.acquired === true;

      if (!acquired) {
        throw new SearchProjectionError(
          'A search projection build is already running for this branch',
          SearchProjectionErrorCode.BuildInProgress,
        );
      }

      try {
        return await work();
      } finally {
        await queryRunner.query(`SELECT pg_advisory_unlock($1, $2)`, [
          SEARCH_BUILD_LOCK_NAMESPACE,
          branchId,
        ]);
      }
    } finally {
      await queryRunner.release();
    }
  }

  async createOrFindIndex(
    input: CreateSearchIndexInput,
  ): Promise<SearchIndexReference> {
    const repository = this.dataSource.getRepository(SearchIndexEntity);

    await repository
      .createQueryBuilder()
      .insert()
      .values({
        ...input,
        status: SearchIndexStatus.Draft,
        isCurrent: false,
        documentCount: 0,
        publishedAt: null,
        supersededAt: null,
      })
      .orIgnore()
      .execute();

    const entity = await repository.findOne({
      where: {
        knowledgeSnapshotId: input.knowledgeSnapshotId,
        indexerVersion: input.indexerVersion,
        configurationDigest: input.configurationDigest,
      },
    });

    if (
      !entity ||
      entity.organizationId !== input.organizationId ||
      entity.repositoryId !== input.repositoryId ||
      entity.branchId !== input.branchId ||
      entity.sourceIndexJobId !== input.sourceIndexJobId ||
      entity.targetCommitSha !== input.targetCommitSha
    ) {
      throw new SearchProjectionError(
        'Search index identity does not match its source snapshot',
        SearchProjectionErrorCode.SourceMismatch,
      );
    }

    return this.toReference(entity);
  }

  async resetDraft(searchIndexId: number): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      await this.requireDraft(manager, searchIndexId);
      await manager
        .getRepository(SearchDocumentEntity)
        .delete({ searchIndexId });
    });
  }

  async persistDocuments(
    searchIndexId: number,
    documents: readonly SearchDocumentInput[],
  ): Promise<void> {
    if (documents.length === 0) {
      return;
    }

    await this.dataSource.transaction(async (manager) => {
      await this.requireDraft(manager, searchIndexId);
      const repository = manager.getRepository(SearchDocumentEntity);

      await repository
        .createQueryBuilder()
        .insert()
        .values([...documents])
        .orUpdate(
          [
            'indexed_file_id',
            'file_hash_id',
            'code_symbol_id',
            'knowledge_node_id',
            'title',
            'content',
            'path',
            'language',
            'kind',
            'metadata',
          ],
          ['search_index_id', 'source_type', 'source_identity_key'],
        )
        .execute();
    });
  }

  async publish(searchIndexId: number): Promise<PublishedSearchIndex> {
    return this.dataSource.transaction(async (manager) => {
      const indexRepository = manager.getRepository(SearchIndexEntity);
      const index = await indexRepository.findOne({
        where: { id: searchIndexId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!index) {
        throw new SearchProjectionError(
          'Search index draft was not found',
          SearchProjectionErrorCode.DraftNotFound,
        );
      }

      if (index.status === SearchIndexStatus.Published) {
        return this.toPublished(index);
      }

      const documentCount = await manager
        .getRepository(SearchDocumentEntity)
        .countBy({ searchIndexId });

      if (documentCount === 0) {
        throw new SearchProjectionError(
          'Search projection contains no documents',
          SearchProjectionErrorCode.EmptyProjection,
        );
      }

      const branch = await manager
        .getRepository(RepositoryBranchEntity)
        .findOne({
          where: { id: index.branchId, repositoryId: index.repositoryId },
          lock: { mode: 'pessimistic_write' },
        });
      const snapshot = await manager
        .getRepository(KnowledgeSnapshotEntity)
        .findOne({
          where: {
            id: index.knowledgeSnapshotId,
            organizationId: index.organizationId,
            repositoryId: index.repositoryId,
            branchId: index.branchId,
            status: KnowledgeSnapshotStatus.Published,
          },
        });
      const isCurrent =
        branch?.commitSha === index.targetCommitSha &&
        snapshot?.isCurrent === true;
      const publishedAt = new Date();

      if (isCurrent) {
        const previous = await indexRepository.findOne({
          where: {
            branchId: index.branchId,
            status: SearchIndexStatus.Published,
            isCurrent: true,
          },
          lock: { mode: 'pessimistic_write' },
        });

        if (previous && previous.id !== index.id) {
          await indexRepository.update(
            { id: previous.id },
            { isCurrent: false, supersededAt: publishedAt },
          );
        }
      }

      await indexRepository.update(
        { id: index.id, status: SearchIndexStatus.Draft },
        {
          status: SearchIndexStatus.Published,
          isCurrent,
          documentCount,
          publishedAt,
          supersededAt: null,
        },
      );

      const published = await indexRepository.findOneByOrFail({ id: index.id });
      return this.toPublished(published);
    });
  }

  async countDocuments(searchIndexId: number): Promise<SearchDocumentCounts> {
    const rows = await this.dataSource
      .getRepository(SearchDocumentEntity)
      .createQueryBuilder('document')
      .select('document.sourceType', 'sourceType')
      .addSelect('COUNT(*)', 'count')
      .where('document.searchIndexId = :searchIndexId', { searchIndexId })
      .groupBy('document.sourceType')
      .getRawMany<{ sourceType: SearchDocumentSourceType; count: string }>();
    const counts: SearchDocumentCounts = {
      files: 0,
      symbols: 0,
      knowledgeNodes: 0,
      total: 0,
    };

    for (const row of rows) {
      const count = Number(row.count);
      counts.total += count;

      if (row.sourceType === SearchDocumentSourceType.File) {
        counts.files = count;
      } else if (row.sourceType === SearchDocumentSourceType.Symbol) {
        counts.symbols = count;
      } else if (row.sourceType === SearchDocumentSourceType.KnowledgeNode) {
        counts.knowledgeNodes = count;
      }
    }

    return counts;
  }

  private async requireDraft(
    manager: EntityManager,
    searchIndexId: number,
  ): Promise<SearchIndexEntity> {
    const index = await manager.getRepository(SearchIndexEntity).findOne({
      where: { id: searchIndexId },
      lock: { mode: 'pessimistic_write' },
    });

    if (!index || index.status !== SearchIndexStatus.Draft) {
      throw new SearchProjectionError(
        'Search index draft was not found',
        SearchProjectionErrorCode.DraftNotFound,
      );
    }

    return index;
  }

  private toReference(entity: SearchIndexEntity): SearchIndexReference {
    return {
      id: entity.id,
      status: entity.status,
      isCurrent: entity.isCurrent,
      documentCount: entity.documentCount,
      publishedAt: entity.publishedAt,
    };
  }

  private toPublished(entity: SearchIndexEntity): PublishedSearchIndex {
    if (!entity.publishedAt) {
      throw new SearchProjectionError(
        'Published search index metadata is incomplete',
        SearchProjectionErrorCode.SourceMismatch,
      );
    }

    return {
      searchIndexId: entity.id,
      isCurrent: entity.isCurrent,
      documentCount: entity.documentCount,
      publishedAt: entity.publishedAt,
    };
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
  }
}
