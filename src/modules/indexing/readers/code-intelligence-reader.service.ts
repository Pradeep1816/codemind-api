import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, MoreThan, Not, Repository } from 'typeorm';
import { CodeDependencyEntity } from '../entities/code-dependency.entity';
import { CodeSymbolEntity } from '../entities/code-symbol.entity';
import { IndexJobEntity } from '../entities/index-job.entity';
import { IndexedFileEntity } from '../entities/indexed-file.entity';
import { IndexJobStatus } from '../enums/index-job-status.enum';
import { IndexedFileStatus } from '../enums/indexed-file-status.enum';
import {
  CodeIntelligenceDependency,
  CodeIntelligenceFile,
  CodeIntelligenceReader,
  CodeIntelligenceSnapshot,
  CodeIntelligenceSnapshotRequest,
  CodeIntelligenceSymbol,
} from '../ports/code-intelligence-reader.port';
import {
  CodeIntelligenceReadError,
  CodeIntelligenceReadErrorCode,
} from './code-intelligence-reader.errors';

const READ_BATCH_SIZE = 250;

@Injectable()
export class CodeIntelligenceReaderService implements CodeIntelligenceReader {
  constructor(
    @InjectRepository(IndexJobEntity)
    private readonly indexJobRepository: Repository<IndexJobEntity>,
    @InjectRepository(IndexedFileEntity)
    private readonly indexedFileRepository: Repository<IndexedFileEntity>,
    @InjectRepository(CodeSymbolEntity)
    private readonly codeSymbolRepository: Repository<CodeSymbolEntity>,
    @InjectRepository(CodeDependencyEntity)
    private readonly codeDependencyRepository: Repository<CodeDependencyEntity>,
  ) {}

  /**
   * Opens one successful, still-current Phase 3 snapshot. Organization and
   * repository scope are part of the lookup so foreign identifiers are not
   * disclosed across tenants.
   */
  async getSnapshot(
    request: CodeIntelligenceSnapshotRequest,
  ): Promise<CodeIntelligenceSnapshot> {
    this.assertRequest(request);

    const job = await this.indexJobRepository.findOne({
      where: {
        id: request.indexJobId,
        organizationId: request.organizationId,
        repositoryId: request.repositoryId,
      },
    });

    if (!job) {
      throw new CodeIntelligenceReadError(
        'Code intelligence snapshot was not found',
        CodeIntelligenceReadErrorCode.SnapshotNotFound,
      );
    }

    if (job.status !== IndexJobStatus.Succeeded || !job.completedAt) {
      throw new CodeIntelligenceReadError(
        'Code intelligence snapshot is not complete',
        CodeIntelligenceReadErrorCode.SnapshotNotSuccessful,
      );
    }

    const activeFileScope = {
      organizationId: job.organizationId,
      repositoryId: job.repositoryId,
      branchId: job.branchId,
      status: IndexedFileStatus.Active,
    } as const;
    const [activeFileCount, snapshotFileCount] = await Promise.all([
      this.indexedFileRepository.count({ where: activeFileScope }),
      this.indexedFileRepository.count({
        where: {
          ...activeFileScope,
          lastSeenJobId: job.id,
          lastSeenCommitSha: job.targetCommitSha,
          currentFileHashId: Not(IsNull()),
        },
      }),
    ]);

    if (
      activeFileCount !== job.totalFiles ||
      snapshotFileCount !== job.totalFiles
    ) {
      throw new CodeIntelligenceReadError(
        'Code intelligence snapshot is stale for the current branch inventory',
        CodeIntelligenceReadErrorCode.StaleSnapshot,
      );
    }

    return {
      organizationId: job.organizationId,
      repositoryId: job.repositoryId,
      branchId: job.branchId,
      indexJobId: job.id,
      targetCommitSha: job.targetCommitSha,
      totalFiles: job.totalFiles,
      completedAt: job.completedAt,
    };
  }

  /**
   * Streams plain, ORM-independent file records in stable ID order. Symbols
   * and structural dependencies are restricted to each current file hash.
   */
  async *streamFiles(
    request: CodeIntelligenceSnapshotRequest,
  ): AsyncIterable<CodeIntelligenceFile> {
    const snapshot = await this.getSnapshot(request);
    let lastFileId = 0;
    let emittedFiles = 0;

    while (true) {
      const files = await this.indexedFileRepository.find({
        where: {
          id: MoreThan(lastFileId),
          organizationId: snapshot.organizationId,
          repositoryId: snapshot.repositoryId,
          branchId: snapshot.branchId,
          lastSeenJobId: snapshot.indexJobId,
          lastSeenCommitSha: snapshot.targetCommitSha,
          currentFileHashId: Not(IsNull()),
          status: IndexedFileStatus.Active,
        },
        relations: { currentFileHash: true },
        order: { id: 'ASC' },
        take: READ_BATCH_SIZE,
      });

      if (files.length === 0) {
        break;
      }

      const fileHashIds = files.flatMap((file) =>
        file.currentFileHashId === null ? [] : [file.currentFileHashId],
      );
      const [symbols, dependencies] = await Promise.all([
        this.codeSymbolRepository.find({
          where: {
            organizationId: snapshot.organizationId,
            repositoryId: snapshot.repositoryId,
            branchId: snapshot.branchId,
            fileHashId: In(fileHashIds),
          },
          order: { fileHashId: 'ASC', startOffset: 'ASC', id: 'ASC' },
        }),
        this.codeDependencyRepository.find({
          where: {
            organizationId: snapshot.organizationId,
            repositoryId: snapshot.repositoryId,
            branchId: snapshot.branchId,
            sourceFileHashId: In(fileHashIds),
          },
          order: { sourceFileHashId: 'ASC', startOffset: 'ASC', id: 'ASC' },
        }),
      ]);
      const symbolsByHash = this.groupSymbols(symbols);
      const dependenciesByHash = this.groupDependencies(dependencies);

      for (const file of files) {
        yield this.toFile(
          file,
          symbolsByHash.get(file.currentFileHashId ?? -1) ?? [],
          dependenciesByHash.get(file.currentFileHashId ?? -1) ?? [],
        );
        emittedFiles += 1;
      }

      lastFileId = files.at(-1)?.id ?? lastFileId;
    }

    if (emittedFiles !== snapshot.totalFiles) {
      throw new CodeIntelligenceReadError(
        'Code intelligence snapshot changed while it was being read',
        CodeIntelligenceReadErrorCode.StaleSnapshot,
      );
    }
  }

  private groupSymbols(
    symbols: readonly CodeSymbolEntity[],
  ): Map<number, CodeIntelligenceSymbol[]> {
    const grouped = new Map<number, CodeIntelligenceSymbol[]>();

    for (const symbol of symbols) {
      const mapped = this.toSymbol(symbol);
      const existing = grouped.get(symbol.fileHashId);

      if (existing) {
        existing.push(mapped);
      } else {
        grouped.set(symbol.fileHashId, [mapped]);
      }
    }

    return grouped;
  }

  private groupDependencies(
    dependencies: readonly CodeDependencyEntity[],
  ): Map<number, CodeIntelligenceDependency[]> {
    const grouped = new Map<number, CodeIntelligenceDependency[]>();

    for (const dependency of dependencies) {
      const mapped = this.toDependency(dependency);
      const existing = grouped.get(dependency.sourceFileHashId);

      if (existing) {
        existing.push(mapped);
      } else {
        grouped.set(dependency.sourceFileHashId, [mapped]);
      }
    }

    return grouped;
  }

  private toFile(
    file: IndexedFileEntity,
    symbols: readonly CodeIntelligenceSymbol[],
    dependencies: readonly CodeIntelligenceDependency[],
  ): CodeIntelligenceFile {
    const hash = file.currentFileHash;

    if (
      !hash ||
      hash.id !== file.currentFileHashId ||
      hash.organizationId !== file.organizationId ||
      hash.indexedFileId !== file.id ||
      hash.sizeBytes !== file.sizeBytes ||
      !file.extension ||
      !file.language
    ) {
      throw new CodeIntelligenceReadError(
        'Code intelligence file metadata is inconsistent',
        CodeIntelligenceReadErrorCode.InconsistentSnapshot,
      );
    }

    return {
      id: file.id,
      path: file.path,
      extension: file.extension,
      language: file.language,
      sizeBytes: file.sizeBytes,
      hash: {
        id: hash.id,
        sha256: hash.value,
        gitBlobOid: hash.gitBlobOid,
        sizeBytes: hash.sizeBytes,
      },
      symbols,
      dependencies,
    };
  }

  private toSymbol(symbol: CodeSymbolEntity): CodeIntelligenceSymbol {
    return {
      id: symbol.id,
      indexedFileId: symbol.indexedFileId,
      fileHashId: symbol.fileHashId,
      name: symbol.name,
      qualifiedName: symbol.qualifiedName,
      kind: symbol.kind,
      visibility: symbol.visibility,
      exported: symbol.exported,
      defaultExport: symbol.defaultExport,
      signature: symbol.signature,
      startLine: symbol.startLine,
      startColumn: symbol.startColumn,
      startOffset: symbol.startOffset,
      endLine: symbol.endLine,
      endColumn: symbol.endColumn,
      endOffset: symbol.endOffset,
    };
  }

  private toDependency(
    dependency: CodeDependencyEntity,
  ): CodeIntelligenceDependency {
    return {
      id: dependency.id,
      sourceIndexedFileId: dependency.sourceIndexedFileId,
      sourceFileHashId: dependency.sourceFileHashId,
      sourceSymbolId: dependency.sourceSymbolId,
      kind: dependency.kind,
      moduleSpecifier: dependency.moduleSpecifier,
      targetName: dependency.targetName,
      localName: dependency.localName,
      typeOnly: dependency.typeOnly,
      targetIndexedFileId: dependency.targetIndexedFileId,
      targetFileHashId: dependency.targetFileHashId,
      targetSymbolId: dependency.targetSymbolId,
      startLine: dependency.startLine,
      startColumn: dependency.startColumn,
      startOffset: dependency.startOffset,
      endLine: dependency.endLine,
      endColumn: dependency.endColumn,
      endOffset: dependency.endOffset,
    };
  }

  private assertRequest(request: CodeIntelligenceSnapshotRequest): void {
    if (
      request.organizationId.trim().length === 0 ||
      !Number.isSafeInteger(request.repositoryId) ||
      request.repositoryId < 1 ||
      !Number.isSafeInteger(request.indexJobId) ||
      request.indexJobId < 1
    ) {
      throw new CodeIntelligenceReadError(
        'Code intelligence snapshot request is invalid',
        CodeIntelligenceReadErrorCode.InvalidRequest,
      );
    }
  }
}
