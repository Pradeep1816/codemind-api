import { NotFoundException } from '@nestjs/common';
import { SourceLanguage } from '../../indexing/enums/source-language.enum';
import { RepositoriesService } from '../../repositories/repositories.service';
import { SearchDocumentSourceType } from '../enums/search-document-source-type.enum';
import { SearchRankingService } from '../ranking/search-ranking.service';
import { SearchGraphExpansionRepository } from './search-graph-expansion.repository';
import { SearchQueryRepository } from './search-query.repository';
import { SearchQueryService } from './search-query.service';

describe('SearchQueryService', () => {
  const organizationId = '8da12c58-f008-43f3-8d43-87a6aafd36f4';
  const configuration = {
    indexerVersion: 'phase5-v1',
    persistenceBatchSize: 250,
    maxDocuments: 1_000,
    maxDocumentContentBytes: 131_072,
    maxTotalContentBytes: 1_000_000,
    maxQueryLength: 200,
    maxResultsPerPage: 100,
    graphMaxSeeds: 10,
    graphMaxNeighborsPerSeed: 5,
    graphMaxTotalCandidates: 50,
  };

  it('normalizes a technical query and returns stable pagination metadata', async () => {
    const repositoriesService = repositories();
    const queryRepository = repository();
    const service = createService(repositoriesService, queryRepository);

    const result = await service.search({
      organizationId,
      repositoryId: 2,
      branchId: 3,
      query: '  DoctorScheduleService  ',
      page: 2,
      limit: 10,
      sourceType: SearchDocumentSourceType.Symbol,
      language: SourceLanguage.TypeScript,
      kind: 'class',
    });

    expect(repositoriesService.findOne).toHaveBeenCalledWith(organizationId, 2);
    expect(queryRepository.findCurrentIndex).toHaveBeenCalledWith(
      organizationId,
      2,
      3,
    );
    expect(queryRepository.search).toHaveBeenCalledWith({
      searchIndexId: 11,
      exactQuery: 'DoctorScheduleService',
      normalizedQuery: 'doctor schedule service',
      page: 2,
      limit: 10,
      sourceType: SearchDocumentSourceType.Symbol,
      language: SourceLanguage.TypeScript,
      kind: 'class',
    });
    expect(result.graphExpansion).toEqual({
      depth: 1,
      seedsConsidered: 0,
      maxSeeds: 10,
      maxNeighborsPerSeed: 5,
      maxTotalCandidates: 50,
      truncated: false,
      data: [],
    });
    expect(result.ranking).toEqual({
      candidateCount: 0,
      deduplicatedCount: 0,
      returnedCount: 0,
      truncated: false,
    });
    expect(result).toMatchObject({
      query: {
        original: 'DoctorScheduleService',
        normalized: 'doctor schedule service',
      },
      pagination: { page: 2, limit: 10, total: 21, totalPages: 3 },
    });
  });

  it('rejects punctuation-only and oversized page requests', async () => {
    const service = createService(repositories(), repository());

    await expect(
      service.search({
        organizationId,
        repositoryId: 2,
        branchId: 3,
        query: '===',
      }),
    ).rejects.toThrow('Search query is invalid');
    await expect(
      service.search({
        organizationId,
        repositoryId: 2,
        branchId: 3,
        query: 'doctor',
        limit: 101,
      }),
    ).rejects.toThrow('Search query is invalid');
  });

  it('reports when a branch has no current published search index', async () => {
    const queryRepository = repository();
    queryRepository.findCurrentIndex.mockResolvedValue(null);
    const service = createService(repositories(), queryRepository);

    await expect(
      service.search({
        organizationId,
        repositoryId: 2,
        branchId: 3,
        query: 'doctor schedule',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(queryRepository.search).not.toHaveBeenCalled();
  });

  it('expands only the configured number of lexical seeds', async () => {
    const queryRepository = repository();
    queryRepository.search.mockResolvedValue([
      Array.from({ length: 12 }, (_, index) =>
        searchResult(index + 1, `Result ${index + 1}`),
      ),
      12,
    ]);
    const graph = graphRepository();
    graph.expand.mockResolvedValue({
      truncated: true,
      data: [
        {
          seedDocumentId: 1,
          document: searchDocument(20, 'Related result'),
          relationship: {
            source: 'code_dependency',
            kind: 'import',
            direction: 'outgoing',
            depth: 1,
          },
        },
      ],
    });
    const service = createService(repositories(), queryRepository, graph);

    const result = await service.search({
      organizationId,
      repositoryId: 2,
      branchId: 3,
      query: 'doctor',
    });

    expect(graph.expand).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId,
        repositoryId: 2,
        branchId: 3,
        searchIndexId: 11,
        knowledgeSnapshotId: 8,
        seedDocumentIds: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
        maxNeighborsPerSeed: 5,
        maxTotalCandidates: 50,
      }),
    );
    expect(result.graphExpansion).toMatchObject({
      depth: 1,
      seedsConsidered: 10,
      truncated: true,
    });
  });

  function createService(
    repositoriesService: ReturnType<typeof repositories>,
    queryRepository: ReturnType<typeof repository>,
    graph: ReturnType<typeof graphRepository> = graphRepository(),
  ): SearchQueryService {
    return new SearchQueryService(
      configuration,
      repositoriesService as unknown as RepositoriesService,
      queryRepository as unknown as SearchQueryRepository,
      graph as unknown as SearchGraphExpansionRepository,
      new SearchRankingService(),
    );
  }

  function repositories() {
    return {
      findOne: jest.fn().mockResolvedValue({ id: 2 }),
    };
  }

  function repository() {
    return {
      findCurrentIndex: jest.fn().mockResolvedValue({
        id: 11,
        organizationId,
        repositoryId: 2,
        branchId: 3,
        knowledgeSnapshotId: 8,
        sourceIndexJobId: 7,
        targetCommitSha: 'a'.repeat(40),
        indexerVersion: 'phase5-v1',
        publishedAt: new Date('2026-09-28T08:00:00.000Z'),
      }),
      search: jest.fn().mockResolvedValue([[], 21]),
    };
  }

  function graphRepository() {
    return {
      expand: jest.fn().mockResolvedValue({ data: [], truncated: false }),
    };
  }

  function searchResult(id: number, title: string) {
    return {
      ...searchDocument(id, title),
      score: 10,
      match: {
        exactIdentifier: false,
        exactTitle: false,
        exactPath: false,
        titlePrefix: false,
        identifierPrefix: false,
        pathContains: false,
        lexical: true,
      },
    };
  }

  function searchDocument(id: number, title: string) {
    return {
      id,
      sourceType: SearchDocumentSourceType.Symbol,
      title,
      contentPreview: title,
      path: `src/result-${id}.ts`,
      language: SourceLanguage.TypeScript,
      kind: 'class',
      source: {
        indexedFileId: id,
        fileHashId: id,
        codeSymbolId: id,
        knowledgeNodeId: null,
      },
      metadata: {},
    };
  }
});
