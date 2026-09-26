export enum AnalysisExecutionErrorCode {
  SourceBudgetExceeded = 'source_budget_exceeded',
  SourceIdentityMismatch = 'source_identity_mismatch',
  FactLimitExceeded = 'fact_limit_exceeded',
  DiagnosticLimitExceeded = 'diagnostic_limit_exceeded',
  AnalyzerContractViolation = 'analyzer_contract_violation',
  AnalyzerExecutionFailed = 'analyzer_execution_failed',
}

export class AnalysisExecutionError extends Error {
  constructor(
    message: string,
    readonly code: AnalysisExecutionErrorCode,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = AnalysisExecutionError.name;
  }
}
