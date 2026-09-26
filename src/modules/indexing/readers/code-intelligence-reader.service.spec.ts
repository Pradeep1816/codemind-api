import { Repository } from 'typeorm';
import { CodeDependencyEntity } from '../entities/code-dependency.entity';
import { CodeSymbolEntity } from '../entities/code-symbol.entity';
import { FileHashEntity } from '../entities/file-hash.entity';
import { IndexJobEntity } from '../entities/index-job.entity';
import { IndexedFileEntity } from '../entities/indexed-file.entity';
import { CodeDependencyKind } from '../enums/code-dependency-kind.enum';
import { CodeSymbolKind } from '../enums/code-symbol-kind.enum';
import { FileHashAlgorithm } from '../enums/file-hash-algorithm.enum';
import { IndexJobPhase } from '../enums/index-job-phase.enum';
import { IndexJobStatus } from '../enums/index-job-status.enum';
import { IndexedFileStatus } from '../enums/indexed-file-status.enum';
import { SourceLanguage } from '../enums/source-language.enum';
import { CodeIntelligenceFile } from '../ports/code-intelligence-reader.port';
import {
  CodeIntelligenceReadError,
  CodeIntelligenceReadErrorCode,
} from './code-intelligence-reader.errors';
import { CodeIntelligenceReaderService } from './code-intelligence-reader.service';

describe('CodeIntelligenceReaderService', () => {
  const request = {
    organizationId: '5abf1e5e-e03c-4890-83a5-c4e84ad48d18',
    repositoryId: 2,
    indexJobId: 4,
  };
  const completedAt = new Date('2026-08-07T13:07:59.994Z');

  function createJob(
    status: IndexJobStatus = IndexJobStatus.Succeeded,
  ): IndexJobEntity {
    return {
      id: request.indexJobId,
      organizationId: request.organizationId,
      repositoryId: request.repositoryId,
      branchId: 3,
      status,
      phase: IndexJobPhase.Finished,
      targetCommitSha: '8e008e725d9e411c5bff3a713b91afeaf4613f13',
      totalFiles: 1,
      completedAt: status === IndexJobStatus.Succeeded ? completedAt : null,
    } as IndexJobEntity;
  }

  function createFile(): IndexedFileEntity {
    const hash = {
      id: 8,
      organizationId: request.organizationId,
      indexedFileId: 7,
      algorithm: FileHashAlgorithm.Sha256,
      value: 'c'.repeat(64),
      gitBlobOid: 'a'.repeat(40),
      sizeBytes: 100,
    } as FileHashEntity;

    return {
      id: 7,
      organizationId: request.organizationId,
      repositoryId: request.repositoryId,
      branchId: 3,
      lastSeenJobId: request.indexJobId,
      currentFileHashId: hash.id,
      path: 'src/doctor.service.ts',
      extension: 'ts',
      language: SourceLanguage.TypeScript,
      sizeBytes: 100,
      status: IndexedFileStatus.Active,
      lastSeenCommitSha: createJob().targetCommitSha,
      currentFileHash: hash,
    } as IndexedFileEntity;
  }

  function createService(options?: {
    job?: IndexJobEntity | null;
    counts?: number[];
    files?: IndexedFileEntity[][];
    symbols?: CodeSymbolEntity[];
    dependencies?: CodeDependencyEntity[];
  }) {
    const indexJobRepository = {
      findOne: jest.fn().mockResolvedValue(options?.job ?? createJob()),
    };
    const count = jest.fn();

    for (const value of options?.counts ?? [1, 1]) {
      count.mockResolvedValueOnce(value);
    }

    const findFiles = jest.fn();
    for (const value of options?.files ?? [[]]) {
      findFiles.mockResolvedValueOnce(value);
    }

    const indexedFileRepository = { count, find: findFiles };
    const codeSymbolRepository = {
      find: jest.fn().mockResolvedValue(options?.symbols ?? []),
    };
    const codeDependencyRepository = {
      find: jest.fn().mockResolvedValue(options?.dependencies ?? []),
    };
    const service = new CodeIntelligenceReaderService(
      indexJobRepository as unknown as Repository<IndexJobEntity>,
      indexedFileRepository as unknown as Repository<IndexedFileEntity>,
      codeSymbolRepository as unknown as Repository<CodeSymbolEntity>,
      codeDependencyRepository as unknown as Repository<CodeDependencyEntity>,
    );

    return {
      service,
      indexJobRepository,
      indexedFileRepository,
      codeSymbolRepository,
      codeDependencyRepository,
    };
  }

  it('opens a successful tenant-scoped Phase 3 snapshot', async () => {
    const { service, indexJobRepository } = createService();

    await expect(service.getSnapshot(request)).resolves.toEqual({
      organizationId: request.organizationId,
      repositoryId: request.repositoryId,
      branchId: 3,
      indexJobId: request.indexJobId,
      targetCommitSha: createJob().targetCommitSha,
      totalFiles: 1,
      completedAt,
    });
    expect(indexJobRepository.findOne).toHaveBeenCalledWith({
      where: {
        id: request.indexJobId,
        organizationId: request.organizationId,
        repositoryId: request.repositoryId,
      },
    });
  });

  it('rejects incomplete and stale snapshots', async () => {
    await expect(
      createService({
        job: createJob(IndexJobStatus.Running),
      }).service.getSnapshot(request),
    ).rejects.toMatchObject<Partial<CodeIntelligenceReadError>>({
      code: CodeIntelligenceReadErrorCode.SnapshotNotSuccessful,
    });

    await expect(
      createService({ counts: [1, 0] }).service.getSnapshot(request),
    ).rejects.toMatchObject<Partial<CodeIntelligenceReadError>>({
      code: CodeIntelligenceReadErrorCode.StaleSnapshot,
    });
  });

  it('streams plain current-hash files with symbols and dependencies', async () => {
    const file = createFile();
    const symbol = {
      id: 9,
      indexedFileId: file.id,
      fileHashId: file.currentFileHashId,
      name: 'DoctorService',
      qualifiedName: 'DoctorService',
      kind: CodeSymbolKind.Class,
      visibility: null,
      exported: true,
      defaultExport: false,
      signature: 'export class DoctorService',
      startLine: 1,
      startColumn: 1,
      startOffset: 0,
      endLine: 3,
      endColumn: 2,
      endOffset: 99,
    } as CodeSymbolEntity;
    const dependency = {
      id: 10,
      sourceIndexedFileId: file.id,
      sourceFileHashId: file.currentFileHashId,
      sourceSymbolId: symbol.id,
      kind: CodeDependencyKind.Import,
      moduleSpecifier: './doctor.repository',
      targetName: 'DoctorRepository',
      localName: 'DoctorRepository',
      typeOnly: false,
      targetIndexedFileId: 11,
      targetFileHashId: 12,
      targetSymbolId: 13,
      startLine: 1,
      startColumn: 1,
      startOffset: 0,
      endLine: 1,
      endColumn: 40,
      endOffset: 39,
    } as CodeDependencyEntity;
    const { service } = createService({
      files: [[file], []],
      symbols: [symbol],
      dependencies: [dependency],
    });
    const results: CodeIntelligenceFile[] = [];

    for await (const result of service.streamFiles(request)) {
      results.push(result);
    }

    expect(results).toHaveLength(1);
    expect(results[0]?.id).toBe(file.id);
    expect(results[0]?.path).toBe(file.path);
    expect(results[0]?.hash.id).toBe(file.currentFileHashId);
    expect(results[0]?.symbols[0]?.name).toBe('DoctorService');
    expect(results[0]?.dependencies[0]?.kind).toBe(CodeDependencyKind.Import);
    expect(results[0]?.dependencies[0]?.targetSymbolId).toBe(13);
  });

  it('rejects invalid request identities without querying the database', async () => {
    const { service, indexJobRepository } = createService();

    await expect(
      service.getSnapshot({ ...request, indexJobId: 0 }),
    ).rejects.toMatchObject<Partial<CodeIntelligenceReadError>>({
      code: CodeIntelligenceReadErrorCode.InvalidRequest,
    });
    expect(indexJobRepository.findOne).not.toHaveBeenCalled();
  });
});
