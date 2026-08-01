export enum SourceParsingErrorCode {
  InvalidMetadata = 'invalid_metadata',
  BlobSizeMismatch = 'blob_size_mismatch',
  UnsupportedEncoding = 'unsupported_encoding',
}

export class SourceParsingError extends Error {
  constructor(
    message: string,
    readonly code: SourceParsingErrorCode,
  ) {
    super(message);
    this.name = SourceParsingError.name;
  }
}
