import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import ts from 'typescript';
import analysisConfig from '../../../../config/analysis.config';
import { SourceLanguage } from '../../../indexing/enums/source-language.enum';
import { AnalysisFactFactory } from '../../analysis-fact.factory';
import { AnalysisDerivationType } from '../../enums/analysis-derivation-type.enum';
import { AnalysisEvidenceRole } from '../../enums/analysis-evidence-role.enum';
import { AnalysisFactKind } from '../../enums/analysis-fact-kind.enum';
import type { CodeAnalyzer } from '../../interfaces/code-analyzer.interface';
import type {
  AnalysisFileContext,
  AnalysisFileSupportContext,
} from '../../types/analysis-context.types';
import type { AnalysisOutput } from '../../types/analysis-diagnostic.types';
import type {
  AnalysisEvidence,
  AnalysisSourceRange,
} from '../../types/analysis-fact.types';
import {
  TypeScriptStateAnalyzerError,
  TypeScriptStateAnalyzerErrorCode,
} from './typescript-state-analyzer.errors';

const SUPPORTED_EXTENSIONS = new Set(['ts', 'tsx', 'js', 'jsx']);
const STATE_FIELD_PATTERN = /^(?:status|state)$/iu;
const STATE_LITERAL_PATTERN = /^[A-Za-z0-9_-]{1,100}$/u;

interface StateReference {
  identityKey: string;
  stateSet: string;
  name: string;
  source: 'enum_member' | 'assignment' | 'condition';
  derivationType: AnalysisDerivationType;
  confidence: number;
}

interface StateCandidate extends StateReference {
  evidence: AnalysisEvidence[];
}

interface TransitionCandidate {
  identityKey: string;
  subject: string;
  field: string;
  from: StateReference | null;
  to: StateReference;
  containingSymbolId: number | null;
  containingSymbolName: string | null;
  evidence: readonly [AnalysisEvidence, ...AnalysisEvidence[]];
}

@Injectable()
export class TypeScriptStateAnalyzer implements CodeAnalyzer {
  readonly name = 'typescript-state';
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

  /** Extracts declared states and explicit assignments without executing code. */
  *analyze(context: AnalysisFileContext): Iterable<AnalysisOutput> {
    const sourceFile = ts.createSourceFile(
      context.file.path,
      context.source.content,
      ts.ScriptTarget.Latest,
      true,
      this.getScriptKind(context.file.extension),
    );
    const nodes = [...this.walk(sourceFile)];
    const states = new Map<string, StateCandidate>();
    const transitions: TransitionCandidate[] = [];
    const transitionOccurrences = new Map<string, number>();

    for (const node of nodes) {
      if (ts.isEnumDeclaration(node)) {
        for (const member of node.members) {
          const name = this.readEnumMemberName(member.name);

          if (!name) {
            continue;
          }

          this.mergeState(
            states,
            this.stateReference(
              node.name.text,
              name,
              'enum_member',
              AnalysisDerivationType.Deterministic,
              1,
            ),
            this.createEvidence(
              context,
              sourceFile,
              member,
              AnalysisEvidenceRole.Declaration,
            ),
          );
        }
      }

      if (
        !ts.isBinaryExpression(node) ||
        node.operatorToken.kind !== ts.SyntaxKind.EqualsToken
      ) {
        continue;
      }

      const target = this.readStateTarget(node.left);

      if (!target) {
        continue;
      }

      const to = this.readStateReference(
        node.right,
        target.fullName,
        'assignment',
      );

      if (!to) {
        continue;
      }

      const condition = this.findGuardCondition(node, target.fullName);
      const from = condition
        ? this.readGuardedState(condition, target.fullName)
        : null;
      const containingSymbol = this.findContainingSymbol(context, node);
      const assignmentEvidence = this.createEvidence(
        context,
        sourceFile,
        node,
        AnalysisEvidenceRole.Assignment,
      );
      const transitionEvidence: [AnalysisEvidence, ...AnalysisEvidence[]] = [
        assignmentEvidence,
      ];

      if (condition && from) {
        transitionEvidence.push(
          this.createEvidence(
            context,
            sourceFile,
            condition,
            AnalysisEvidenceRole.Condition,
          ),
        );
      }

      this.mergeState(states, to, assignmentEvidence);

      if (from && condition) {
        this.mergeState(
          states,
          from,
          this.createEvidence(
            context,
            sourceFile,
            condition,
            AnalysisEvidenceRole.Condition,
          ),
        );
      }

      const signature = JSON.stringify({
        containingSymbol: containingSymbol?.qualifiedName ?? null,
        field: target.field,
        from: from?.identityKey ?? null,
        subject: target.subject,
        to: to.identityKey,
      });
      const occurrence = transitionOccurrences.get(signature) ?? 0;
      transitionOccurrences.set(signature, occurrence + 1);
      transitions.push({
        identityKey: this.stableIdentity('state_transition', [
          context.file.path,
          signature,
          String(occurrence),
        ]),
        subject: target.subject,
        field: target.field,
        from,
        to,
        containingSymbolId: containingSymbol?.id ?? null,
        containingSymbolName: containingSymbol?.qualifiedName ?? null,
        evidence: transitionEvidence,
      });
    }

    for (const state of states.values()) {
      yield this.factFactory.create({
        kind: AnalysisFactKind.State,
        identityKey: state.identityKey,
        analyzerName: this.name,
        analyzerVersion: this.version,
        derivationType: state.derivationType,
        confidence: state.confidence,
        properties: {
          name: state.name,
          source: state.source,
          stateSet: state.stateSet,
        },
        evidence: state.evidence as [AnalysisEvidence, ...AnalysisEvidence[]],
      });
    }

    for (const transition of transitions) {
      yield this.factFactory.create({
        kind: AnalysisFactKind.StateTransition,
        identityKey: transition.identityKey,
        analyzerName: this.name,
        analyzerVersion: this.version,
        derivationType:
          transition.from &&
          transition.from.derivationType ===
            AnalysisDerivationType.Deterministic &&
          transition.to.derivationType === AnalysisDerivationType.Deterministic
            ? AnalysisDerivationType.Deterministic
            : AnalysisDerivationType.Heuristic,
        confidence: transition.from
          ? Math.min(transition.from.confidence, transition.to.confidence)
          : transition.to.confidence,
        properties: {
          containingSymbolId: transition.containingSymbolId,
          containingSymbolName: transition.containingSymbolName,
          field: transition.field,
          fromStateIdentityKey: transition.from?.identityKey ?? null,
          fromStateName: transition.from?.name ?? null,
          subject: transition.subject,
          toStateIdentityKey: transition.to.identityKey,
          toStateName: transition.to.name,
        },
        evidence: transition.evidence,
      });
    }
  }

  private readStateTarget(
    expression: ts.Expression,
  ): { fullName: string; subject: string; field: string } | null {
    const fullName = this.readExpressionName(expression);

    if (!fullName) {
      return null;
    }

    const parts = fullName.split('.');
    const field = parts.at(-1) ?? '';

    if (!STATE_FIELD_PATTERN.test(field)) {
      return null;
    }

    return {
      fullName,
      subject: parts.slice(0, -1).join('.') || 'local',
      field,
    };
  }

  private readStateReference(
    expression: ts.Expression,
    fallbackStateSet: string,
    source: StateReference['source'],
  ): StateReference | null {
    if (ts.isPropertyAccessExpression(expression)) {
      const stateSet = this.readExpressionName(expression.expression);

      if (!stateSet) {
        return null;
      }

      return this.stateReference(
        stateSet,
        expression.name.text,
        source,
        AnalysisDerivationType.Deterministic,
        1,
      );
    }

    if (
      (ts.isStringLiteralLike(expression) ||
        ts.isNoSubstitutionTemplateLiteral(expression)) &&
      STATE_LITERAL_PATTERN.test(expression.text)
    ) {
      return this.stateReference(
        fallbackStateSet,
        expression.text,
        source,
        AnalysisDerivationType.Heuristic,
        0.9,
      );
    }

    return null;
  }

  private readGuardedState(
    condition: ts.Expression,
    targetName: string,
  ): StateReference | null {
    if (
      !ts.isBinaryExpression(condition) ||
      (condition.operatorToken.kind !== ts.SyntaxKind.EqualsEqualsEqualsToken &&
        condition.operatorToken.kind !== ts.SyntaxKind.EqualsEqualsToken)
    ) {
      return null;
    }

    const leftName = this.readExpressionName(condition.left);
    const rightName = this.readExpressionName(condition.right);

    if (leftName === targetName) {
      return this.readStateReference(condition.right, targetName, 'condition');
    }

    if (rightName === targetName) {
      return this.readStateReference(condition.left, targetName, 'condition');
    }

    return null;
  }

  private findGuardCondition(
    node: ts.Node,
    targetName: string,
  ): ts.Expression | null {
    let current: ts.Node | undefined = node.parent;

    while (current) {
      if (ts.isIfStatement(current)) {
        const withinThen =
          current.thenStatement.getStart() <= node.getStart() &&
          current.thenStatement.getEnd() >= node.getEnd();

        if (
          withinThen &&
          this.readGuardedState(current.expression, targetName)
        ) {
          return current.expression;
        }
      }

      if (
        ts.isMethodDeclaration(current) ||
        ts.isFunctionDeclaration(current) ||
        ts.isFunctionExpression(current) ||
        ts.isArrowFunction(current)
      ) {
        break;
      }

      current = current.parent;
    }

    return null;
  }

  private stateReference(
    stateSet: string,
    name: string,
    source: StateReference['source'],
    derivationType: AnalysisDerivationType,
    confidence: number,
  ): StateReference {
    return {
      identityKey: this.stableIdentity('state', [
        stateSet.toLocaleLowerCase('en-US'),
        name.toLocaleLowerCase('en-US'),
      ]),
      stateSet,
      name,
      source,
      derivationType,
      confidence,
    };
  }

  private mergeState(
    states: Map<string, StateCandidate>,
    reference: StateReference,
    evidence: AnalysisEvidence,
  ): void {
    const existing = states.get(reference.identityKey);

    if (!existing) {
      states.set(reference.identityKey, { ...reference, evidence: [evidence] });
      return;
    }

    if (
      !existing.evidence.some(
        (item) => JSON.stringify(item) === JSON.stringify(evidence),
      )
    ) {
      existing.evidence.push(evidence);
    }

    if (reference.confidence > existing.confidence) {
      existing.confidence = reference.confidence;
      existing.derivationType = reference.derivationType;
      existing.source = reference.source;
    }
  }

  private readEnumMemberName(name: ts.PropertyName): string | null {
    if (ts.isIdentifier(name) || ts.isStringLiteralLike(name)) {
      return name.text;
    }

    return null;
  }

  private findContainingSymbol(context: AnalysisFileContext, node: ts.Node) {
    const startOffset = node.getStart();
    const endOffset = node.getEnd();

    return context.file.symbols
      .filter(
        (symbol) =>
          symbol.startOffset <= startOffset && symbol.endOffset >= endOffset,
      )
      .sort(
        (left, right) =>
          left.endOffset -
            left.startOffset -
            (right.endOffset - right.startOffset) || left.id - right.id,
      )[0];
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
      end: { line: end.line + 1, column: end.character + 1, offset: endOffset },
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
        throw new TypeScriptStateAnalyzerError(
          'TypeScript source exceeds the configured state AST node limit',
          TypeScriptStateAnalyzerErrorCode.AstNodeLimitExceeded,
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

  private readExpressionName(node: ts.Node): string | null {
    if (ts.isIdentifier(node) || ts.isPrivateIdentifier(node)) {
      return node.text;
    }

    if (ts.isPropertyAccessExpression(node)) {
      const receiver = this.readExpressionName(node.expression);
      return receiver ? `${receiver}.${node.name.text}` : node.name.text;
    }

    if (node.kind === ts.SyntaxKind.ThisKeyword) {
      return 'this';
    }

    return null;
  }

  private stableIdentity(prefix: string, parts: readonly string[]): string {
    return `${prefix}:${createHash('sha256')
      .update(JSON.stringify(parts))
      .digest('hex')}`;
  }

  private normalizeExtension(extension: string): string {
    return extension.replace(/^\./u, '').toLocaleLowerCase('en-US');
  }

  private getScriptKind(extension: string): ts.ScriptKind {
    switch (this.normalizeExtension(extension)) {
      case 'tsx':
        return ts.ScriptKind.TSX;
      case 'jsx':
        return ts.ScriptKind.JSX;
      case 'js':
        return ts.ScriptKind.JS;
      default:
        return ts.ScriptKind.TS;
    }
  }
}
