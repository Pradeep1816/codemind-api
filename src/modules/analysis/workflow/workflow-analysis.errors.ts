export enum WorkflowAnalysisErrorCode {
  WorkflowLimitExceeded = 'workflow_limit_exceeded',
  StepLimitExceeded = 'step_limit_exceeded',
}

export class WorkflowAnalysisError extends Error {
  constructor(
    message: string,
    readonly code: WorkflowAnalysisErrorCode,
  ) {
    super(message);
    this.name = WorkflowAnalysisError.name;
  }
}
