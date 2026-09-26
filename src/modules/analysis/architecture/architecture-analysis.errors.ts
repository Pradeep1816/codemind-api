export enum ArchitectureAnalysisErrorCode {
  FileLimitExceeded = 'file_limit_exceeded',
  SymbolLimitExceeded = 'symbol_limit_exceeded',
  DependencyLimitExceeded = 'dependency_limit_exceeded',
  OutputLimitExceeded = 'output_limit_exceeded',
}

export class ArchitectureAnalysisError extends Error {
  constructor(
    message: string,
    readonly code: ArchitectureAnalysisErrorCode,
  ) {
    super(message);
    this.name = ArchitectureAnalysisError.name;
  }
}
