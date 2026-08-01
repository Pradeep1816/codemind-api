export enum GitIntegrationErrorCode {
  InvalidSource = 'invalid_source',
  UnsupportedSource = 'unsupported_source',
  LocalSourceDisabled = 'local_source_disabled',
  InvalidWorkspaceIdentity = 'invalid_workspace_identity',
  WorkspaceExists = 'workspace_exists',
  WorkspaceNotFound = 'workspace_not_found',
}

export class GitIntegrationError extends Error {
  constructor(
    message: string,
    readonly code: GitIntegrationErrorCode,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = GitIntegrationError.name;
  }
}

export class GitCommandError extends Error {
  constructor(
    operation: string,
    readonly exitCode: string | number | null,
    readonly signal: NodeJS.Signals | null,
    readonly timedOut: boolean,
    options?: ErrorOptions,
  ) {
    super(
      timedOut
        ? `Git operation timed out: ${operation}`
        : `Git operation failed: ${operation}`,
      options,
    );
    this.name = GitCommandError.name;
  }
}
