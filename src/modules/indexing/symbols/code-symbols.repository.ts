import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { CodeSymbolEntity } from '../entities/code-symbol.entity';
import { FileHashEntity } from '../entities/file-hash.entity';
import { IndexJobEntity } from '../entities/index-job.entity';
import { CodeSymbolKind } from '../enums/code-symbol-kind.enum';
import { CodeSymbolVisibility } from '../enums/code-symbol-visibility.enum';
import { IndexJobStatus } from '../enums/index-job-status.enum';
import { IndexedFileStatus } from '../enums/indexed-file-status.enum';

export interface PersistCodeSymbolRecord {
  name: string;
  qualifiedName: string;
  kind: CodeSymbolKind;
  visibility: CodeSymbolVisibility | null;
  exported: boolean;
  defaultExport: boolean;
  signature: string | null;
  documentation: string | null;
  startLine: number;
  startColumn: number;
  startOffset: number;
  endLine: number;
  endColumn: number;
  endOffset: number;
}

export interface PersistCodeSymbolsInput {
  organizationId: string;
  repositoryId: number;
  branchId: number;
  indexJobId: number;
  targetCommitSha: string;
  indexedFileId: number;
  fileHashId: number;
  gitBlobOid: string;
  expectedSizeBytes: number;
  symbols: readonly PersistCodeSymbolRecord[];
}

export interface PersistCodeSymbolsResult {
  createdSymbols: number;
  updatedSymbols: number;
  removedSymbols: number;
  totalSymbols: number;
}

@Injectable()
export class CodeSymbolsRepository {
  constructor(
    @InjectRepository(CodeSymbolEntity)
    private readonly repository: Repository<CodeSymbolEntity>,
  ) {}

  /**
   * Atomically reconciles one immutable file version while preserving IDs for
   * symbols that retain the same normalized identity across safe retries.
   */
  persistFileVersion(
    input: PersistCodeSymbolsInput,
  ): Promise<PersistCodeSymbolsResult | null> {
    return this.repository.manager.transaction(async (manager) => {
      const job = await manager.getRepository(IndexJobEntity).findOne({
        where: {
          id: input.indexJobId,
          organizationId: input.organizationId,
          repositoryId: input.repositoryId,
          branchId: input.branchId,
          targetCommitSha: input.targetCommitSha,
          status: IndexJobStatus.Running,
        },
        lock: { mode: 'pessimistic_write' },
      });

      if (!job) {
        return null;
      }

      const fileHash = await manager.getRepository(FileHashEntity).findOne({
        where: {
          id: input.fileHashId,
          organizationId: input.organizationId,
          indexedFileId: input.indexedFileId,
          gitBlobOid: input.gitBlobOid,
          sizeBytes: input.expectedSizeBytes,
          indexedFile: {
            id: input.indexedFileId,
            organizationId: input.organizationId,
            repositoryId: input.repositoryId,
            branchId: input.branchId,
            currentFileHashId: input.fileHashId,
            status: IndexedFileStatus.Active,
          },
        },
      });

      if (!fileHash) {
        return null;
      }

      const codeSymbolRepository = manager.getRepository(CodeSymbolEntity);
      const existingSymbols = await codeSymbolRepository.find({
        where: {
          organizationId: input.organizationId,
          repositoryId: input.repositoryId,
          indexedFileId: input.indexedFileId,
          fileHashId: input.fileHashId,
        },
      });
      const existingByIdentity = new Map(
        existingSymbols.map((symbol) => [this.createIdentity(symbol), symbol]),
      );
      const symbolsToSave: CodeSymbolEntity[] = [];
      let createdSymbols = 0;
      let updatedSymbols = 0;

      for (const symbolInput of input.symbols) {
        const identity = this.createIdentity(symbolInput);
        const existingSymbol = existingByIdentity.get(identity);
        const symbol =
          existingSymbol ??
          codeSymbolRepository.create({
            organizationId: input.organizationId,
            repositoryId: input.repositoryId,
            branchId: input.branchId,
            indexedFileId: input.indexedFileId,
            fileHashId: input.fileHashId,
          });

        symbol.observedByJobId = input.indexJobId;
        symbol.name = symbolInput.name;
        symbol.qualifiedName = symbolInput.qualifiedName;
        symbol.kind = symbolInput.kind;
        symbol.visibility = symbolInput.visibility;
        symbol.exported = symbolInput.exported;
        symbol.defaultExport = symbolInput.defaultExport;
        symbol.signature = symbolInput.signature;
        symbol.documentation = symbolInput.documentation;
        symbol.startLine = symbolInput.startLine;
        symbol.startColumn = symbolInput.startColumn;
        symbol.startOffset = symbolInput.startOffset;
        symbol.endLine = symbolInput.endLine;
        symbol.endColumn = symbolInput.endColumn;
        symbol.endOffset = symbolInput.endOffset;
        symbolsToSave.push(symbol);
        existingByIdentity.delete(identity);

        if (existingSymbol) {
          updatedSymbols += 1;
        } else {
          createdSymbols += 1;
        }
      }

      if (symbolsToSave.length > 0) {
        await codeSymbolRepository.save(symbolsToSave, { chunk: 250 });
      }

      const staleSymbolIds = [...existingByIdentity.values()].map(
        (symbol) => symbol.id,
      );

      if (staleSymbolIds.length > 0) {
        await codeSymbolRepository.delete({ id: In(staleSymbolIds) });
      }

      return {
        createdSymbols,
        updatedSymbols,
        removedSymbols: staleSymbolIds.length,
        totalSymbols: input.symbols.length,
      };
    });
  }

  private createIdentity(
    symbol: Pick<
      PersistCodeSymbolRecord,
      'kind' | 'qualifiedName' | 'startOffset'
    >,
  ): string {
    return JSON.stringify([
      symbol.kind,
      symbol.qualifiedName,
      symbol.startOffset,
    ]);
  }
}
