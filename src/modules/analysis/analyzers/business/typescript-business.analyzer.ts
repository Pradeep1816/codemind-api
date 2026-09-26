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
import { BusinessRuleType } from '../../enums/business-rule-type.enum';
import { DomainConceptSource } from '../../enums/domain-concept-source.enum';
import type { CodeAnalyzer } from '../../interfaces/code-analyzer.interface';
import type {
  AnalysisFileContext,
  AnalysisFileSupportContext,
} from '../../types/analysis-context.types';
import type { AnalysisOutput } from '../../types/analysis-diagnostic.types';
import type {
  AnalysisEvidence,
  AnalysisPropertyValue,
  AnalysisSourceRange,
} from '../../types/analysis-fact.types';
import {
  TypeScriptBusinessAnalyzerError,
  TypeScriptBusinessAnalyzerErrorCode,
} from './typescript-business-analyzer.errors';

const SUPPORTED_EXTENSIONS = new Set(['ts', 'tsx', 'js', 'jsx']);
const MAX_IDENTIFIERS_PER_PATTERN = 50;
const MAX_OUTCOME_NODES = 250;
const TECHNICAL_SUFFIXES = [
  'Configuration',
  'Controller',
  'Repository',
  'Service',
  'Provider',
  'Response',
  'Request',
  'Entity',
  'Module',
  'Config',
  'Model',
  'Input',
  'Output',
  'DTO',
  'Dto',
] as const;
const GENERIC_CONCEPTS = new Set([
  'app',
  'application',
  'base',
  'common',
  'config',
  'configuration',
  'core',
  'default',
  'helper',
  'shared',
  'utility',
  'utils',
]);
const ROUNDING_OPERATIONS = new Set([
  'Math.ceil',
  'Math.floor',
  'Math.round',
  'Math.trunc',
]);

interface DomainConceptCandidate {
  identityKey: string;
  name: string;
  normalizedName: string;
  tokens: readonly string[];
}

interface RulePattern {
  kind: string;
  identifiers: readonly string[];
  operation: string | null;
  target: string | null;
}

@Injectable()
export class TypeScriptBusinessAnalyzer implements CodeAnalyzer {
  readonly name = 'typescript-business';
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
   * Extracts conservative domain and rule candidates without executing source
   * or persisting raw expressions and literal values.
   */
  *analyze(context: AnalysisFileContext): Iterable<AnalysisOutput> {
    const sourceFile = ts.createSourceFile(
      context.file.path,
      context.source.content,
      ts.ScriptTarget.Latest,
      true,
      this.getScriptKind(context.file.extension),
    );
    const nodes = [...this.walk(sourceFile)];
    const concepts = this.extractConcepts(context, sourceFile, nodes);

    for (const concept of concepts.outputs) {
      yield concept;
    }

    const identityOccurrences = new Map<string, number>();

    for (const node of nodes) {
      if (ts.isIfStatement(node)) {
        const outcome = this.readGuardedOutcome(node.thenStatement);

        if (!outcome) {
          continue;
        }

        const condition = this.describeCondition(node.expression);
        const containingName = this.readContainingDeclarationName(node);
        const ruleType = this.classifyGuardRule(
          condition.identifiers,
          outcome.identifiers,
          containingName,
          outcome.kind,
        );

        if (!ruleType) {
          continue;
        }

        yield this.createRuleFact(
          context,
          sourceFile,
          node,
          ruleType,
          condition,
          outcome,
          concepts.candidates,
          identityOccurrences,
        );
      }

      if (ts.isCallExpression(node)) {
        const operation = this.readExpressionName(node.expression);

        if (!operation || !this.isRoundingOperation(operation)) {
          continue;
        }

        const identifiers = this.collectIdentifiers(node.arguments);
        yield this.createRuleFact(
          context,
          sourceFile,
          node,
          BusinessRuleType.Calculation,
          null,
          {
            kind: 'rounding_call',
            identifiers,
            operation,
            target: this.readAssignmentTarget(node),
          },
          concepts.candidates,
          identityOccurrences,
        );
      }
    }
  }

  private extractConcepts(
    context: AnalysisFileContext,
    sourceFile: ts.SourceFile,
    nodes: readonly ts.Node[],
  ): {
    outputs: readonly AnalysisOutput[];
    candidates: readonly DomainConceptCandidate[];
  } {
    const outputs: AnalysisOutput[] = [];
    const candidates = new Map<string, DomainConceptCandidate>();

    for (const node of nodes) {
      const classification = this.classifyConceptDeclaration(node);

      if (!classification) {
        continue;
      }

      const normalizedName = this.normalizeConceptName(classification.name);

      if (!normalizedName || this.isGenericConcept(normalizedName)) {
        continue;
      }

      const identityKey = this.stableIdentity('domain_concept', [
        normalizedName.toLocaleLowerCase('en-US'),
      ]);
      const existing = candidates.get(identityKey);

      if (existing) {
        continue;
      }

      const evidence: [AnalysisEvidence, ...AnalysisEvidence[]] = [
        this.createEvidence(
          context,
          sourceFile,
          node,
          AnalysisEvidenceRole.Declaration,
        ),
      ];

      if (classification.decorator) {
        evidence.push(
          this.createEvidence(
            context,
            sourceFile,
            classification.decorator,
            AnalysisEvidenceRole.Decorator,
          ),
        );
      }

      const candidate: DomainConceptCandidate = {
        identityKey,
        name: normalizedName,
        normalizedName: normalizedName.toLocaleLowerCase('en-US'),
        tokens: this.tokenize(normalizedName),
      };
      candidates.set(identityKey, candidate);
      outputs.push(
        this.factFactory.create({
          kind: AnalysisFactKind.DomainConcept,
          identityKey,
          analyzerName: this.name,
          analyzerVersion: this.version,
          derivationType: classification.derivationType,
          confidence: classification.confidence,
          properties: {
            declarationKind: classification.declarationKind,
            name: normalizedName,
            normalizedName: candidate.normalizedName,
            source: classification.source,
          },
          evidence,
        }),
      );
    }

    return { outputs, candidates: [...candidates.values()] };
  }

  private classifyConceptDeclaration(node: ts.Node): {
    name: string;
    declarationKind: string;
    source: DomainConceptSource;
    derivationType: AnalysisDerivationType;
    confidence: number;
    decorator: ts.Decorator | null;
  } | null {
    if (
      !ts.isClassDeclaration(node) &&
      !ts.isInterfaceDeclaration(node) &&
      !ts.isEnumDeclaration(node) &&
      !ts.isTypeAliasDeclaration(node)
    ) {
      return null;
    }

    const name = node.name?.text;

    if (!name) {
      return null;
    }

    const decorators = ts.canHaveDecorators(node)
      ? (ts.getDecorators(node) ?? [])
      : [];
    const entityDecorator = decorators.find((decorator) => {
      const expression = ts.isCallExpression(decorator.expression)
        ? decorator.expression.expression
        : decorator.expression;
      return (
        this.readExpressionName(expression)?.split('.').at(-1) === 'Entity'
      );
    });

    if (entityDecorator) {
      return {
        name,
        declarationKind: 'class',
        source: DomainConceptSource.EntityDecorator,
        derivationType: AnalysisDerivationType.Deterministic,
        confidence: 1,
        decorator: entityDecorator,
      };
    }

    if (
      ts.isInterfaceDeclaration(node) ||
      ts.isEnumDeclaration(node) ||
      ts.isTypeAliasDeclaration(node)
    ) {
      return {
        name,
        declarationKind: ts.SyntaxKind[node.kind].toLocaleLowerCase('en-US'),
        source: DomainConceptSource.DomainType,
        derivationType: AnalysisDerivationType.Heuristic,
        confidence: 0.8,
        decorator: null,
      };
    }

    if (/(?:DTO|Dto|Entity|Model|Request|Response|Input|Output)$/u.test(name)) {
      return {
        name,
        declarationKind: 'class',
        source: DomainConceptSource.BoundaryType,
        derivationType: AnalysisDerivationType.Heuristic,
        confidence: 0.85,
        decorator: null,
      };
    }

    if (/(?:Controller|Repository|Service)$/u.test(name)) {
      return {
        name,
        declarationKind: 'class',
        source: DomainConceptSource.ServiceBoundary,
        derivationType: AnalysisDerivationType.Heuristic,
        confidence: 0.7,
        decorator: null,
      };
    }

    if (this.hasExportModifier(node)) {
      return {
        name,
        declarationKind: 'class',
        source: DomainConceptSource.DomainType,
        derivationType: AnalysisDerivationType.Heuristic,
        confidence: 0.65,
        decorator: null,
      };
    }

    return null;
  }

  private createRuleFact(
    context: AnalysisFileContext,
    sourceFile: ts.SourceFile,
    evidenceNode: ts.Node,
    ruleType: BusinessRuleType,
    condition: RulePattern | null,
    outcome: RulePattern,
    concepts: readonly DomainConceptCandidate[],
    identityOccurrences: Map<string, number>,
  ): AnalysisOutput {
    const containingSymbol = this.findContainingSymbol(context, evidenceNode);
    const signalIdentifiers = [
      ...(condition?.identifiers ?? []),
      ...outcome.identifiers,
      containingSymbol?.name ?? '',
    ];
    const subjectConcepts = this.matchConcepts(signalIdentifiers, concepts);
    const signature = JSON.stringify({
      condition,
      containingSymbol: containingSymbol?.qualifiedName ?? null,
      outcome,
      ruleType,
      subjectConcepts: subjectConcepts.map((concept) => concept.identityKey),
    });
    const occurrence = identityOccurrences.get(signature) ?? 0;
    identityOccurrences.set(signature, occurrence + 1);
    const identityKey = this.stableIdentity('business_rule', [
      context.file.path,
      signature,
      String(occurrence),
    ]);
    const evidence: [AnalysisEvidence, ...AnalysisEvidence[]] = [
      this.createEvidence(
        context,
        sourceFile,
        evidenceNode,
        condition
          ? AnalysisEvidenceRole.Condition
          : AnalysisEvidenceRole.CallSite,
      ),
    ];

    return this.factFactory.create({
      kind: AnalysisFactKind.BusinessRule,
      identityKey,
      analyzerName: this.name,
      analyzerVersion: this.version,
      derivationType: AnalysisDerivationType.Deterministic,
      confidence: ruleType === BusinessRuleType.Validation ? 0.9 : 0.95,
      properties: {
        condition: condition as unknown as AnalysisPropertyValue,
        containingSymbolId: containingSymbol?.id ?? null,
        containingSymbolName: containingSymbol?.qualifiedName ?? null,
        outcome: outcome as unknown as AnalysisPropertyValue,
        ruleType,
        subjectConceptIdentityKeys: subjectConcepts.map(
          (concept) => concept.identityKey,
        ),
        subjectConceptNames: subjectConcepts.map((concept) => concept.name),
      },
      evidence,
    });
  }

  private classifyGuardRule(
    conditionIdentifiers: readonly string[],
    outcomeIdentifiers: readonly string[],
    containingName: string | null,
    outcomeKind: string,
  ): BusinessRuleType | null {
    const conditionSignals = conditionIdentifiers
      .join(' ')
      .toLocaleLowerCase('en-US');
    const signals = [
      ...conditionIdentifiers,
      ...outcomeIdentifiers,
      containingName ?? '',
    ]
      .join(' ')
      .toLocaleLowerCase('en-US');

    if (
      /(permission|authori[sz]|forbidden|role|access|ability|owner)/u.test(
        conditionSignals,
      )
    ) {
      return BusinessRuleType.Permission;
    }

    if (
      /(status|state|transition|cancelled|canceled|pending|active|inactive)/u.test(
        conditionSignals,
      )
    ) {
      return BusinessRuleType.StateConstraint;
    }

    if (/(eligible|eligibility|qualif|entitled)/u.test(conditionSignals)) {
      return BusinessRuleType.Eligibility;
    }

    if (
      /(schedule|appointment|booking|calendar|availability|available|slot)/u.test(
        conditionSignals,
      )
    ) {
      return BusinessRuleType.Scheduling;
    }

    if (
      /(permission|authori[sz]|forbidden|role|access|ability|owner)/u.test(
        signals,
      )
    ) {
      return BusinessRuleType.Permission;
    }

    if (/(eligible|eligibility|qualif|entitled)/u.test(signals)) {
      return BusinessRuleType.Eligibility;
    }

    if (
      /(status|state|transition|cancelled|canceled|pending|active|inactive)/u.test(
        signals,
      )
    ) {
      return BusinessRuleType.StateConstraint;
    }

    if (
      /(schedule|appointment|booking|calendar|availability|available|slot)/u.test(
        signals,
      )
    ) {
      return BusinessRuleType.Scheduling;
    }

    return outcomeKind === 'throw' || outcomeKind === 'return'
      ? BusinessRuleType.Validation
      : null;
  }

  private describeCondition(expression: ts.Expression): RulePattern {
    return {
      kind: ts.SyntaxKind[expression.kind].toLocaleLowerCase('en-US'),
      identifiers: this.collectIdentifiers([expression]),
      operation: this.readOperator(expression),
      target: null,
    };
  }

  private readGuardedOutcome(statement: ts.Statement): RulePattern | null {
    const pending: ts.Node[] = [statement];
    let visited = 0;

    while (pending.length > 0 && visited < MAX_OUTCOME_NODES) {
      const node = pending.shift();

      if (!node) {
        continue;
      }

      visited += 1;

      if (ts.isThrowStatement(node)) {
        return {
          kind: 'throw',
          identifiers: this.collectIdentifiers(
            node.expression ? [node.expression] : [],
          ),
          operation: null,
          target: null,
        };
      }

      if (ts.isReturnStatement(node)) {
        return {
          kind: 'return',
          identifiers: this.collectIdentifiers(
            node.expression ? [node.expression] : [],
          ),
          operation: null,
          target: null,
        };
      }

      if (ts.isCallExpression(node)) {
        return {
          kind: 'call',
          identifiers: this.collectIdentifiers([node]),
          operation: this.readExpressionName(node.expression),
          target: null,
        };
      }

      if (
        ts.isBinaryExpression(node) &&
        this.isAssignmentOperator(node.operatorToken.kind)
      ) {
        return {
          kind: 'assignment',
          identifiers: this.collectIdentifiers([node]),
          operation: ts.tokenToString(node.operatorToken.kind) ?? null,
          target: this.readExpressionName(node.left),
        };
      }

      pending.push(...node.getChildren());
    }

    return null;
  }

  private collectIdentifiers(nodes: readonly ts.Node[]): readonly string[] {
    const names = new Set<string>();
    const pending = [...nodes];

    while (pending.length > 0 && names.size < MAX_IDENTIFIERS_PER_PATTERN) {
      const node = pending.pop();

      if (!node) {
        continue;
      }

      if (ts.isIdentifier(node)) {
        names.add(node.text);
      }

      pending.push(...node.getChildren());
    }

    return [...names].sort();
  }

  private matchConcepts(
    identifiers: readonly string[],
    concepts: readonly DomainConceptCandidate[],
  ): readonly DomainConceptCandidate[] {
    const signalTokens = new Set(
      identifiers.flatMap((name) => this.tokenize(name)),
    );

    return concepts.filter(
      (concept) =>
        concept.tokens.length > 0 &&
        concept.tokens.every((token) => signalTokens.has(token)),
    );
  }

  private readContainingDeclarationName(node: ts.Node): string | null {
    let current: ts.Node | undefined = node.parent;

    while (current) {
      if (
        (ts.isMethodDeclaration(current) ||
          ts.isFunctionDeclaration(current) ||
          ts.isClassDeclaration(current)) &&
        current.name
      ) {
        return this.readExpressionName(current.name);
      }

      current = current.parent;
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
        throw new TypeScriptBusinessAnalyzerError(
          'TypeScript source exceeds the configured business AST node limit',
          TypeScriptBusinessAnalyzerErrorCode.AstNodeLimitExceeded,
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

  private normalizeConceptName(name: string): string | null {
    let base = name;

    for (const suffix of TECHNICAL_SUFFIXES) {
      if (base.endsWith(suffix) && base.length > suffix.length) {
        base = base.slice(0, -suffix.length);
        break;
      }
    }

    const tokens = base
      .replace(/([a-z0-9])([A-Z])/gu, '$1 $2')
      .replace(/([A-Z]+)([A-Z][a-z])/gu, '$1 $2')
      .split(/[^A-Za-z0-9]+/u)
      .filter(Boolean);

    return tokens.length > 0 ? tokens.join(' ') : null;
  }

  private tokenize(value: string): readonly string[] {
    return (this.normalizeConceptName(value) ?? value)
      .toLocaleLowerCase('en-US')
      .split(/\s+/u)
      .filter(Boolean);
  }

  private isGenericConcept(name: string): boolean {
    const normalized = name.toLocaleLowerCase('en-US');
    return GENERIC_CONCEPTS.has(normalized);
  }

  private hasExportModifier(node: ts.Node): boolean {
    return Boolean(
      ts.canHaveModifiers(node) &&
      ts
        .getModifiers(node)
        ?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword),
    );
  }

  private readAssignmentTarget(node: ts.CallExpression): string | null {
    const parent = node.parent;

    if (ts.isVariableDeclaration(parent) && parent.initializer === node) {
      return this.readExpressionName(parent.name);
    }

    if (
      ts.isBinaryExpression(parent) &&
      parent.right === node &&
      this.isAssignmentOperator(parent.operatorToken.kind)
    ) {
      return this.readExpressionName(parent.left);
    }

    if (ts.isReturnStatement(parent)) {
      return 'return';
    }

    return null;
  }

  private isRoundingOperation(operation: string): boolean {
    return ROUNDING_OPERATIONS.has(operation) || operation.endsWith('.toFixed');
  }

  private readOperator(expression: ts.Expression): string | null {
    if (ts.isBinaryExpression(expression)) {
      return ts.tokenToString(expression.operatorToken.kind) ?? null;
    }

    if (ts.isPrefixUnaryExpression(expression)) {
      return ts.tokenToString(expression.operator) ?? null;
    }

    return null;
  }

  private isAssignmentOperator(kind: ts.SyntaxKind): boolean {
    return (
      kind >= ts.SyntaxKind.FirstAssignment &&
      kind <= ts.SyntaxKind.LastAssignment
    );
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

    if (node.kind === ts.SyntaxKind.SuperKeyword) {
      return 'super';
    }

    if (ts.isStringLiteralLike(node) || ts.isNumericLiteral(node)) {
      return null;
    }

    return null;
  }

  private stableIdentity(prefix: string, parts: readonly string[]): string {
    const digest = createHash('sha256')
      .update(JSON.stringify(parts))
      .digest('hex');
    return `${prefix}:${digest}`;
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
