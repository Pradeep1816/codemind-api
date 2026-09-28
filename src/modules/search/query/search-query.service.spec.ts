import { NotFoundException } from '@nestjs/common';
import { SourceLanguage } from '../../indexing/enums/source-language.enum';
import { RepositoriesService } from '../../repositories/repositories.service';
import { SearchDocumentSourceType } from '../enums/search-document-source-type.enum';
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

  function createService(
    repositoriesService: ReturnType<typeof repositories>,
    queryRepository: ReturnType<typeof repository>,
  ): SearchQueryService {
    return new SearchQueryService(
      configuration,
      repositoriesService as unknown as RepositoriesService,
      queryRepository as unknown as SearchQueryRepository,
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
});
