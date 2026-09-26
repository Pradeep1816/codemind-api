export enum TypeScriptBusinessAnalyzerErrorCode {
  AstNodeLimitExceeded = 'ast_node_limit_exceeded',
}

export class TypeScriptBusinessAnalyzerError extends Error {
  constructor(
    message: string,
    readonly code: TypeScriptBusinessAnalyzerErrorCode,
  ) {
    super(message);
    this.name = TypeScriptBusinessAnalyzerError.name;
  }
}
