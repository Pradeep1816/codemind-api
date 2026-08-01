import { Inject, Injectable } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import indexingConfig from '../../../config/indexing.config';
import { ParsedSymbolKind } from '../../parser/enums/parsed-symbol-kind.enum';
import { ParsedSymbolVisibility } from '../../parser/enums/parsed-symbol-visibility.enum';
import { ParsedSymbol } from '../../parser/types/parser.types';
import { CodeSymbolKind } from '../enums/code-symbol-kind.enum';
import { CodeSymbolVisibility } from '../enums/code-symbol-visibility.enum';
import { SourceParsingService } from '../parsing/source-parsing.service';
import {
  CodeSymbolsRepository,
  PersistCodeSymbolRecord,
} from './code-symbols.repository';
import {
  SymbolExtractionError,
  SymbolExtractionErrorCode,
} from './symbol-extraction.errors';
import {
  ExtractAndPersistSymbolsInput,
  SymbolExtractionResult,
} from './symbol-extraction.types';

const MAX_SYMBOL_NAME_LENGTH = 255;
const MAX_QUALIFIED_NAME_LENGTH = 512;
const MAX_SIGNATURE_LENGTH = 2_000;
const MAX_DOCUMENTATION_LENGTH = 4_000;

@Injectable()
export class SymbolExtractionService {
  constructor(
    @Inject(indexingConfig.KEY)
    private readonly configuration: ConfigType<typeof indexingConfig>,
    private readonly sourceParsingService: SourceParsingService,
    private readonly codeSymbolsRepository: CodeSymbolsRepository,
  ) {}

  /**
   * Parses one immutable file version outside a transaction, validates the
   * normalized output, then reconciles its symbols in one short transaction.
   */
  async extractAndPersist(
    input: ExtractAndPersistSymbolsInput,
  ): Promise<SymbolExtractionResult> {
    this.assertInput(input);

    const parsed = await this.sourceParsingService.parseFile(input);

    if (
      parsed.indexedFileId !== input.indexedFileId ||
      parsed.fileHashId !== input.fileHashId ||
      parsed.path !== input.path
    ) {
      throw new SymbolExtractionError(
        'Parser result does not match the requested file version',
        SymbolExtractionErrorCode.ParserIdentityMismatch,
      );
    }

    if (parsed.symbols.length > this.configuration.maxSymbolsPerFile) {
      throw new SymbolExtractionError(
        'Source file exceeds the configured symbol limit',
        SymbolExtractionErrorCode.TooManySymbols,
      );
    }

    const symbols = parsed.symbols.map((symbol) =>
      this.toPersistenceRecord(symbol),
    );
    this.assertUniqueIdentities(symbols);

    const persistence = await this.codeSymbolsRepository.persistFileVersion({
      organizationId: input.organizationId,
      repositoryId: input.repositoryId,
      branchId: input.branchId,
      indexJobId: input.indexJobId,
      targetCommitSha: input.targetCommitSha,
      indexedFileId: input.indexedFileId,
      fileHashId: input.fileHashId,
      gitBlobOid: input.gitBlobOid,
      expectedSizeBytes: input.expectedSizeBytes,
      symbols,
    });

    if (!persistence) {
      throw new SymbolExtractionError(
        'Indexing job no longer owns symbol persistence for this file version',
        SymbolExtractionErrorCode.PersistenceOwnershipLost,
      );
    }

    return {
      indexJobId: input.indexJobId,
      indexedFileId: input.indexedFileId,
      fileHashId: input.fileHashId,
      parsedSymbols: parsed.symbols.length,
      createdSymbols: persistence.createdSymbols,
      updatedSymbols: persistence.updatedSymbols,
      removedSymbols: persistence.removedSymbols,
      diagnostics: parsed.diagnostics.length,
      hasSyntaxErrors: parsed.hasSyntaxErrors,
    };
  }

  private assertInput(input: ExtractAndPersistSymbolsInput): void {
    if (
      !Number.isSafeInteger(input.branchId) ||
      input.branchId < 1 ||
      !Number.isSafeInteger(input.indexJobId) ||
      input.indexJobId < 1
    ) {
      throw new SymbolExtractionError(
        'Symbol extraction job or branch identity is invalid',
        SymbolExtractionErrorCode.InvalidMetadata,
      );
    }
  }

  private toPersistenceRecord(symbol: ParsedSymbol): PersistCodeSymbolRecord {
    this.assertSymbol(symbol);

    return {
      name: symbol.name,
      qualifiedName: symbol.qualifiedName,
      kind: this.mapKind(symbol.kind),
      visibility: this.mapVisibility(symbol.visibility),
      exported: symbol.exported,
      defaultExport: symbol.defaultExport,
      signature: symbol.signature,
      documentation: symbol.documentation,
      startLine: symbol.range.start.line,
      startColumn: symbol.range.start.column,
      startOffset: symbol.range.start.offset,
      endLine: symbol.range.end.line,
      endColumn: symbol.range.end.column,
      endOffset: symbol.range.end.offset,
    };
  }

  private assertSymbol(symbol: ParsedSymbol): void {
    const start = symbol.range.start;
    const end = symbol.range.end;
    const validPosition =
      Number.isSafeInteger(start.line) &&
      start.line >= 1 &&
      Number.isSafeInteger(start.column) &&
      start.column >= 1 &&
      Number.isSafeInteger(start.offset) &&
      start.offset >= 0 &&
      Number.isSafeInteger(end.line) &&
      end.line >= start.line &&
      Number.isSafeInteger(end.column) &&
      end.column >= 1 &&
      (end.line > start.line || end.column >= start.column) &&
      Number.isSafeInteger(end.offset) &&
      end.offset >= start.offset;

    if (
      symbol.name.length < 1 ||
      symbol.name.length > MAX_SYMBOL_NAME_LENGTH ||
      symbol.qualifiedName.length < 1 ||
      symbol.qualifiedName.length > MAX_QUALIFIED_NAME_LENGTH ||
      (symbol.signature?.length ?? 0) > MAX_SIGNATURE_LENGTH ||
      (symbol.documentation?.length ?? 0) > MAX_DOCUMENTATION_LENGTH ||
      !validPosition
    ) {
      throw new SymbolExtractionError(
        'Parser returned symbol metadata outside persistence limits',
        SymbolExtractionErrorCode.InvalidMetadata,
      );
    }
  }

  private assertUniqueIdentities(
    symbols: readonly PersistCodeSymbolRecord[],
  ): void {
    const identities = new Set<string>();

    for (const symbol of symbols) {
      const identity = JSON.stringify([
        symbol.kind,
        symbol.qualifiedName,
        symbol.startOffset,
      ]);

      if (identities.has(identity)) {
        throw new SymbolExtractionError(
          'Parser returned duplicate symbol identities for one file version',
          SymbolExtractionErrorCode.DuplicateSymbolIdentity,
        );
      }

      identities.add(identity);
    }
  }

  private mapKind(kind: ParsedSymbolKind): CodeSymbolKind {
    switch (kind) {
      case ParsedSymbolKind.Class:
        return CodeSymbolKind.Class;
      case ParsedSymbolKind.Interface:
        return CodeSymbolKind.Interface;
      case ParsedSymbolKind.Function:
        return CodeSymbolKind.Function;
      case ParsedSymbolKind.Method:
        return CodeSymbolKind.Method;
      case ParsedSymbolKind.Enum:
        return CodeSymbolKind.Enum;
      case ParsedSymbolKind.TypeAlias:
        return CodeSymbolKind.TypeAlias;
    }
  }

  private mapVisibility(
    visibility: ParsedSymbolVisibility | null,
  ): CodeSymbolVisibility | null {
    switch (visibility) {
      case ParsedSymbolVisibility.Public:
        return CodeSymbolVisibility.Public;
      case ParsedSymbolVisibility.Protected:
        return CodeSymbolVisibility.Protected;
      case ParsedSymbolVisibility.Private:
        return CodeSymbolVisibility.Private;
      case null:
        return null;
    }
  }
}
