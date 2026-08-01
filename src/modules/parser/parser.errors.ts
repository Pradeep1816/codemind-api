export enum ParserErrorCode {
  UnsupportedLanguage = 'unsupported_language',
  InvalidInput = 'invalid_input',
}

export class ParserError extends Error {
  constructor(
    message: string,
    readonly code: ParserErrorCode,
  ) {
    super(message);
    this.name = ParserError.name;
  }
}
