export enum IndexJobPhase {
  Queued = 'queued',
  Preparing = 'preparing',
  Discovering = 'discovering',
  Hashing = 'hashing',
  Analyzing = 'analyzing',
  ExtractingSymbols = 'extracting_symbols',
  BuildingGraph = 'building_graph',
  Finalizing = 'finalizing',
  Finished = 'finished',
}
