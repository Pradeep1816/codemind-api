export enum DependencyExtractionErrorCode {
  InvalidMetadata = 'invalid_metadata',
  ParserIdentityMismatch = 'parser_identity_mismatch',
  TooManyDependencies = 'too_many_dependencies',
  DuplicateDependencyIdentity = 'duplicate_dependency_identity',
  PersistenceOwnershipLost = 'persistence_ownership_lost',
}

export class DependencyExtractionError extends Error {
  constructor(
    message: string,
    readonly code: DependencyExtractionErrorCode,
  ) {
    super(message);
    this.name = DependencyExtractionError.name;
  }
}
