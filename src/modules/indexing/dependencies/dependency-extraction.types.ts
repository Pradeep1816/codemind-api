import { CodeDependencyKind } from '../enums/code-dependency-kind.enum';
import { ExtractAndPersistSymbolsInput } from '../symbols/symbol-extraction.types';

export interface DependencySymbolReference {
  kind: string;
  qualifiedName: string;
  startOffset: number;
}

export interface NormalizedDependency {
  kind: CodeDependencyKind;
  sourceSymbol: DependencySymbolReference | null;
  moduleSpecifier: string | null;
  targetName: string | null;
  localName: string | null;
  typeOnly: boolean;
  startLine: number;
  startColumn: number;
  startOffset: number;
  endLine: number;
  endColumn: number;
  endOffset: number;
}

export interface DependencyResolutionFile {
  indexedFileId: number;
  fileHashId: number;
  path: string;
}

export interface DependencySymbolLookup {
  id: number;
  indexedFileId: number;
  fileHashId: number;
  name: string;
  qualifiedName: string;
  kind: string;
  exported: boolean;
  defaultExport: boolean;
  startOffset: number;
}

export type ExtractAndPersistDependenciesInput = ExtractAndPersistSymbolsInput;

export interface DependencyExtractionResult {
  indexJobId: number;
  indexedFileId: number;
  fileHashId: number;
  parsedDependencies: number;
  createdDependencies: number;
  updatedDependencies: number;
  removedDependencies: number;
  fileResolvedDependencies: number;
  symbolResolvedDependencies: number;
  unresolvedDependencies: number;
  parsedSymbols: number;
  diagnostics: number;
  hasSyntaxErrors: boolean;
}
