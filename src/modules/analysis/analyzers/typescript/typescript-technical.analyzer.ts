import { Inject, Injectable } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import ts from 'typescript';
import analysisConfig from '../../../../config/analysis.config';
import { SourceLanguage } from '../../../indexing/enums/source-language.enum';
import { AnalysisFactFactory } from '../../analysis-fact.factory';
import { AnalysisDerivationType } from '../../enums/analysis-derivation-type.enum';
import { AnalysisDiagnosticSeverity } from '../../enums/analysis-diagnostic-severity.enum';
import { AnalysisEvidenceRole } from '../../enums/analysis-evidence-role.enum';
import { AnalysisFactKind } from '../../enums/analysis-fact-kind.enum';
import { CodeAnalyzer } from '../../interfaces/code-analyzer.interface';
import {
  AnalysisFileContext,
  AnalysisFileSupportContext,
} from '../../types/analysis-context.types';
import { AnalysisOutput } from '../../types/analysis-diagnostic.types';
import {
  AnalysisEvidence,
  AnalysisPropertyValue,
  AnalysisSourceRange,
} from '../../types/analysis-fact.types';
import {
  TypeScriptTechnicalAnalyzerError,
  TypeScriptTechnicalAnalyzerErrorCode,
} from './typescript-technical-analyzer.errors';

const SUPPORTED_EXTENSIONS = new Set(['ts', 'tsx', 'js', 'jsx']);
const MAX_EXPRESSION_NAME_LENGTH = 512;

@Injectable()
export class TypeScriptTechnicalAnalyzer implements CodeAnalyzer {
  readonly name = 'typescript-technical';
  readonly version = '1.0.0';

  constructor(
    private readonly factFactory: AnalysisFactFactory,
    @Inject(analysisConfig.KEY)
    private readonly configuration: ConfigType<typeof analysisConfig>,
  ) {}

  supports(context: AnalysisFileSupportContext): boolean {
    return (
      (context.file.language === SourceLanguage.TypeScript ||
        context.file.language === SourceLanguage.JavaScript) &&
      SUPPORTED_EXTENSIONS.has(this.normalizeExtension(context.file.extension))
    );
  }

  /**
   * Extracts syntax-level facts only. Resolution remains explicitly
   * unresolved until the repository-wide Milestone 4.4 pass.
   */
  *analyze(context: AnalysisFileContext): Iterable<AnalysisOutput> {
    const sourceFile = ts.createSourceFile(
      context.file.path,
      context.source.content,
      ts.ScriptTarget.Latest,
      true,
      this.getScriptKind(context.file.extension),
    );

    for (const node of this.walk(sourceFile)) {
      for (const decorator of this.getDecorators(node)) {
        yield this.createDecoratorFact(context, sourceFile, node, decorator);
      }

      if (ts.isConstructorDeclaration(node)) {
        for (const parameter of node.parameters) {
          const output = this.createInjectionOutput(
            context,
            sourceFile,
            parameter,
          );

          if (output) {
            yield output;
          }
        }
      }

      if (ts.isCallExpression(node) && !this.isInsideDecorator(node)) {
        const target = this.readCallTarget(node.expression);
        const evidence = this.createEvidence(
          context,
          sourceFile,
          node,
          AnalysisEvidenceRole.CallSite,
        );

        yield this.factFactory.create({
          kind: AnalysisFactKind.CallSite,
          identityKey: `call_site:${context.file.hash.id}:${node.getStart(sourceFile, false)}:${node.getEnd()}`,
          analyzerName: this.name,
          analyzerVersion: this.version,
          derivationType: AnalysisDerivationType.Deterministic,
          confidence: 1,
          properties: {
            argumentCount: node.arguments.length,
            callee: target.callee,
            dynamic: target.callee === null,
            member: target.member,
            optional: node.questionDotToken !== undefined,
            receiver: target.receiver,
            resolution: 'unresolved',
          },
          evidence: [evidence],
        });

        if (target.callee === null) {
          yield {
            type: 'diagnostic',
            analyzerName: this.name,
            analyzerVersion: this.version,
            code: 'unsupported_computed_call_target',
            severity: AnalysisDiagnosticSeverity.Warning,
            message:
              'A computed call target was preserved without target resolution',
            retryable: false,
            evidence,
          };
        }
      }
    }
  }

  private createDecoratorFact(
    context: AnalysisFileContext,
    sourceFile: ts.SourceFile,
    targetNode: ts.Node,
    decorator: ts.Decorator,
  ): AnalysisOutput {
    const expression = ts.isCallExpression(decorator.expression)
      ? decorator.expression.expression
      : decorator.expression;
    const decoratorName = this.readExpressionName(expression);
    const argumentsValue = ts.isCallExpression(decorator.expression)
      ? decorator.expression.arguments
          .map((argument) => this.readLiteralValue(argument))
          .filter(
            (value): value is AnalysisPropertyValue => value !== undefined,
          )
      : [];
    const startOffset = decorator.getStart(sourceFile, false);

    return this.factFactory.create({
      kind: AnalysisFactKind.Decorator,
      identityKey: `decorator:${context.file.hash.id}:${startOffset}:${decorator.getEnd()}`,
      analyzerName: this.name,
      analyzerVersion: this.version,
      derivationType: AnalysisDerivationType.Deterministic,
      confidence: 1,
      properties: {
        arguments: argumentsValue,
        name: decoratorName,
        targetKind: this.readDecoratorTargetKind(targetNode),
        targetName: this.readDeclarationName(targetNode, sourceFile),
      },
      evidence: [
        this.createEvidence(
          context,
          sourceFile,
          decorator,
          AnalysisEvidenceRole.Decorator,
        ),
      ],
    });
  }

  private createInjectionOutput(
    context: AnalysisFileContext,
    sourceFile: ts.SourceFile,
    parameter: ts.ParameterDeclaration,
  ): AnalysisOutput | null {
    const parameterName = this.readDeclarationName(parameter, sourceFile);
    const decorators = this.getDecorators(parameter);
    const injectDecorator = decorators.find(
      (decorator) => this.readDecoratorName(decorator) === 'Inject',
    );
    const optional = decorators.some(
      (decorator) => this.readDecoratorName(decorator) === 'Optional',
    );
    const token = injectDecorator
      ? this.readInjectionToken(injectDecorator)
      : null;
    const typeName = this.readTypeName(parameter.type);
    const targetName = token ?? typeName;

    if (!parameterName || !targetName) {
      return null;
    }

    return this.factFactory.create({
      kind: AnalysisFactKind.ConstructorInjection,
      identityKey: `constructor_injection:${context.file.hash.id}:${parameter.getStart(sourceFile, false)}:${parameter.getEnd()}`,
      analyzerName: this.name,
      analyzerVersion: this.version,
      derivationType: AnalysisDerivationType.Deterministic,
      confidence: 1,
      properties: {
        optional,
        parameterName,
        resolution: 'unresolved',
        targetName,
        token,
        typeName,
      },
      evidence: [
        this.createEvidence(
          context,
          sourceFile,
          parameter,
          AnalysisEvidenceRole.Injection,
        ),
      ],
    });
  }

  private createEvidence(
    context: AnalysisFileContext,
    sourceFile: ts.SourceFile,
    node: ts.Node,
    role: AnalysisEvidenceRole,
  ): AnalysisEvidence {
    const range = this.createRange(sourceFile, node);
    const containingSymbol = context.file.symbols
      .filter(
        (symbol) =>
          symbol.startOffset <= range.start.offset &&
          symbol.endOffset >= range.end.offset,
      )
      .sort(
        (left, right) =>
          left.endOffset -
            left.startOffset -
            (right.endOffset - right.startOffset) || left.id - right.id,
      )[0];

    return {
      indexedFileId: context.file.id,
      fileHashId: context.file.hash.id,
      codeSymbolId: containingSymbol?.id ?? null,
      role,
      range,
    };
  }

  private createRange(
    sourceFile: ts.SourceFile,
    node: ts.Node,
  ): AnalysisSourceRange {
    const startOffset = node.getStart(sourceFile, false);
    const endOffset = node.getEnd();
    const start = sourceFile.getLineAndCharacterOfPosition(startOffset);
    const end = sourceFile.getLineAndCharacterOfPosition(endOffset);

    return {
      start: {
        line: start.line + 1,
        column: start.character + 1,
        offset: startOffset,
      },
      end: {
        line: end.line + 1,
        column: end.character + 1,
        offset: endOffset,
      },
    };
  }

  private *walk(root: ts.Node): Generator<ts.Node> {
    const pending = [root];
    let visitedNodes = 0;

    while (pending.length > 0) {
      const node = pending.pop();

      if (!node) {
        continue;
      }

      visitedNodes += 1;

      if (visitedNodes > this.configuration.maxAstNodesPerFile) {
        throw new TypeScriptTechnicalAnalyzerError(
          'TypeScript source exceeds the configured AST node limit',
          TypeScriptTechnicalAnalyzerErrorCode.AstNodeLimitExceeded,
        );
      }

      yield node;

      const children = node.getChildren();
      for (let index = children.length - 1; index >= 0; index -= 1) {
        const child = children[index];

        if (child) {
          pending.push(child);
        }
      }
    }
  }

  private getDecorators(node: ts.Node): readonly ts.Decorator[] {
    return ts.canHaveDecorators(node) ? (ts.getDecorators(node) ?? []) : [];
  }

  private isInsideDecorator(node: ts.Node): boolean {
    let current: ts.Node | undefined = node.parent;

    while (current) {
      if (ts.isDecorator(current)) {
        return true;
      }

      current = current.parent;
    }

    return false;
  }

  private readDecoratorName(decorator: ts.Decorator): string | null {
    const expression = ts.isCallExpression(decorator.expression)
      ? decorator.expression.expression
      : decorator.expression;
    const name = this.readExpressionName(expression);

    return name?.split('.').at(-1) ?? null;
  }

  private readInjectionToken(decorator: ts.Decorator): string | null {
    if (
      !ts.isCallExpression(decorator.expression) ||
      decorator.expression.arguments.length === 0
    ) {
      return null;
    }

    const argument = decorator.expression.arguments[0];
    const literal = argument ? this.readLiteralValue(argument) : undefined;

    if (typeof literal === 'string' || typeof literal === 'number') {
      return String(literal);
    }

    return argument ? this.readExpressionName(argument) : null;
  }

  private readCallTarget(expression: ts.Expression): {
    callee: string | null;
    receiver: string | null;
    member: string | null;
  } {
    const callee = this.readExpressionName(expression);

    if (ts.isPropertyAccessExpression(expression)) {
      return {
        callee,
        receiver: this.readExpressionName(expression.expression),
        member: expression.name.text,
      };
    }

    return {
      callee,
      receiver: null,
      member: ts.isIdentifier(expression) ? expression.text : null,
    };
  }

  private readExpressionName(expression: ts.Node): string | null {
    let value: string | null = null;

    if (ts.isIdentifier(expression) || ts.isPrivateIdentifier(expression)) {
      value = expression.text;
    } else if (ts.isPropertyAccessExpression(expression)) {
      const receiver = this.readExpressionName(expression.expression);
      value = receiver ? `${receiver}.${expression.name.text}` : null;
    } else if (expression.kind === ts.SyntaxKind.SuperKeyword) {
      value = 'super';
    } else if (expression.kind === ts.SyntaxKind.ThisKeyword) {
      value = 'this';
    }

    return value && value.length <= MAX_EXPRESSION_NAME_LENGTH ? value : null;
  }

  private readTypeName(type: ts.TypeNode | undefined): string | null {
    if (!type) {
      return null;
    }

    if (ts.isTypeReferenceNode(type)) {
      return this.readEntityName(type.typeName);
    }

    return ts.isTypeQueryNode(type) ? this.readEntityName(type.exprName) : null;
  }

  private readEntityName(name: ts.EntityName): string | null {
    if (ts.isIdentifier(name)) {
      return name.text;
    }

    const left = this.readEntityName(name.left);
    const value = left ? `${left}.${name.right.text}` : null;

    return value && value.length <= MAX_EXPRESSION_NAME_LENGTH ? value : null;
  }

  private readLiteralValue(
    expression: ts.Expression,
  ): AnalysisPropertyValue | undefined {
    if (
      ts.isStringLiteral(expression) ||
      ts.isNoSubstitutionTemplateLiteral(expression)
    ) {
      return expression.text;
    }

    if (ts.isNumericLiteral(expression)) {
      return Number(expression.text);
    }

    if (expression.kind === ts.SyntaxKind.TrueKeyword) {
      return true;
    }

    if (expression.kind === ts.SyntaxKind.FalseKeyword) {
      return false;
    }

    if (expression.kind === ts.SyntaxKind.NullKeyword) {
      return null;
    }

    return undefined;
  }

  private readDecoratorTargetKind(node: ts.Node): string {
    if (ts.isClassDeclaration(node)) {
      return 'class';
    }

    if (ts.isMethodDeclaration(node)) {
      return 'method';
    }

    if (ts.isParameter(node)) {
      return 'parameter';
    }

    if (ts.isPropertyDeclaration(node)) {
      return 'property';
    }

    return 'declaration';
  }

  private readDeclarationName(
    node: ts.Node,
    sourceFile: ts.SourceFile,
  ): string | null {
    if (
      (ts.isClassDeclaration(node) ||
        ts.isMethodDeclaration(node) ||
        ts.isPropertyDeclaration(node) ||
        ts.isParameter(node)) &&
      node.name
    ) {
      if (ts.isIdentifier(node.name) || ts.isPrivateIdentifier(node.name)) {
        return node.name.text;
      }

      if (ts.isStringLiteral(node.name) || ts.isNumericLiteral(node.name)) {
        return node.name.text;
      }

      const text = node.name.getText(sourceFile);
      return text.length <= MAX_EXPRESSION_NAME_LENGTH ? text : null;
    }

    return null;
  }

  private getScriptKind(extension: string): ts.ScriptKind {
    switch (this.normalizeExtension(extension)) {
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
}
