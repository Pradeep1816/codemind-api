import { LanguageCapability } from '../enums/language-capability.enum';
import { SourceLanguage } from '../enums/source-language.enum';

export interface LanguageDefinition {
  language: SourceLanguage;
  capability: LanguageCapability;
}

export interface LanguageDetectionResult extends LanguageDefinition {
  extension: string;
}

export type LanguageDistribution = Partial<Record<SourceLanguage, number>>;
