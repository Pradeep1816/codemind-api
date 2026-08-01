import { Injectable } from '@nestjs/common';
import {
  LanguageDetectionError,
  LanguageDetectionErrorCode,
} from './language-detection.errors';
import { LanguageDetectionResult } from './language-detection.types';
import { LANGUAGE_DEFINITIONS } from './language-registry.constants';

@Injectable()
export class LanguageDetectionService {
  /** Resolves one normalized extension through the centralized registry. */
  detect(extensionValue: string): LanguageDetectionResult {
    const extension = extensionValue.trim().replace(/^\./u, '').toLowerCase();
    const definition = LANGUAGE_DEFINITIONS[extension];

    if (!definition) {
      throw new LanguageDetectionError(
        'Source extension is not registered for indexing',
        LanguageDetectionErrorCode.UnsupportedExtension,
      );
    }

    return {
      extension,
      ...definition,
    };
  }
}
