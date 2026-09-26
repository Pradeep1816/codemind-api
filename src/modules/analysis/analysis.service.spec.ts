import { Readable } from 'node:stream';
import { SourceLanguage } from '../indexing/enums/source-language.enum';
import {
  CodeIntelligenceFile,
  CodeIntelligenceReader,
} from '../indexing/ports/code-intelligence-reader.port';
import { ImmutableSourceReader } from '../indexing/ports/immutable-source-reader.port';
import {
  AnalysisExecutionError,
  AnalysisExecutionErrorCode,
} from './analysis.errors';
import { AnalysisService } from './analysis.service';
import { AnalysisDerivationType } from './enums/analysis-derivation-type.enum';
import { AnalysisEvidenceRole } from './enums/analysis-evidence-role.enum';
import { AnalysisFactKind } from './enums/analysis-fact-kind.enum';
import { CodeAnalyzer } from './interfaces/code-analyzer.interface';
import { AnalysisOutput } from './types/analysis-diagnostic.types';

describe('AnalysisService', () => {
  const request = {
    organizationId: '5abf1e5e-e03c-4890-83a5-c4e84ad48d18',
    repositoryId: 2,
    indexJobId: 4,
  };
  const snapshot = {
    ...request,
    branchId: 3,
    targetCommitSha: '8e008e725d9e411c5bff3a713b91afeaf4613f13',
    totalFiles: 1,
    completedAt: new Date('2026-08-07T13:07:59.994Z'),
  };
  const content = 'service.execute();';
  const file: CodeIntelligenceFile = {
    id: 7,
    path: 'src/fixture.ts',
    extension: 'ts',
    language: SourceLanguage.TypeScript,
    sizeBytes: Buffer.byteLength(content, 'utf8'),
    hash: {
      id: 8,
      sha256: 'c'.repeat(64),
      gitBlobOid: 'a'.repeat(40),
      sizeBytes: Buffer.byteLength(content, 'utf8'),
    },
    symbols: [],
    dependencies: [],
  };
  const fact: AnalysisOutput = {
    type: 'fact',
    kind: AnalysisFactKind.CallSite,
    identityKey: 'call_site:8:0:17',
    contentFingerprint: 'd'.repeat(64),
    analyzerName: 'test-analyzer',
    analyzerVersion: '1.0.0',
    derivationType: AnalysisDerivationType.Deterministic,
    confidence: 1,
    properties: { callee: 'service.execute' },
    evidence: [
      {
        indexedFileId: file.id,
        fileHashId: file.hash.id,
        codeSymbolId: null,
        role: AnalysisEvidenceRole.CallSite,
        range: {
          start: { line: 1, column: 1, offset: 0 },
          end: { line: 1, column: 18, offset: 17 },
        },
      },
    ],
  };

  function createService(options?: {
    outputs?: AnalysisOutput[];
    supported?: boolean;
    maxTotalSourceBytes?: number;
    maxFactsPerFile?: number;
  }) {
    const codeIntelligenceReader: CodeIntelligenceReader = {
      getSnapshot: jest.fn().mockResolvedValue(snapshot),
      streamFiles: jest.fn().mockReturnValue(Readable.from([file])),
    };
    const readSource = jest.fn().mockResolvedValue({
      indexedFileId: file.id,
      fileHashId: file.hash.id,
      path: file.path,
      gitBlobOid: file.hash.gitBlobOid,
      sizeBytes: file.sizeBytes,
      content,
    });
    const immutableSourceReader: ImmutableSourceReader = {
      read: readSource,
    };
    const analyzer: CodeAnalyzer = {
      name: 'test-analyzer',
      version: '1.0.0',
      supports: jest.fn().mockReturnValue(options?.supported ?? true),
      analyze: jest.fn().mockImplementation(function* () {
        for (const output of options?.outputs ?? [fact]) {
          yield output;
        }
      }),
    };
    const service = new AnalysisService(
      {
        maxTotalSourceBytes: options?.maxTotalSourceBytes ?? 1_000,
        maxFactsPerFile: options?.maxFactsPerFile ?? 100,
        maxDiagnosticsPerFile: 100,
      } as never,
      codeIntelligenceReader,
      immutableSourceReader,
      analyzer,
      {
        name: 'unsupported-business-analyzer',
        version: '1.0.0',
        supports: jest.fn().mockReturnValue(false),
        analyze: jest.fn().mockReturnValue([]),
      },
      {
        name: 'unsupported-state-analyzer',
        version: '1.0.0',
        supports: jest.fn().mockReturnValue(false),
        analyze: jest.fn().mockReturnValue([]),
      },
    );

    return {
      service,
      analyzer,
      codeIntelligenceReader,
      immutableSourceReader,
      readSource,
    };
  }

  async function collect(service: AnalysisService): Promise<AnalysisOutput[]> {
    const outputs: AnalysisOutput[] = [];

    for await (const output of service.analyzeSnapshot(request)) {
      outputs.push(output);
    }

    return outputs;
  }

  it('reads the exact immutable file and streams analyzer output', async () => {
    const { service, readSource } = createService();

    await expect(collect(service)).resolves.toEqual([fact]);
    expect(readSource).toHaveBeenCalledWith({
      organizationId: snapshot.organizationId,
      repositoryId: snapshot.repositoryId,
      targetCommitSha: snapshot.targetCommitSha,
      indexedFileId: file.id,
      fileHashId: file.hash.id,
      path: file.path,
      gitBlobOid: file.hash.gitBlobOid,
      expectedSizeBytes: file.hash.sizeBytes,
    });
  });

  it('does not read source when no analyzer supports the file', async () => {
    const { service, readSource } = createService({
      supported: false,
    });

    await expect(collect(service)).resolves.toEqual([]);
    expect(readSource).not.toHaveBeenCalled();
  });

  it('enforces the snapshot source-byte budget before reading content', async () => {
    const { service, readSource } = createService({
      maxTotalSourceBytes: file.sizeBytes - 1,
    });

    await expect(collect(service)).rejects.toMatchObject<
      Partial<AnalysisExecutionError>
    >({ code: AnalysisExecutionErrorCode.SourceBudgetExceeded });
    expect(readSource).not.toHaveBeenCalled();
  });

  it('rejects duplicate or excessive fact output', async () => {
    await expect(
      collect(createService({ outputs: [fact, fact] }).service),
    ).rejects.toMatchObject<Partial<AnalysisExecutionError>>({
      code: AnalysisExecutionErrorCode.AnalyzerContractViolation,
    });

    const secondFact = { ...fact, identityKey: 'call_site:8:1:17' };
    await expect(
      collect(
        createService({
          outputs: [fact, secondFact],
          maxFactsPerFile: 1,
        }).service,
      ),
    ).rejects.toMatchObject<Partial<AnalysisExecutionError>>({
      code: AnalysisExecutionErrorCode.FactLimitExceeded,
    });
  });
});
