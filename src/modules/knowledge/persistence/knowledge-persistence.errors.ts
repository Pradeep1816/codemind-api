export enum KnowledgePersistenceErrorCode {
  SourceSnapshotNotFound = 'source_snapshot_not_found',
  ActiveBuildExists = 'active_build_exists',
  SnapshotAlreadyExists = 'snapshot_already_exists',
  BuildNotOwned = 'build_not_owned',
  DraftSnapshotNotFound = 'draft_snapshot_not_found',
  NodeConflict = 'node_conflict',
  EdgeConflict = 'edge_conflict',
  NodeReferenceNotFound = 'node_reference_not_found',
  EvidenceIncomplete = 'evidence_incomplete',
}

export class KnowledgePersistenceError extends Error {
  constructor(
    message: string,
    readonly code: KnowledgePersistenceErrorCode,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = KnowledgePersistenceError.name;
  }
}
