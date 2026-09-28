import { Injectable } from '@nestjs/common';
import {
  RankedSearchResultItem,
  SearchGraphCandidate,
  SearchMatchSignals,
  SearchResultItem,
  SearchScoreSignal,
} from '../query/search-query.types';

export interface SearchRankingResult {
  data: RankedSearchResultItem[];
  candidateCount: number;
  deduplicatedCount: number;
  truncated: boolean;
}

type MutableRankedResult = RankedSearchResultItem;

const EXACT_SIGNAL_WEIGHTS = [
  ['exactIdentifier', 120, 'Exact symbol identifier match'],
  ['exactTitle', 110, 'Exact document title match'],
  ['exactPath', 100, 'Exact repository path match'],
  ['titlePrefix', 70, 'Document title prefix match'],
  ['identifierPrefix', 65, 'Symbol identifier prefix match'],
  ['pathContains', 40, 'Repository path contains the query'],
] as const;
const MAX_GRAPH_SCORE = 50;

/** Fuses lexical and graph candidates into one explainable stable ranking. */
@Injectable()
export class SearchRankingService {
  rank(
    lexicalResults: readonly SearchResultItem[],
    graphCandidates: readonly SearchGraphCandidate[],
    limit: number,
  ): SearchRankingResult {
    const rankedById = new Map<number, MutableRankedResult>();
    const lexicalById = new Map(
      lexicalResults.map((result) => [result.id, result]),
    );

    for (const lexical of lexicalResults) {
      rankedById.set(lexical.id, this.fromLexical(lexical));
    }

    for (const candidate of graphCandidates) {
      const existing = rankedById.get(candidate.document.id);
      const ranked = existing ?? this.fromGraphDocument(candidate);
      const seedScore = lexicalById.get(candidate.seedDocumentId)?.score ?? 0;
      const contribution = this.graphContribution(candidate, seedScore);

      if (ranked.ranking.graphScore < MAX_GRAPH_SCORE) {
        const acceptedContribution = Math.min(
          contribution,
          MAX_GRAPH_SCORE - ranked.ranking.graphScore,
        );

        if (acceptedContribution > 0) {
          ranked.ranking.graphScore = this.round(
            ranked.ranking.graphScore + acceptedContribution,
          );
          ranked.ranking.signals.push({
            source: 'graph',
            name: `${candidate.relationship.source}:${candidate.relationship.kind}:${candidate.relationship.direction}`,
            contribution: acceptedContribution,
            description: `${candidate.relationship.direction} ${candidate.relationship.kind} relationship from lexical result #${candidate.seedDocumentId}`,
            seedDocumentId: candidate.seedDocumentId,
          });
        }
      }

      this.updateTotal(ranked);
      rankedById.set(ranked.id, ranked);
    }

    const ranked = [...rankedById.values()].sort((left, right) =>
      this.compare(left, right),
    );

    return {
      data: ranked.slice(0, limit),
      candidateCount: lexicalResults.length + graphCandidates.length,
      deduplicatedCount: ranked.length,
      truncated: ranked.length > limit,
    };
  }

  private fromLexical(result: SearchResultItem): MutableRankedResult {
    const signals: SearchScoreSignal[] = [];
    let explainedScore = 0;

    for (const [name, contribution, description] of EXACT_SIGNAL_WEIGHTS) {
      if (result.match[name]) {
        signals.push({
          source: 'exact',
          name,
          contribution,
          description,
        });
        explainedScore += contribution;
      }
    }

    const lexicalContribution = this.round(
      Math.max(0, result.score - explainedScore),
    );

    if (result.match.lexical && lexicalContribution > 0) {
      signals.push({
        source: 'lexical',
        name: 'fullTextRank',
        contribution: lexicalContribution,
        description: 'Weighted PostgreSQL full-text relevance',
      });
    }

    return {
      ...result,
      ranking: {
        lexicalScore: this.round(result.score),
        graphScore: 0,
        totalScore: this.round(result.score),
        signals,
      },
    };
  }

  private fromGraphDocument(
    candidate: SearchGraphCandidate,
  ): MutableRankedResult {
    const match: SearchMatchSignals = {
      exactIdentifier: false,
      exactTitle: false,
      exactPath: false,
      titlePrefix: false,
      identifierPrefix: false,
      pathContains: false,
      lexical: false,
    };

    return {
      ...candidate.document,
      score: 0,
      match,
      ranking: {
        lexicalScore: 0,
        graphScore: 0,
        totalScore: 0,
        signals: [],
      },
    };
  }

  private graphContribution(
    candidate: SearchGraphCandidate,
    seedScore: number,
  ): number {
    const sourceWeight =
      candidate.relationship.source === 'knowledge_edge' ? 25 : 20;
    const directionWeight =
      candidate.relationship.direction === 'outgoing' ? 2 : 0;
    const seedFactor = Math.min(1, Math.max(0, seedScore / 100));

    return this.round((sourceWeight + directionWeight) * seedFactor);
  }

  private updateTotal(result: MutableRankedResult): void {
    result.ranking.totalScore = this.round(
      result.ranking.lexicalScore + result.ranking.graphScore,
    );
    result.score = result.ranking.totalScore;
  }

  private compare(
    left: RankedSearchResultItem,
    right: RankedSearchResultItem,
  ): number {
    return (
      right.ranking.totalScore - left.ranking.totalScore ||
      right.ranking.lexicalScore - left.ranking.lexicalScore ||
      left.sourceType.localeCompare(right.sourceType) ||
      left.title.localeCompare(right.title) ||
      left.id - right.id
    );
  }

  private round(value: number): number {
    return Math.round(value * 1_000_000) / 1_000_000;
  }
}
