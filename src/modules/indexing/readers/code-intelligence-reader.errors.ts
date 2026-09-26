export enum CodeIntelligenceReadErrorCode {
  InvalidRequest = 'invalid_request',
  SnapshotNotFound = 'snapshot_not_found',
  SnapshotNotSuccessful = 'snapshot_not_successful',
  StaleSnapshot = 'stale_snapshot',
  InconsistentSnapshot = 'inconsistent_snapshot',
}

export class CodeIntelligenceReadError extends Error {
  constructor(
    message: string,
    readonly code: CodeIntelligenceReadErrorCode,
  ) {
    super(message);
    this.name = CodeIntelligenceReadError.name;
  }
}
