import { Injectable } from '@nestjs/common';
import { TypeScriptSourceParser } from './adapters/typescript-source.parser';
import { SourceParser } from './interfaces/source-parser.interface';
import { ParserError, ParserErrorCode } from './parser.errors';
import { ParseSourceInput, ParseSourceResult } from './types/parser.types';

@Injectable()
export class ParserService {
  private readonly parsers: readonly SourceParser[];

  constructor(typeScriptSourceParser: TypeScriptSourceParser) {
    this.parsers = [typeScriptSourceParser];
  }

  /** Routes one source file to its language-specific parser adapter. */
  parse(input: ParseSourceInput): Promise<ParseSourceResult> {
    const parser = this.parsers.find((candidate) => candidate.supports(input));

    if (!parser) {
      throw new ParserError(
        `No source parser supports ${input.language}/${input.extension}`,
        ParserErrorCode.UnsupportedLanguage,
      );
    }

    return parser.parse(input);
  }
}
