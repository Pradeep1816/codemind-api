export enum IndexingErrorPhase {
  Discovery = 'discovery',
  Materialization = 'materialization',
  Hashing = 'hashing',
  Parsing = 'parsing',
  Persistence = 'persistence',
  Finalization = 'finalization',
}
