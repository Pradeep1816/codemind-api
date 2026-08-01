import { ParseIndexedFileInput } from '../parsing/source-parsing.types';

export interface ExtractAndPersistSymbolsInput extends ParseIndexedFileInput {
  branchId: number;
  indexJobId: number;
}

export interface SymbolExtractionResult {
  indexJobId: number;
  indexedFileId: number;
  fileHashId: number;
  parsedSymbols: number;
  createdSymbols: number;
  updatedSymbols: number;
  removedSymbols: number;
  diagnostics: number;
  hasSyntaxErrors: boolean;
}
