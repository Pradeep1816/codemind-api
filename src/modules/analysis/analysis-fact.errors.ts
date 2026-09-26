export enum AnalysisFactErrorCode {
  InvalidIdentity = 'invalid_identity',
  InvalidAnalyzer = 'invalid_analyzer',
  InvalidConfidence = 'invalid_confidence',
  MissingEvidence = 'missing_evidence',
  InvalidEvidence = 'invalid_evidence',
  InvalidProperties = 'invalid_properties',
  PropertiesTooLarge = 'properties_too_large',
}

export class AnalysisFactError extends Error {
  constructor(
    message: string,
    readonly code: AnalysisFactErrorCode,
  ) {
    super(message);
    this.name = AnalysisFactError.name;
  }
}
