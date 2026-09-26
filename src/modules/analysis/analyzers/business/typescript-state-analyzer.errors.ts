export enum TypeScriptStateAnalyzerErrorCode {
  AstNodeLimitExceeded = 'ast_node_limit_exceeded',
}

export class TypeScriptStateAnalyzerError extends Error {
  constructor(
    message: string,
    readonly code: TypeScriptStateAnalyzerErrorCode,
  ) {
    super(message);
    this.name = TypeScriptStateAnalyzerError.name;
  }
}
