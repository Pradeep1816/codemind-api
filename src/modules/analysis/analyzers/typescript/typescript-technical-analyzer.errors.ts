export enum TypeScriptTechnicalAnalyzerErrorCode {
  AstNodeLimitExceeded = 'ast_node_limit_exceeded',
}

export class TypeScriptTechnicalAnalyzerError extends Error {
  constructor(
    message: string,
    readonly code: TypeScriptTechnicalAnalyzerErrorCode,
  ) {
    super(message);
    this.name = TypeScriptTechnicalAnalyzerError.name;
  }
}
