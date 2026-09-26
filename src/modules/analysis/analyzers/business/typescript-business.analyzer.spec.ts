import { SourceLanguage } from '../../../indexing/enums/source-language.enum';
import { AnalysisFactFactory } from '../../analysis-fact.factory';
import { AnalysisFactKind } from '../../enums/analysis-fact-kind.enum';
import { BusinessRuleType } from '../../enums/business-rule-type.enum';
import type { AnalysisFileContext } from '../../types/analysis-context.types';
import type { AnalysisOutput } from '../../types/analysis-diagnostic.types';
import {
  TypeScriptBusinessAnalyzerError,
  TypeScriptBusinessAnalyzerErrorCode,
} from './typescript-business-analyzer.errors';
import { TypeScriptBusinessAnalyzer } from './typescript-business.analyzer';

describe('TypeScriptBusinessAnalyzer', () => {
  const snapshot = {
    organizationId: '5abf1e5e-e03c-4890-83a5-c4e84ad48d18',
    repositoryId: 2,
    branchId: 3,
    indexJobId: 4,
    targetCommitSha: '8e008e725d9e411c5bff3a713b91afeaf4613f13',
    totalFiles: 1,
    completedAt: new Date('2026-08-07T13:07:59.994Z'),
  };

  function createAnalyzer(maxAstNodesPerFile = 10_000) {
    return new TypeScriptBusinessAnalyzer(
      new AnalysisFactFactory({ maxPropertyBytes: 16_384 } as never),
      { maxAstNodesPerFile } as never,
    );
  }

  function createContext(content: string): AnalysisFileContext {
    const sizeBytes = Buffer.byteLength(content, 'utf8');
    const classStart = content.indexOf('export class DoctorScheduleService');
    const methodStart = content.indexOf('bookAppointment');

    return {
      snapshot,
      file: {
        id: 7,
        path: 'src/appointments/doctor-schedule.service.ts',
        extension: 'ts',
        language: SourceLanguage.TypeScript,
        sizeBytes,
        hash: {
          id: 8,
          sha256: 'c'.repeat(64),
          gitBlobOid: 'a'.repeat(40),
          sizeBytes,
        },
        symbols: [
          {
            id: 10,
            indexedFileId: 7,
            fileHashId: 8,
            name: 'DoctorScheduleService',
            qualifiedName: 'DoctorScheduleService',
            kind: 'class' as never,
            visibility: null,
            exported: true,
            defaultExport: false,
            signature: null,
            startLine: 8,
            startColumn: 1,
            startOffset: classStart,
            endLine: 26,
            endColumn: 2,
            endOffset: content.length,
          },
          {
            id: 11,
            indexedFileId: 7,
            fileHashId: 8,
            name: 'bookAppointment',
            qualifiedName: 'DoctorScheduleService.bookAppointment',
            kind: 'method' as never,
            visibility: null,
            exported: false,
            defaultExport: false,
            signature: null,
            startLine: 9,
            startColumn: 3,
            startOffset: methodStart,
            endLine: 25,
            endColumn: 4,
            endOffset: content.length - 2,
          },
        ],
        dependencies: [],
      },
      source: {
        indexedFileId: 7,
        fileHashId: 8,
        path: 'src/appointments/doctor-schedule.service.ts',
        gitBlobOid: 'a'.repeat(40),
        sizeBytes,
        content,
      },
    };
  }

  function collect(
    analyzer: TypeScriptBusinessAnalyzer,
    context: AnalysisFileContext,
  ): AnalysisOutput[] {
    return [...analyzer.analyze(context)];
  }

  function captureAnalyzerError(
    action: () => void,
  ): TypeScriptBusinessAnalyzerError {
    try {
      action();
    } catch (error: unknown) {
      if (error instanceof TypeScriptBusinessAnalyzerError) {
        return error;
      }

      throw error;
    }

    throw new Error('Expected TypeScriptBusinessAnalyzerError');
  }

  it('extracts evidence-backed concepts and supported business-rule categories', () => {
    const content = `
@Entity()
export class Appointment {}

export enum AppointmentStatus {
  Pending = 'pending',
  Cancelled = 'cancelled',
}

export class DoctorScheduleService {
  bookAppointment(user, appointment, slot, total) {
    if (!user.permissions.includes('appointment.schedule')) {
      throw new ForbiddenException();
    }

    if (appointment.status === AppointmentStatus.Cancelled) {
      throw new ConflictException();
    }

    if (!slot.available) {
      throw new SlotUnavailableException();
    }

    const roundedTotal = Math.round(total * 100);
    return roundedTotal;
  }
}
`;
    const outputs = collect(createAnalyzer(), createContext(content));
    const facts = outputs.filter((output) => output.type === 'fact');
    const concepts = facts.filter(
      (fact) => fact.kind === AnalysisFactKind.DomainConcept,
    );
    const rules = facts.filter(
      (fact) => fact.kind === AnalysisFactKind.BusinessRule,
    );

    expect(concepts.map((fact) => fact.properties.name)).toEqual(
      expect.arrayContaining([
        'Appointment',
        'Appointment Status',
        'Doctor Schedule',
      ]),
    );
    expect(rules.map((fact) => fact.properties.ruleType)).toEqual(
      expect.arrayContaining([
        BusinessRuleType.Permission,
        BusinessRuleType.StateConstraint,
        BusinessRuleType.Scheduling,
        BusinessRuleType.Calculation,
      ]),
    );
    expect(rules.every((fact) => fact.evidence.length > 0)).toBe(true);
    expect(
      rules.every((fact) => fact.properties.containingSymbolId === 11),
    ).toBe(true);
    expect(JSON.stringify(rules)).not.toContain('appointment.schedule');
    expect(
      facts.every((fact) => /^[0-9a-f]{64}$/u.test(fact.contentFingerprint)),
    ).toBe(true);
  });

  it('does not classify an unguarded generic branch as a business rule', () => {
    const content = `
export class ExampleService {
  execute(flag) {
    if (flag) {
      this.logger.log('branch');
    }
  }
}
`;
    const outputs = collect(createAnalyzer(), createContext(content));

    expect(
      outputs.filter(
        (output) =>
          output.type === 'fact' &&
          output.kind === AnalysisFactKind.BusinessRule,
      ),
    ).toEqual([]);
  });

  it('stops when source exceeds the configured AST limit', () => {
    const error = captureAnalyzerError(() =>
      collect(
        createAnalyzer(5),
        createContext('export class Appointment { book() { return true; } }'),
      ),
    );

    expect(error.code).toBe(
      TypeScriptBusinessAnalyzerErrorCode.AstNodeLimitExceeded,
    );
  });
});
