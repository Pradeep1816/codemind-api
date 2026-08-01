export enum ContentHashErrorCode {
  InventoryMismatch = 'inventory_mismatch',
  BlobSizeMismatch = 'blob_size_mismatch',
}

export class ContentHashError extends Error {
  constructor(
    message: string,
    readonly code: ContentHashErrorCode,
  ) {
    super(message);
    this.name = ContentHashError.name;
  }
}
