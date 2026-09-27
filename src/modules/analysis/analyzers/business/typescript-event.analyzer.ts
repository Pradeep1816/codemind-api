import { createHash } from 'node:crypto';
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
import { EventResolutionStatus } from '../../enums/event-resolution-status.enum';
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
  TypeScriptEventAnalyzerError,
  TypeScriptEventAnalyzerErrorCode,
} from './typescript-event-analyzer.errors';

const SUPPORTED_EXTENSIONS = new Set(['ts', 'tsx', 'js', 'jsx']);
const EVENT_TOPIC_PATTERN = /^[A-Za-z0-9_.:-]{1,200}$/u;
const EVENT_TYPE_PATTERN = /^[A-Za-z_$][A-Za-z0-9_$.]{0,199}$/u;

type EventReferenceKind = 'topic' | 'type';
type EventOccurrence = 'publication' | 'handler_contract';

interface EventReference {
  identityKey: string;
  eventKey: string;
  name: string;
  referenceKind: EventReferenceKind;
}

interface EventCandidate extends EventReference {
  occurrences: Set<EventOccurrence>;
  operations: Set<string>;
  evidence: AnalysisEvidence[];
}

interface HandlerCandidate {
  identityKey: string;
  name: string;
  targetKind: 'class' | 'method';
  event: EventReference | null;
  resolution: EventResolutionStatus;
  evidence: AnalysisEvidence;
}

@Injectable()
export class TypeScriptEventAnalyzer implements CodeAnalyzer {
  readonly name = 'typescript-event';
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

  /** Extracts explicit event publications and framework handler contracts. */
  *analyze(context: AnalysisFileContext): Iterable<AnalysisOutput> {
    const sourceFile = ts.createSourceFile(
      context.file.path,
      context.source.content,
      ts.ScriptTarget.Latest,
      true,
      this.getScriptKind(context.file.extension),
    );
    const events = new Map<string, EventCandidate>();
    const handlers: HandlerCandidate[] = [];
    const unresolvedEvents: AnalysisOutput[] = [];

    for (const node of this.walk(sourceFile)) {
      for (const decorator of this.getDecorators(node)) {
        const decoratorName = this.readDecoratorName(decorator);

        if (decoratorName === 'OnEvent') {
          this.readTopicHandler(
            context,
            sourceFile,
            node,
            decorator,
            events,
            handlers,
            unresolvedEvents,
          );
        } else if (decoratorName === 'EventsHandler') {
          this.readTypeHandlers(
            context,
            sourceFile,
            node,
            decorator,
            events,
            handlers,
            unresolvedEvents,
          );
        }
      }

      if (ts.isCallExpression(node) && !this.isInsideDecorator(node)) {
        this.readPublication(
          context,
          sourceFile,
          node,
          events,
          unresolvedEvents,
        );
      }
    }

    for (const event of events.values()) {
      yield this.factFactory.create({
        kind: AnalysisFactKind.DomainEvent,
        identityKey: event.identityKey,
        analyzerName: this.name,
        analyzerVersion: this.version,
        derivationType: AnalysisDerivationType.Deterministic,
        confidence: 1,
        properties: {
          eventKey: event.eventKey,
          name: event.name,
          occurrences: [...event.occurrences].sort(),
          operations: [...event.operations].sort(),
          referenceKind: event.referenceKind,
          resolution: EventResolutionStatus.Resolved,
        },
        evidence: event.evidence as [AnalysisEvidence, ...AnalysisEvidence[]],
      });
    }

    for (const handler of handlers) {
      yield this.factFactory.create({
        kind: AnalysisFactKind.EventHandler,
        identityKey: handler.identityKey,
        analyzerName: this.name,
        analyzerVersion: this.version,
        derivationType: AnalysisDerivationType.Deterministic,
        confidence: handler.event ? 1 : 0.5,
        properties: {
          eventIdentityKey: handler.event?.identityKey ?? null,
          eventKey: handler.event?.eventKey ?? null,
          eventName: handler.event?.name ?? null,
          name: handler.name,
          resolution: handler.resolution,
          targetKind: handler.targetKind,
        },
        evidence: [handler.evidence],
      });
    }

    yield* unresolvedEvents;
  }

  private readPublication(
    context: AnalysisFileContext,
    sourceFile: ts.SourceFile,
    call: ts.CallExpression,
    events: Map<string, EventCandidate>,
    outputs: AnalysisOutput[],
  ): void {
    const operation = this.readExpressionName(call.expression);
    const member = operation?.split('.').at(-1);

    if (!operation || !member) {
      return;
    }

    if (member === 'emit' || member === 'emitAsync') {
      const argument = call.arguments[0];
      const reference = argument ? this.readTopicReference(argument) : null;

      if (reference) {
        this.mergeEvent(
          events,
          reference,
          'publication',
          operation,
          this.createEvidence(
            context,
            sourceFile,
            call,
            AnalysisEvidenceRole.CallSite,
          ),
        );
      } else {
        this.appendUnresolvedEvent(
          context,
          sourceFile,
          call,
          operation,
          AnalysisEvidenceRole.CallSite,
          outputs,
        );
      }

      return;
    }

    if (member === 'publish') {
      const argument = call.arguments[0];
      const reference = argument ? this.readConstructedType(argument) : null;

      if (reference) {
        this.mergeEvent(
          events,
          reference,
          'publication',
          operation,
          this.createEvidence(
            context,
            sourceFile,
            call,
            AnalysisEvidenceRole.CallSite,
          ),
        );
      } else {
        this.appendUnresolvedEvent(
          context,
          sourceFile,
          call,
          operation,
          AnalysisEvidenceRole.CallSite,
          outputs,
        );
      }

      return;
    }

    if (member !== 'publishAll') {
      return;
    }

    const argument = call.arguments[0];

    if (!argument || !ts.isArrayLiteralExpression(argument)) {
      this.appendUnresolvedEvent(
        context,
        sourceFile,
        call,
        operation,
        AnalysisEvidenceRole.CallSite,
        outputs,
      );
      return;
    }

    for (const element of argument.elements) {
      const reference = this.readConstructedType(element);

      if (reference) {
        this.mergeEvent(
          events,
          reference,
          'publication',
          operation,
          this.createEvidence(
            context,
            sourceFile,
            element,
            AnalysisEvidenceRole.CallSite,
          ),
        );
      } else {
        this.appendUnresolvedEvent(
          context,
          sourceFile,
          element,
          operation,
          AnalysisEvidenceRole.CallSite,
          outputs,
        );
      }
    }
  }

  private readTopicHandler(
    context: AnalysisFileContext,
    sourceFile: ts.SourceFile,
    target: ts.Node,
    decorator: ts.Decorator,
    events: Map<string, EventCandidate>,
    handlers: HandlerCandidate[],
    outputs: AnalysisOutput[],
  ): void {
    const argument = ts.isCallExpression(decorator.expression)
      ? decorator.expression.arguments[0]
      : undefined;
    const reference = argument ? this.readTopicReference(argument) : null;
    const evidence = this.createEvidence(
      context,
      sourceFile,
      decorator,
      AnalysisEvidenceRole.Decorator,
    );

    if (reference) {
      this.mergeEvent(
        events,
        reference,
        'handler_contract',
        'OnEvent',
        evidence,
      );
    } else {
      this.appendUnresolvedEvent(
        context,
        sourceFile,
        decorator,
        'OnEvent',
        AnalysisEvidenceRole.Decorator,
        outputs,
      );
    }

    handlers.push(
      this.createHandler(context, sourceFile, target, decorator, reference),
    );
  }

  private readTypeHandlers(
    context: AnalysisFileContext,
    sourceFile: ts.SourceFile,
    target: ts.Node,
    decorator: ts.Decorator,
    events: Map<string, EventCandidate>,
    handlers: HandlerCandidate[],
    outputs: AnalysisOutput[],
  ): void {
    const argumentsValue = ts.isCallExpression(decorator.expression)
      ? decorator.expression.arguments
      : [];

    if (argumentsValue.length === 0) {
      this.appendUnresolvedEvent(
        context,
        sourceFile,
        decorator,
        'EventsHandler',
        AnalysisEvidenceRole.Decorator,
        outputs,
      );
      handlers.push(
        this.createHandler(context, sourceFile, target, decorator, null),
      );
      return;
    }

    for (const argument of argumentsValue) {
      const reference = this.readTypeReference(argument);
      const evidence = this.createEvidence(
        context,
        sourceFile,
        decorator,
        AnalysisEvidenceRole.Decorator,
      );

      if (reference) {
        this.mergeEvent(
          events,
          reference,
          'handler_contract',
          'EventsHandler',
          evidence,
        );
      } else {
        this.appendUnresolvedEvent(
          context,
          sourceFile,
          argument,
          'EventsHandler',
          AnalysisEvidenceRole.Decorator,
          outputs,
        );
      }

      handlers.push(
        this.createHandler(context, sourceFile, target, decorator, reference),
      );
    }
  }

  private createHandler(
    context: AnalysisFileContext,
    sourceFile: ts.SourceFile,
    target: ts.Node,
    decorator: ts.Decorator,
    event: EventReference | null,
  ): HandlerCandidate {
    const targetKind = ts.isClassDeclaration(target) ? 'class' : 'method';
    const name = this.readDeclarationName(target) ?? '<anonymous-handler>';
    const startOffset = decorator.getStart(sourceFile, false);

    return {
      identityKey: this.stableIdentity('event_handler', [
        context.file.path,
        name,
        event?.identityKey ?? 'unresolved',
        String(startOffset),
      ]),
      name,
      targetKind,
      event,
      resolution: event
        ? EventResolutionStatus.Resolved
        : EventResolutionStatus.Unresolved,
      evidence: this.createEvidence(
        context,
        sourceFile,
        decorator,
        AnalysisEvidenceRole.Decorator,
      ),
    };
  }

  private appendUnresolvedEvent(
    context: AnalysisFileContext,
    sourceFile: ts.SourceFile,
    node: ts.Node,
    operation: string,
    role: AnalysisEvidenceRole,
    outputs: AnalysisOutput[],
  ): void {
    const evidence = this.createEvidence(context, sourceFile, node, role);
    outputs.push(
      this.factFactory.create({
        kind: AnalysisFactKind.DomainEvent,
        identityKey: this.stableIdentity('domain_event_reference', [
          context.file.path,
          operation,
          String(node.getStart(sourceFile, false)),
          String(node.getEnd()),
        ]),
        analyzerName: this.name,
        analyzerVersion: this.version,
        derivationType: AnalysisDerivationType.Deterministic,
        confidence: 0,
        properties: {
          eventKey: null,
          name: null,
          occurrences: [
            role === AnalysisEvidenceRole.CallSite
              ? 'publication'
              : 'handler_contract',
          ],
          operations: [operation],
          referenceKind: null,
          resolution: EventResolutionStatus.Unresolved,
        },
        evidence: [evidence],
      }),
      {
        type: 'diagnostic',
        analyzerName: this.name,
        analyzerVersion: this.version,
        code: 'unresolved_event_reference',
        severity: AnalysisDiagnosticSeverity.Warning,
        message: 'A dynamic event reference was preserved without resolution',
        retryable: false,
        evidence,
      },
    );
  }

  private mergeEvent(
    events: Map<string, EventCandidate>,
    reference: EventReference,
    occurrence: EventOccurrence,
    operation: string,
    evidence: AnalysisEvidence,
  ): void {
    const existing = events.get(reference.identityKey);

    if (!existing) {
      events.set(reference.identityKey, {
        ...reference,
        occurrences: new Set([occurrence]),
        operations: new Set([operation]),
        evidence: [evidence],
      });
      return;
    }

    existing.occurrences.add(occurrence);
    existing.operations.add(operation);

    if (
      !existing.evidence.some(
        (item) => JSON.stringify(item) === JSON.stringify(evidence),
      )
    ) {
      existing.evidence.push(evidence);
    }
  }

  private readTopicReference(node: ts.Node): EventReference | null {
    if (
      (!ts.isStringLiteralLike(node) &&
        !ts.isNoSubstitutionTemplateLiteral(node)) ||
      !EVENT_TOPIC_PATTERN.test(node.text)
    ) {
      return null;
    }

    return this.eventReference('topic', node.text, node.text);
  }

  private readConstructedType(node: ts.Node): EventReference | null {
    if (!ts.isNewExpression(node)) {
      return null;
    }

    return this.readTypeReference(node.expression);
  }

  private readTypeReference(node: ts.Node): EventReference | null {
    const typeName = this.readExpressionName(node);

    if (!typeName || !EVENT_TYPE_PATTERN.test(typeName)) {
      return null;
    }

    return this.eventReference(
      'type',
      typeName,
      typeName.split('.').at(-1) ?? typeName,
    );
  }

  private eventReference(
    referenceKind: EventReferenceKind,
    eventKey: string,
    name: string,
  ): EventReference {
    return {
      identityKey: this.stableIdentity('domain_event', [
        referenceKind,
        eventKey.toLocaleLowerCase('en-US'),
      ]),
      eventKey,
      name,
      referenceKind,
    };
  }

  private getDecorators(node: ts.Node): readonly ts.Decorator[] {
    return ts.canHaveDecorators(node) ? (ts.getDecorators(node) ?? []) : [];
  }

  private readDecoratorName(decorator: ts.Decorator): string | null {
    const expression = ts.isCallExpression(decorator.expression)
      ? decorator.expression.expression
      : decorator.expression;
    return this.readExpressionName(expression)?.split('.').at(-1) ?? null;
  }

  private readDeclarationName(node: ts.Node): string | null {
    if (
      (ts.isClassDeclaration(node) ||
        ts.isMethodDeclaration(node) ||
        ts.isFunctionDeclaration(node)) &&
      node.name
    ) {
      return this.readExpressionName(node.name);
    }

    return null;
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
        throw new TypeScriptEventAnalyzerError(
          'TypeScript source exceeds the configured event AST node limit',
          TypeScriptEventAnalyzerErrorCode.AstNodeLimitExceeded,
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
