export enum IndexingWorkspaceErrorCode {
  InvalidIdentity = 'invalid_identity',
  UnsafePath = 'unsafe_path',
  InvalidWorkspaceState = 'invalid_workspace_state',
}

export class IndexingWorkspaceError extends Error {
  constructor(
    message: string,
    readonly code: IndexingWorkspaceErrorCode,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = IndexingWorkspaceError.name;
  }
}
