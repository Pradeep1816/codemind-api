import { Injectable } from '@nestjs/common';
import ts from 'typescript';
import { ParsedExportKind } from '../enums/parsed-export-kind.enum';
import { ParsedRelationshipKind } from '../enums/parsed-relationship-kind.enum';
import { ParsedSymbolKind } from '../enums/parsed-symbol-kind.enum';
import { ParsedSymbolVisibility } from '../enums/parsed-symbol-visibility.enum';
import { ParserDiagnosticCategory } from '../enums/parser-diagnostic-category.enum';
import { SourceParser } from '../interfaces/source-parser.interface';
import { ParserError, ParserErrorCode } from '../parser.errors';
import {
  ParsedExport,
  ParsedImport,
  ParsedRelationship,
  ParsedSymbol,
  ParserDiagnostic,
  ParseSourceInput,
  ParseSourceResult,
  SourceRange,
} from '../types/parser.types';

const TYPESCRIPT_EXTENSIONS = new Set(['ts', 'tsx']);
const JAVASCRIPT_EXTENSIONS = new Set(['js', 'jsx']);
const MAX_SIGNATURE_LENGTH = 2_000;
const MAX_DOCUMENTATION_LENGTH = 4_000;

@Injectable()
export class TypeScriptSourceParser implements SourceParser {
  /**
   * Accepts only the TypeScript and JavaScript language families configured by
   * the indexing language registry. The extension selects the correct JSX or
   * non-JSX syntax mode.
   */
  supports(input: Pick<ParseSourceInput, 'language' | 'extension'>): boolean {
    const extension = this.normalizeExtension(input.extension);

    return (
      (input.language === 'typescript' &&
        TYPESCRIPT_EXTENSIONS.has(extension)) ||
      (input.language === 'javascript' && JAVASCRIPT_EXTENSIONS.has(extension))
    );
  }

  /**
   * Parses bounded source text without evaluating it and converts compiler AST
   * nodes into CodeMind-owned plain objects. No compiler node or database
   * entity crosses this adapter boundary.
   */
  parse(input: ParseSourceInput): Promise<ParseSourceResult> {
    this.assertInput(input);

    if (!this.supports(input)) {
      throw new ParserError(
        `No TypeScript parser dialect supports ${input.language}/${input.extension}`,
        ParserErrorCode.UnsupportedLanguage,
      );
    }

    const sourceFile = ts.createSourceFile(
      input.path,
      input.content,
      ts.ScriptTarget.Latest,
      true,
      this.getScriptKind(input.extension),
    );
    const diagnostics = this.collectDiagnostics(input, sourceFile);

    return Promise.resolve({
      indexedFileId: input.indexedFileId,
      fileHashId: input.fileHashId,
      path: input.path,
      language: input.language,
      extension: this.normalizeExtension(input.extension),
      symbols: this.collectSymbols(sourceFile),
      imports: this.collectImports(sourceFile),
      exports: this.collectExports(sourceFile),
      relationships: this.collectRelationships(sourceFile),
      diagnostics,
      hasSyntaxErrors: diagnostics.some(
        (diagnostic) => diagnostic.category === ParserDiagnosticCategory.Error,
      ),
    });
  }

  private assertInput(input: ParseSourceInput): void {
    if (
      !Number.isSafeInteger(input.indexedFileId) ||
      input.indexedFileId < 1 ||
      !Number.isSafeInteger(input.fileHashId) ||
      input.fileHashId < 1 ||
      input.path.trim().length === 0 ||
      input.path.includes('\0') ||
      typeof input.content !== 'string'
    ) {
      throw new ParserError(
        'Parser input identity, path, or content is invalid',
        ParserErrorCode.InvalidInput,
      );
    }
  }

  private getScriptKind(extensionValue: string): ts.ScriptKind {
    switch (this.normalizeExtension(extensionValue)) {
      case 'tsx':
        return ts.ScriptKind.TSX;
      case 'js':
        return ts.ScriptKind.JS;
      case 'jsx':
        return ts.ScriptKind.JSX;
      default:
        return ts.ScriptKind.TS;
    }
  }

  private normalizeExtension(extension: string): string {
    return extension.trim().replace(/^\./u, '').toLowerCase();
  }

  private collectDiagnostics(
    input: ParseSourceInput,
    sourceFile: ts.SourceFile,
  ): ParserDiagnostic[] {
    const compilerOptions: ts.CompilerOptions = {
      allowJs: true,
      checkJs: false,
      jsx: ts.JsxEmit.Preserve,
      module: ts.ModuleKind.ESNext,
      noEmit: true,
      noLib: true,
      noResolve: true,
      target: ts.ScriptTarget.Latest,
    };
    const compilerHost: ts.CompilerHost = {
      fileExists: (fileName) => fileName === input.path,
      getCanonicalFileName: (fileName) => fileName,
      getCurrentDirectory: () => '',
      getDefaultLibFileName: () => 'lib.d.ts',
      getNewLine: () => '\n',
      getSourceFile: (fileName) =>
        fileName === input.path ? sourceFile : undefined,
      readFile: (fileName) =>
        fileName === input.path ? input.content : undefined,
      useCaseSensitiveFileNames: () => true,
      writeFile: () => undefined,
    };
    const program = ts.createProgram(
      [input.path],
      compilerOptions,
      compilerHost,
    );

    return program.getSyntacticDiagnostics(sourceFile).map((diagnostic) => ({
      code: diagnostic.code,
      category: this.mapDiagnosticCategory(diagnostic.category),
      message: ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
      range:
        diagnostic.start === undefined
          ? null
          : this.createRange(
              sourceFile,
              diagnostic.start,
              diagnostic.start + (diagnostic.length ?? 0),
            ),
    }));
  }

  private mapDiagnosticCategory(
    category: ts.DiagnosticCategory,
  ): ParserDiagnosticCategory {
    switch (category) {
      case ts.DiagnosticCategory.Warning:
        return ParserDiagnosticCategory.Warning;
      case ts.DiagnosticCategory.Error:
        return ParserDiagnosticCategory.Error;
      case ts.DiagnosticCategory.Suggestion:
        return ParserDiagnosticCategory.Suggestion;
      default:
        return ParserDiagnosticCategory.Message;
    }
  }

  private collectSymbols(sourceFile: ts.SourceFile): ParsedSymbol[] {
    const symbols: ParsedSymbol[] = [];

    const visit = (node: ts.Node, containers: readonly string[]): void => {
      let childContainers = containers;

      if (ts.isClassDeclaration(node) || ts.isClassExpression(node)) {
        const name = node.name?.text;

        if (name) {
          symbols.push(
            this.createSymbol(
              sourceFile,
              node,
              name,
              ParsedSymbolKind.Class,
              containers,
            ),
          );
          childContainers = [...containers, name];
        }
      } else if (ts.isInterfaceDeclaration(node)) {
        symbols.push(
          this.createSymbol(
            sourceFile,
            node,
            node.name.text,
            ParsedSymbolKind.Interface,
            containers,
          ),
        );
        childContainers = [...containers, node.name.text];
      } else if (ts.isFunctionDeclaration(node) && node.name) {
        symbols.push(
          this.createSymbol(
            sourceFile,
            node,
            node.name.text,
            ParsedSymbolKind.Function,
            containers,
          ),
        );
        childContainers = [...containers, node.name.text];
      } else if (
        ts.isMethodDeclaration(node) ||
        ts.isMethodSignature(node) ||
        ts.isGetAccessorDeclaration(node) ||
        ts.isSetAccessorDeclaration(node)
      ) {
        const name = this.readNodeName(node.name, sourceFile);

        if (name) {
          symbols.push(
            this.createSymbol(
              sourceFile,
              node,
              name,
              ParsedSymbolKind.Method,
              containers,
            ),
          );
        }
      } else if (ts.isConstructorDeclaration(node)) {
        symbols.push(
          this.createSymbol(
            sourceFile,
            node,
            'constructor',
            ParsedSymbolKind.Method,
            containers,
          ),
        );
      } else if (ts.isEnumDeclaration(node)) {
        symbols.push(
          this.createSymbol(
            sourceFile,
            node,
            node.name.text,
            ParsedSymbolKind.Enum,
            containers,
          ),
        );
        childContainers = [...containers, node.name.text];
      } else if (ts.isTypeAliasDeclaration(node)) {
        symbols.push(
          this.createSymbol(
            sourceFile,
            node,
            node.name.text,
            ParsedSymbolKind.TypeAlias,
            containers,
          ),
        );
      } else if (
        ts.isVariableDeclaration(node) &&
        ts.isIdentifier(node.name) &&
        node.initializer &&
        (ts.isArrowFunction(node.initializer) ||
          ts.isFunctionExpression(node.initializer))
      ) {
        symbols.push(
          this.createSymbol(
            sourceFile,
            node,
            node.name.text,
            ParsedSymbolKind.Function,
            containers,
            this.findVariableStatement(node),
          ),
        );
      }

      ts.forEachChild(node, (child) => visit(child, childContainers));
    };

    visit(sourceFile, []);

    return symbols;
  }

  private createSymbol(
    sourceFile: ts.SourceFile,
    node: ts.Node,
    name: string,
    kind: ParsedSymbolKind,
    containers: readonly string[],
    modifierNode: ts.Node = node,
  ): ParsedSymbol {
    return {
      name,
      qualifiedName: [...containers, name].join('.'),
      kind,
      visibility: this.readVisibility(node),
      exported: this.hasModifier(modifierNode, ts.SyntaxKind.ExportKeyword),
      defaultExport: this.hasModifier(
        modifierNode,
        ts.SyntaxKind.DefaultKeyword,
      ),
      signature: this.readSignature(node, sourceFile),
      documentation: this.readDocumentation(modifierNode, sourceFile),
      range: this.createNodeRange(sourceFile, node),
    };
  }

  private readVisibility(node: ts.Node): ParsedSymbolVisibility | null {
    if (
      (ts.isMethodDeclaration(node) ||
        ts.isMethodSignature(node) ||
        ts.isGetAccessorDeclaration(node) ||
        ts.isSetAccessorDeclaration(node)) &&
      ts.isPrivateIdentifier(node.name)
    ) {
      return ParsedSymbolVisibility.Private;
    }

    if (this.hasModifier(node, ts.SyntaxKind.PrivateKeyword)) {
      return ParsedSymbolVisibility.Private;
    }

    if (this.hasModifier(node, ts.SyntaxKind.ProtectedKeyword)) {
      return ParsedSymbolVisibility.Protected;
    }

    if (this.hasModifier(node, ts.SyntaxKind.PublicKeyword)) {
      return ParsedSymbolVisibility.Public;
    }

    if (
      node.parent &&
      (ts.isClassDeclaration(node.parent) ||
        ts.isClassExpression(node.parent) ||
        ts.isInterfaceDeclaration(node.parent))
    ) {
      return ParsedSymbolVisibility.Public;
    }

    return null;
  }

  private readSignature(node: ts.Node, sourceFile: ts.SourceFile): string {
    const start = node.getStart(sourceFile, false);
    let end = node.getEnd();
    const body = this.readFunctionBody(node);

    if (body) {
      end = body.getStart(sourceFile, false);
    } else if (
      ts.isClassDeclaration(node) ||
      ts.isClassExpression(node) ||
      ts.isInterfaceDeclaration(node) ||
      ts.isEnumDeclaration(node)
    ) {
      const openingBrace = node
        .getChildren(sourceFile)
        .find((child) => child.kind === ts.SyntaxKind.OpenBraceToken);

      if (openingBrace) {
        end = openingBrace.getStart(sourceFile, false);
      }
    } else if (
      ts.isVariableDeclaration(node) &&
      node.initializer &&
      (ts.isArrowFunction(node.initializer) ||
        ts.isFunctionExpression(node.initializer))
    ) {
      end = node.initializer.body?.getStart(sourceFile, false) ?? node.getEnd();
    }

    return sourceFile.text
      .slice(start, end)
      .trim()
      .slice(0, MAX_SIGNATURE_LENGTH);
  }

  private readFunctionBody(node: ts.Node): ts.ConciseBody | undefined {
    if (
      ts.isFunctionDeclaration(node) ||
      ts.isMethodDeclaration(node) ||
      ts.isGetAccessorDeclaration(node) ||
      ts.isSetAccessorDeclaration(node) ||
      ts.isConstructorDeclaration(node) ||
      ts.isFunctionExpression(node) ||
      ts.isArrowFunction(node)
    ) {
      return node.body;
    }

    return undefined;
  }

  private readDocumentation(
    node: ts.Node | undefined,
    sourceFile: ts.SourceFile,
  ): string | null {
    if (!node) {
      return null;
    }

    const documentation = ts
      .getJSDocCommentsAndTags(node)
      .filter(ts.isJSDoc)
      .map((comment) => {
        if (typeof comment.comment === 'string') {
          return comment.comment;
        }

        return (
          comment.comment?.map((part) => part.getText(sourceFile)).join('') ??
          ''
        );
      })
      .filter((comment) => comment.length > 0)
      .join('\n\n')
      .trim();

    return documentation.length > 0
      ? documentation.slice(0, MAX_DOCUMENTATION_LENGTH)
      : null;
  }

  private findVariableStatement(
    declaration: ts.VariableDeclaration,
  ): ts.VariableStatement | undefined {
    const declarationList = declaration.parent;
    const statement = declarationList.parent;

    return ts.isVariableStatement(statement) ? statement : undefined;
  }

  private collectImports(sourceFile: ts.SourceFile): ParsedImport[] {
    const imports: ParsedImport[] = [];

    for (const statement of sourceFile.statements) {
      if (
        !ts.isImportDeclaration(statement) ||
        !ts.isStringLiteralLike(statement.moduleSpecifier)
      ) {
        continue;
      }

      const clause = statement.importClause;
      let namespaceImport: string | null = null;
      const namedImports: ParsedImport['namedImports'] = [];

      if (clause?.namedBindings) {
        if (ts.isNamespaceImport(clause.namedBindings)) {
          namespaceImport = clause.namedBindings.name.text;
        } else {
          for (const element of clause.namedBindings.elements) {
            namedImports.push({
              importedName: element.propertyName?.text ?? element.name.text,
              localName: element.name.text,
              typeOnly: clause.isTypeOnly || element.isTypeOnly,
              range: this.createNodeRange(sourceFile, element),
            });
          }
        }
      }

      imports.push({
        moduleSpecifier: statement.moduleSpecifier.text,
        defaultImport: clause?.name?.text ?? null,
        namespaceImport,
        namedImports,
        typeOnly: clause?.isTypeOnly ?? false,
        range: this.createNodeRange(sourceFile, statement),
      });
    }

    return imports;
  }

  private collectExports(sourceFile: ts.SourceFile): ParsedExport[] {
    const exports: ParsedExport[] = [];

    for (const statement of sourceFile.statements) {
      if (ts.isExportDeclaration(statement)) {
        exports.push(...this.createExportDeclarations(sourceFile, statement));
        continue;
      }

      if (ts.isExportAssignment(statement)) {
        exports.push({
          kind: statement.isExportEquals
            ? ParsedExportKind.Assignment
            : ParsedExportKind.Default,
          exportedName: statement.isExportEquals ? null : 'default',
          localName: this.readExportExpressionName(statement.expression),
          moduleSpecifier: null,
          typeOnly: false,
          range: this.createNodeRange(sourceFile, statement),
        });
        continue;
      }

      if (!this.hasModifier(statement, ts.SyntaxKind.ExportKeyword)) {
        continue;
      }

      const defaultExport = this.hasModifier(
        statement,
        ts.SyntaxKind.DefaultKeyword,
      );
      const localNames = this.readExportedDeclarationNames(statement);

      if (
        defaultExport &&
        localNames.length === 0 &&
        (ts.isClassDeclaration(statement) ||
          ts.isFunctionDeclaration(statement))
      ) {
        exports.push({
          kind: ParsedExportKind.Declaration,
          exportedName: 'default',
          localName: null,
          moduleSpecifier: null,
          typeOnly: false,
          range: this.createNodeRange(sourceFile, statement),
        });
      }

      for (const localName of localNames) {
        exports.push({
          kind: ParsedExportKind.Declaration,
          exportedName: defaultExport ? 'default' : localName,
          localName,
          moduleSpecifier: null,
          typeOnly:
            ts.isInterfaceDeclaration(statement) ||
            ts.isTypeAliasDeclaration(statement),
          range: this.createNodeRange(sourceFile, statement),
        });
      }
    }

    return exports;
  }

  private collectRelationships(
    sourceFile: ts.SourceFile,
  ): ParsedRelationship[] {
    const relationships: ParsedRelationship[] = [];

    const visit = (node: ts.Node, containers: readonly string[]): void => {
      let childContainers = containers;

      if (ts.isClassDeclaration(node) && node.name) {
        const qualifiedName = [...containers, node.name.text].join('.');
        this.collectHeritageRelationships(
          sourceFile,
          node,
          ParsedSymbolKind.Class,
          qualifiedName,
          relationships,
        );
        childContainers = [...containers, node.name.text];
      } else if (ts.isInterfaceDeclaration(node)) {
        const qualifiedName = [...containers, node.name.text].join('.');
        this.collectHeritageRelationships(
          sourceFile,
          node,
          ParsedSymbolKind.Interface,
          qualifiedName,
          relationships,
        );
        childContainers = [...containers, node.name.text];
      } else if (ts.isFunctionDeclaration(node) && node.name) {
        childContainers = [...containers, node.name.text];
      } else if (ts.isEnumDeclaration(node)) {
        childContainers = [...containers, node.name.text];
      }

      ts.forEachChild(node, (child) => visit(child, childContainers));
    };

    visit(sourceFile, []);

    return relationships;
  }

  private collectHeritageRelationships(
    sourceFile: ts.SourceFile,
    declaration: ts.ClassDeclaration | ts.InterfaceDeclaration,
    sourceKind: ParsedSymbolKind.Class | ParsedSymbolKind.Interface,
    sourceQualifiedName: string,
    relationships: ParsedRelationship[],
  ): void {
    for (const clause of declaration.heritageClauses ?? []) {
      const kind =
        clause.token === ts.SyntaxKind.ExtendsKeyword
          ? ParsedRelationshipKind.Extends
          : ParsedRelationshipKind.Implements;

      for (const target of clause.types) {
        relationships.push({
          kind,
          sourceSymbol: {
            kind: sourceKind,
            qualifiedName: sourceQualifiedName,
            startOffset: declaration.getStart(sourceFile, false),
          },
          targetName: target.expression.getText(sourceFile),
          range: this.createNodeRange(sourceFile, target),
        });
      }
    }
  }

  private createExportDeclarations(
    sourceFile: ts.SourceFile,
    declaration: ts.ExportDeclaration,
  ): ParsedExport[] {
    const moduleSpecifier =
      declaration.moduleSpecifier &&
      ts.isStringLiteralLike(declaration.moduleSpecifier)
        ? declaration.moduleSpecifier.text
        : null;
    const range = this.createNodeRange(sourceFile, declaration);

    if (!declaration.exportClause) {
      return [
        {
          kind: ParsedExportKind.All,
          exportedName: null,
          localName: null,
          moduleSpecifier,
          typeOnly: declaration.isTypeOnly,
          range,
        },
      ];
    }

    if (ts.isNamespaceExport(declaration.exportClause)) {
      return [
        {
          kind: ParsedExportKind.Namespace,
          exportedName: declaration.exportClause.name.text,
          localName: null,
          moduleSpecifier,
          typeOnly: declaration.isTypeOnly,
          range,
        },
      ];
    }

    return declaration.exportClause.elements.map((element) => ({
      kind: ParsedExportKind.Named,
      exportedName: element.name.text,
      localName: element.propertyName?.text ?? element.name.text,
      moduleSpecifier,
      typeOnly: declaration.isTypeOnly || element.isTypeOnly,
      range: this.createNodeRange(sourceFile, element),
    }));
  }

  private readExportedDeclarationNames(statement: ts.Statement): string[] {
    if (
      ts.isClassDeclaration(statement) ||
      ts.isFunctionDeclaration(statement)
    ) {
      return statement.name ? [statement.name.text] : [];
    }

    if (
      ts.isInterfaceDeclaration(statement) ||
      ts.isEnumDeclaration(statement) ||
      ts.isTypeAliasDeclaration(statement)
    ) {
      return [statement.name.text];
    }

    if (ts.isVariableStatement(statement)) {
      return statement.declarationList.declarations
        .map((declaration) =>
          ts.isIdentifier(declaration.name) ? declaration.name.text : null,
        )
        .filter((name): name is string => name !== null);
    }

    return [];
  }

  private readExportExpressionName(expression: ts.Expression): string | null {
    return ts.isIdentifier(expression) ? expression.text : null;
  }

  private readNodeName(
    node: ts.Node,
    sourceFile: ts.SourceFile,
  ): string | null {
    if (
      ts.isIdentifier(node) ||
      ts.isPrivateIdentifier(node) ||
      ts.isStringLiteralLike(node) ||
      ts.isNumericLiteral(node)
    ) {
      return node.text;
    }

    const value = node.getText(sourceFile).trim();
    return value.length > 0 ? value : null;
  }

  private hasModifier(node: ts.Node | undefined, kind: ts.SyntaxKind): boolean {
    return (
      node !== undefined &&
      ts.canHaveModifiers(node) &&
      (ts.getModifiers(node)?.some((modifier) => modifier.kind === kind) ??
        false)
    );
  }

  private createNodeRange(
    sourceFile: ts.SourceFile,
    node: ts.Node,
  ): SourceRange {
    return this.createRange(
      sourceFile,
      node.getStart(sourceFile, false),
      node.getEnd(),
    );
  }

  private createRange(
    sourceFile: ts.SourceFile,
    startOffset: number,
    endOffset: number,
  ): SourceRange {
    const boundedStart = Math.max(0, Math.min(startOffset, sourceFile.end));
    const boundedEnd = Math.max(
      boundedStart,
      Math.min(endOffset, sourceFile.end),
    );
    const start = sourceFile.getLineAndCharacterOfPosition(boundedStart);
    const end = sourceFile.getLineAndCharacterOfPosition(boundedEnd);

    return {
      start: {
        line: start.line + 1,
        column: start.character + 1,
        offset: boundedStart,
      },
      end: {
        line: end.line + 1,
        column: end.character + 1,
        offset: boundedEnd,
      },
    };
  }
}
