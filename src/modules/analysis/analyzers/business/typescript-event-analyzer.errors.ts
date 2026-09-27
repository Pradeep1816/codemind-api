export enum TypeScriptEventAnalyzerErrorCode {
  AstNodeLimitExceeded = 'ast_node_limit_exceeded',
}

export class TypeScriptEventAnalyzerError extends Error {
  constructor(
    message: string,
    readonly code: TypeScriptEventAnalyzerErrorCode,
  ) {
    super(message);
    this.name = TypeScriptEventAnalyzerError.name;
  }
}
