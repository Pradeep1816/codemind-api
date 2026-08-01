export enum SymbolExtractionErrorCode {
  InvalidMetadata = 'invalid_metadata',
  ParserIdentityMismatch = 'parser_identity_mismatch',
  TooManySymbols = 'too_many_symbols',
  DuplicateSymbolIdentity = 'duplicate_symbol_identity',
  PersistenceOwnershipLost = 'persistence_ownership_lost',
}

export class SymbolExtractionError extends Error {
  constructor(
    message: string,
    readonly code: SymbolExtractionErrorCode,
  ) {
    super(message);
    this.name = SymbolExtractionError.name;
  }
}
