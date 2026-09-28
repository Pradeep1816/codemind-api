export enum SearchProjectionErrorCode {
  BuildInProgress = 'build_in_progress',
  DraftNotFound = 'draft_not_found',
  SourceMismatch = 'source_mismatch',
  EmptyProjection = 'empty_projection',
  ResourceLimitExceeded = 'resource_limit_exceeded',
}

export class SearchProjectionError extends Error {
  constructor(
    message: string,
    readonly code: SearchProjectionErrorCode,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = SearchProjectionError.name;
  }
}
