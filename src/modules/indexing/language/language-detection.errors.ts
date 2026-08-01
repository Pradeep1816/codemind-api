export enum LanguageDetectionErrorCode {
  UnsupportedExtension = 'unsupported_extension',
}

export class LanguageDetectionError extends Error {
  constructor(
    message: string,
    readonly code: LanguageDetectionErrorCode,
  ) {
    super(message);
    this.name = LanguageDetectionError.name;
  }
}
