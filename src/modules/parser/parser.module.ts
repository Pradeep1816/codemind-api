import { Module } from '@nestjs/common';
import { TypeScriptSourceParser } from './adapters/typescript-source.parser';
import { ParserService } from './parser.service';

@Module({
  providers: [ParserService, TypeScriptSourceParser],
  exports: [ParserService],
})
export class ParserModule {}
