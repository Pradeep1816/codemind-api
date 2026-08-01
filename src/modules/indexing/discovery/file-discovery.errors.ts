export enum FileDiscoveryErrorCode {
  UnsafePath = 'unsafe_path',
  DuplicatePath = 'duplicate_path',
  FileLimitExceeded = 'file_limit_exceeded',
  ByteLimitExceeded = 'byte_limit_exceeded',
}

export class FileDiscoveryError extends Error {
  constructor(
    message: string,
    readonly code: FileDiscoveryErrorCode,
  ) {
    super(message);
    this.name = FileDiscoveryError.name;
  }
}
