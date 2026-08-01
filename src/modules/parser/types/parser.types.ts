import { ParsedExportKind } from '../enums/parsed-export-kind.enum';
import { ParsedSymbolKind } from '../enums/parsed-symbol-kind.enum';
import { ParsedSymbolVisibility } from '../enums/parsed-symbol-visibility.enum';
import { ParserDiagnosticCategory } from '../enums/parser-diagnostic-category.enum';

export interface SourcePosition {
  line: number;
  column: number;
  offset: number;
}

export interface SourceRange {
  start: SourcePosition;
  end: SourcePosition;
}

export interface ParseSourceInput {
  indexedFileId: number;
  fileHashId: number;
  path: string;
  language: string;
  extension: string;
  content: string;
}

export interface ParsedSymbol {
  name: string;
  qualifiedName: string;
  kind: ParsedSymbolKind;
  visibility: ParsedSymbolVisibility | null;
  exported: boolean;
  defaultExport: boolean;
  signature: string | null;
  documentation: string | null;
  range: SourceRange;
}

export interface ParsedNamedImport {
  importedName: string;
  localName: string;
  typeOnly: boolean;
}

export interface ParsedImport {
  moduleSpecifier: string;
  defaultImport: string | null;
  namespaceImport: string | null;
  namedImports: ParsedNamedImport[];
  typeOnly: boolean;
  range: SourceRange;
}

export interface ParsedExport {
  kind: ParsedExportKind;
  exportedName: string | null;
  localName: string | null;
  moduleSpecifier: string | null;
  typeOnly: boolean;
  range: SourceRange;
}

export interface ParserDiagnostic {
  code: number;
  category: ParserDiagnosticCategory;
  message: string;
  range: SourceRange | null;
}

export interface ParseSourceResult {
  indexedFileId: number;
  fileHashId: number;
  path: string;
  language: string;
  extension: string;
  symbols: ParsedSymbol[];
  imports: ParsedImport[];
  exports: ParsedExport[];
  diagnostics: ParserDiagnostic[];
  hasSyntaxErrors: boolean;
}
