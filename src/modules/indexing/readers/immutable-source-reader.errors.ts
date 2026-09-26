export enum ImmutableSourceReadErrorCode {
  InvalidRequest = 'invalid_request',
  FileTooLarge = 'file_too_large',
  BlobIdentityMismatch = 'blob_identity_mismatch',
  BlobSizeMismatch = 'blob_size_mismatch',
  UnsupportedEncoding = 'unsupported_encoding',
}

export class ImmutableSourceReadError extends Error {
  constructor(
    message: string,
    readonly code: ImmutableSourceReadErrorCode,
  ) {
    super(message);
    this.name = ImmutableSourceReadError.name;
  }
}
