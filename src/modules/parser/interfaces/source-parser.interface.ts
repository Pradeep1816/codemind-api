import { ParseSourceInput, ParseSourceResult } from '../types/parser.types';

export interface SourceParser {
  supports(input: Pick<ParseSourceInput, 'language' | 'extension'>): boolean;

  parse(input: ParseSourceInput): Promise<ParseSourceResult>;
}
