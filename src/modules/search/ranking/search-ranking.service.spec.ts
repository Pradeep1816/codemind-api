import { SearchDocumentSourceType } from '../enums/search-document-source-type.enum';
import {
  SearchGraphCandidate,
  SearchResultItem,
} from '../query/search-query.types';
import { SearchRankingService } from './search-ranking.service';

describe('SearchRankingService', () => {
  const service = new SearchRankingService();

  it('deduplicates lexical and graph candidates and explains every score', () => {
    const lexical = [
      result(1, 'DoctorScheduleService', 120, {
        exactIdentifier: true,
      }),
      result(2, 'ScheduleRepository', 40),
    ];
    const graph = [
      candidate(1, 2, 'ScheduleRepository', 'code_dependency', 'import'),
      candidate(1, 3, 'ScheduleWindow', 'knowledge_edge', 'represents'),
    ];

    const ranked = service.rank(lexical, graph, 10);

    expect(ranked).toMatchObject({
      candidateCount: 4,
      deduplicatedCount: 3,
      truncated: false,
    });
    expect(ranked.data.map((item) => item.id)).toEqual([1, 2, 3]);
    expect(ranked.data[0]?.ranking.signals[0]).toMatchObject({
      source: 'exact',
      name: 'exactIdentifier',
      contribution: 120,
    });
    expect(ranked.data[1]).toMatchObject({
      score: 62,
      ranking: { lexicalScore: 40, graphScore: 22, totalScore: 62 },
    });
    expect(ranked.data[2]).toMatchObject({
      score: 27,
      ranking: { lexicalScore: 0, graphScore: 27, totalScore: 27 },
    });
  });

  it('caps accumulated graph influence and uses stable tiebreakers', () => {
    const graph = [
      candidate(1, 4, 'Beta', 'knowledge_edge', 'calls'),
      candidate(2, 4, 'Beta', 'knowledge_edge', 'depends_on'),
      candidate(1, 3, 'Alpha', 'knowledge_edge', 'calls'),
    ];
    const lexical = [result(1, 'Seed A', 120), result(2, 'Seed B', 120)];

    const ranked = service.rank(lexical, graph, 3);
    const beta = ranked.data.find((item) => item.id === 4);

    expect(beta?.ranking.graphScore).toBe(50);
    expect(ranked.data).toHaveLength(3);
    expect(ranked.truncated).toBe(true);
  });

  it('exposes the same deterministic precision for score and total score', () => {
    const ranked = service.rank(
      [result(1, 'Precise result', 201.66666716337204)],
      [],
      10,
    );

    expect(ranked.data[0]?.score).toBe(201.666667);
    expect(ranked.data[0]?.ranking.totalScore).toBe(201.666667);
  });

  function result(
    id: number,
    title: string,
    score: number,
    matches: Partial<SearchResultItem['match']> = {},
  ): SearchResultItem {
    return {
      ...document(id, title),
      score,
      match: {
        exactIdentifier: false,
        exactTitle: false,
        exactPath: false,
        titlePrefix: false,
        identifierPrefix: false,
        pathContains: false,
        lexical: true,
        ...matches,
      },
    };
  }

  function candidate(
    seedDocumentId: number,
    id: number,
    title: string,
    source: SearchGraphCandidate['relationship']['source'],
    kind: string,
  ): SearchGraphCandidate {
    return {
      seedDocumentId,
      document: document(id, title),
      relationship: { source, kind, direction: 'outgoing', depth: 1 },
    };
  }

  function document(id: number, title: string) {
    return {
      id,
      sourceType: SearchDocumentSourceType.Symbol,
      title,
      contentPreview: title,
      path: `src/${title}.ts`,
      language: 'typescript',
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
