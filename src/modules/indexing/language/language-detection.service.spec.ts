import { LanguageCapability } from '../enums/language-capability.enum';
import { SourceLanguage } from '../enums/source-language.enum';
import {
  LanguageDetectionError,
  LanguageDetectionErrorCode,
} from './language-detection.errors';
import { LanguageDetectionService } from './language-detection.service';

describe('LanguageDetectionService', () => {
  const service = new LanguageDetectionService();

  it.each([
    ['.TS', 'ts', SourceLanguage.TypeScript],
    ['tsx', 'tsx', SourceLanguage.TypeScript],
    [' JS ', 'js', SourceLanguage.JavaScript],
    ['jsx', 'jsx', SourceLanguage.JavaScript],
  ])('detects parser-supported extension %s', (input, extension, language) => {
    expect(service.detect(input)).toEqual({
      extension,
      language,
      capability: LanguageCapability.ParserSupported,
    });
  });

  it.each([
    ['json', SourceLanguage.Json],
    ['md', SourceLanguage.Markdown],
    ['yaml', SourceLanguage.Yaml],
    ['yml', SourceLanguage.Yaml],
  ])('detects inventory-only extension %s', (extension, language) => {
    expect(service.detect(extension)).toEqual({
      extension,
      language,
      capability: LanguageCapability.InventoryOnly,
    });
  });

  it('rejects an unregistered extension', () => {
    try {
      service.detect('py');
      throw new Error('Expected language detection to reject Python');
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(LanguageDetectionError);

      if (!(error instanceof LanguageDetectionError)) {
        throw error;
      }

      expect(error.code).toBe(LanguageDetectionErrorCode.UnsupportedExtension);
    }
  });
});
