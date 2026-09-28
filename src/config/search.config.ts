import { registerAs } from '@nestjs/config';

function readInteger(name: string, fallback: number): number {
  return Number.parseInt(process.env[name] ?? String(fallback), 10);
}

export default registerAs('search', () => ({
  indexerVersion: process.env.SEARCH_INDEXER_VERSION?.trim() || 'phase5-v1',
  persistenceBatchSize: readInteger('SEARCH_PERSISTENCE_BATCH_SIZE', 250),
  maxDocuments: readInteger('SEARCH_MAX_DOCUMENTS', 1_000_000),
  maxDocumentContentBytes: readInteger(
    'SEARCH_MAX_DOCUMENT_CONTENT_BYTES',
    131_072,
  ),
  maxTotalContentBytes: readInteger(
    'SEARCH_MAX_TOTAL_CONTENT_BYTES',
    268_435_456,
  ),
  maxQueryLength: readInteger('SEARCH_MAX_QUERY_LENGTH', 200),
  maxResultsPerPage: readInteger('SEARCH_MAX_RESULTS_PER_PAGE', 100),
  graphMaxSeeds: readInteger('SEARCH_GRAPH_MAX_SEEDS', 10),
  graphMaxNeighborsPerSeed: readInteger(
    'SEARCH_GRAPH_MAX_NEIGHBORS_PER_SEED',
    5,
  ),
  graphMaxTotalCandidates: readInteger('SEARCH_GRAPH_MAX_TOTAL_CANDIDATES', 50),
}));
