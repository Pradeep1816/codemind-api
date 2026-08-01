import { LanguageCapability } from '../enums/language-capability.enum';
import { SourceLanguage } from '../enums/source-language.enum';
import { LanguageDefinition } from './language-detection.types';

export const LANGUAGE_DEFINITIONS: Readonly<
  Record<string, LanguageDefinition>
> = Object.freeze({
  ts: {
    language: SourceLanguage.TypeScript,
    capability: LanguageCapability.ParserSupported,
  },
  tsx: {
    language: SourceLanguage.TypeScript,
    capability: LanguageCapability.ParserSupported,
  },
  js: {
    language: SourceLanguage.JavaScript,
    capability: LanguageCapability.ParserSupported,
  },
  jsx: {
    language: SourceLanguage.JavaScript,
    capability: LanguageCapability.ParserSupported,
  },
  json: {
    language: SourceLanguage.Json,
    capability: LanguageCapability.InventoryOnly,
  },
  md: {
    language: SourceLanguage.Markdown,
    capability: LanguageCapability.InventoryOnly,
  },
  yaml: {
    language: SourceLanguage.Yaml,
    capability: LanguageCapability.InventoryOnly,
  },
  yml: {
    language: SourceLanguage.Yaml,
    capability: LanguageCapability.InventoryOnly,
  },
});

export const INDEXABLE_EXTENSIONS = new Set(Object.keys(LANGUAGE_DEFINITIONS));
