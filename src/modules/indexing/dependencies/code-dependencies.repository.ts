import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Not, Repository } from 'typeorm';
import { CodeDependencyEntity } from '../entities/code-dependency.entity';
import { CodeSymbolEntity } from '../entities/code-symbol.entity';
import { FileHashEntity } from '../entities/file-hash.entity';
import { IndexJobEntity } from '../entities/index-job.entity';
import { IndexedFileEntity } from '../entities/indexed-file.entity';
import { CodeDependencyKind } from '../enums/code-dependency-kind.enum';
import { IndexJobStatus } from '../enums/index-job-status.enum';
import { IndexedFileStatus } from '../enums/indexed-file-status.enum';
import {
  DependencyResolutionFile,
  DependencySymbolLookup,
} from './dependency-extraction.types';

const QUERY_BATCH_SIZE = 500;

export interface PersistCodeDependencyRecord {
  identityHash: string;
  kind: CodeDependencyKind;
  sourceSymbolId: number | null;
  moduleSpecifier: string | null;
  targetName: string | null;
  localName: string | null;
  typeOnly: boolean;
  targetIndexedFileId: number | null;
  targetFileHashId: number | null;
  targetSymbolId: number | null;
  startLine: number;
  startColumn: number;
  startOffset: number;
  endLine: number;
  endColumn: number;
  endOffset: number;
}

export interface PersistCodeDependenciesInput {
  organizationId: string;
  repositoryId: number;
  branchId: number;
  indexJobId: number;
  targetCommitSha: string;
  sourceIndexedFileId: number;
  sourceFileHashId: number;
  sourceGitBlobOid: string;
  sourceSizeBytes: number;
  dependencies: readonly PersistCodeDependencyRecord[];
}

export interface PersistCodeDependenciesResult {
  createdDependencies: number;
  updatedDependencies: number;
  removedDependencies: number;
  totalDependencies: number;
}

@Injectable()
export class CodeDependenciesRepository {
  constructor(
    @InjectRepository(CodeDependencyEntity)
    private readonly repository: Repository<CodeDependencyEntity>,
  ) {}

  async findResolutionFiles(
    organizationId: string,
    repositoryId: number,
    branchId: number,
    paths: readonly string[],
  ): Promise<DependencyResolutionFile[]> {
    const uniquePaths = [...new Set(paths)];
    const result: DependencyResolutionFile[] = [];
    const indexedFileRepository =
      this.repository.manager.getRepository(IndexedFileEntity);

    for (const pathBatch of this.chunk(uniquePaths, QUERY_BATCH_SIZE)) {
      const files = await indexedFileRepository.find({
        where: {
          organizationId,
          repositoryId,
          branchId,
          path: In(pathBatch),
          status: IndexedFileStatus.Active,
          currentFileHashId: Not(IsNull()),
        },
      });

      for (const file of files) {
        if (file.currentFileHashId !== null) {
          result.push({
            indexedFileId: file.id,
            fileHashId: file.currentFileHashId,
            path: file.path,
          });
        }
      }
    }

    return result;
  }

  async findSymbolsByFileHashes(
    organizationId: string,
    repositoryId: number,
    fileHashIds: readonly number[],
  ): Promise<DependencySymbolLookup[]> {
    const uniqueFileHashIds = [...new Set(fileHashIds)];
    const result: DependencySymbolLookup[] = [];
    const codeSymbolRepository =
      this.repository.manager.getRepository(CodeSymbolEntity);

    for (const fileHashBatch of this.chunk(
      uniqueFileHashIds,
      QUERY_BATCH_SIZE,
    )) {
      const symbols = await codeSymbolRepository.find({
        where: {
          organizationId,
          repositoryId,
          fileHashId: In(fileHashBatch),
        },
      });

      result.push(
        ...symbols.map((symbol) => ({
          id: symbol.id,
          indexedFileId: symbol.indexedFileId,
          fileHashId: symbol.fileHashId,
          name: symbol.name,
          qualifiedName: symbol.qualifiedName,
          kind: symbol.kind,
          exported: symbol.exported,
          defaultExport: symbol.defaultExport,
          startOffset: symbol.startOffset,
        })),
      );
    }

    return result;
  }

  /** Reconciles all normalized relationships for one immutable source file. */
  persistFileVersion(
    input: PersistCodeDependenciesInput,
  ): Promise<PersistCodeDependenciesResult | null> {
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

      const sourceFileHash = await manager
        .getRepository(FileHashEntity)
        .findOne({
          where: {
            id: input.sourceFileHashId,
            organizationId: input.organizationId,
            indexedFileId: input.sourceIndexedFileId,
            gitBlobOid: input.sourceGitBlobOid,
            sizeBytes: input.sourceSizeBytes,
            indexedFile: {
              id: input.sourceIndexedFileId,
              organizationId: input.organizationId,
              repositoryId: input.repositoryId,
              branchId: input.branchId,
              currentFileHashId: input.sourceFileHashId,
              status: IndexedFileStatus.Active,
            },
          },
        });

      if (!sourceFileHash) {
        return null;
      }

      if (!(await this.validateResolvedTargets(manager, input))) {
        return null;
      }

      const dependencyRepository = manager.getRepository(CodeDependencyEntity);
      const existingDependencies = await dependencyRepository.find({
        where: {
          organizationId: input.organizationId,
          repositoryId: input.repositoryId,
          sourceIndexedFileId: input.sourceIndexedFileId,
          sourceFileHashId: input.sourceFileHashId,
        },
      });
      const existingByIdentity = new Map(
        existingDependencies.map((dependency) => [
          dependency.identityHash,
          dependency,
        ]),
      );
      const dependenciesToSave: CodeDependencyEntity[] = [];
      let createdDependencies = 0;
      let updatedDependencies = 0;

      for (const dependencyInput of input.dependencies) {
        const existingDependency = existingByIdentity.get(
          dependencyInput.identityHash,
        );
        const dependency =
          existingDependency ??
          dependencyRepository.create({
            organizationId: input.organizationId,
            repositoryId: input.repositoryId,
            branchId: input.branchId,
            sourceIndexedFileId: input.sourceIndexedFileId,
            sourceFileHashId: input.sourceFileHashId,
          });

        dependency.observedByJobId = input.indexJobId;
        dependency.identityHash = dependencyInput.identityHash;
        dependency.kind = dependencyInput.kind;
        dependency.sourceSymbolId = dependencyInput.sourceSymbolId;
        dependency.moduleSpecifier = dependencyInput.moduleSpecifier;
        dependency.targetName = dependencyInput.targetName;
        dependency.localName = dependencyInput.localName;
        dependency.typeOnly = dependencyInput.typeOnly;
        dependency.targetIndexedFileId = dependencyInput.targetIndexedFileId;
        dependency.targetFileHashId = dependencyInput.targetFileHashId;
        dependency.targetSymbolId = dependencyInput.targetSymbolId;
        dependency.startLine = dependencyInput.startLine;
        dependency.startColumn = dependencyInput.startColumn;
        dependency.startOffset = dependencyInput.startOffset;
        dependency.endLine = dependencyInput.endLine;
        dependency.endColumn = dependencyInput.endColumn;
        dependency.endOffset = dependencyInput.endOffset;
        dependenciesToSave.push(dependency);
        existingByIdentity.delete(dependencyInput.identityHash);

        if (existingDependency) {
          updatedDependencies += 1;
        } else {
          createdDependencies += 1;
        }
      }

      if (dependenciesToSave.length > 0) {
        await dependencyRepository.save(dependenciesToSave, { chunk: 250 });
      }

      const staleDependencyIds = [...existingByIdentity.values()].map(
        (dependency) => dependency.id,
      );

      if (staleDependencyIds.length > 0) {
        await dependencyRepository.delete({ id: In(staleDependencyIds) });
      }

      return {
        createdDependencies,
        updatedDependencies,
        removedDependencies: staleDependencyIds.length,
        totalDependencies: input.dependencies.length,
      };
    });
  }

  private async validateResolvedTargets(
    manager: Repository<CodeDependencyEntity>['manager'],
    input: PersistCodeDependenciesInput,
  ): Promise<boolean> {
    const targetFileIds = [
      ...new Set(
        input.dependencies
          .map((dependency) => dependency.targetIndexedFileId)
          .filter((id): id is number => id !== null),
      ),
    ];
    const symbolIds = [
      ...new Set(
        input.dependencies.flatMap((dependency) =>
          [dependency.sourceSymbolId, dependency.targetSymbolId].filter(
            (id): id is number => id !== null,
          ),
        ),
      ),
    ];
    const targetFiles =
      targetFileIds.length === 0
        ? []
        : await manager.getRepository(IndexedFileEntity).find({
            where: {
              id: In(targetFileIds),
              organizationId: input.organizationId,
              repositoryId: input.repositoryId,
              branchId: input.branchId,
              status: IndexedFileStatus.Active,
            },
          });
    const targetFileById = new Map(targetFiles.map((file) => [file.id, file]));
    const symbols =
      symbolIds.length === 0
        ? []
        : await manager.getRepository(CodeSymbolEntity).find({
            where: {
              id: In(symbolIds),
              organizationId: input.organizationId,
              repositoryId: input.repositoryId,
            },
          });
    const symbolById = new Map(symbols.map((symbol) => [symbol.id, symbol]));

    return input.dependencies.every((dependency) => {
      if (dependency.sourceSymbolId !== null) {
        const sourceSymbol = symbolById.get(dependency.sourceSymbolId);

        if (
          !sourceSymbol ||
          sourceSymbol.indexedFileId !== input.sourceIndexedFileId ||
          sourceSymbol.fileHashId !== input.sourceFileHashId
        ) {
          return false;
        }
      }

      if (dependency.targetIndexedFileId === null) {
        return (
          dependency.targetFileHashId === null &&
          dependency.targetSymbolId === null
        );
      }

      const targetFile = targetFileById.get(dependency.targetIndexedFileId);

      if (
        !targetFile ||
        dependency.targetFileHashId === null ||
        targetFile.currentFileHashId !== dependency.targetFileHashId
      ) {
        return false;
      }

      if (dependency.targetSymbolId !== null) {
        const targetSymbol = symbolById.get(dependency.targetSymbolId);

        if (
          !targetSymbol ||
          targetSymbol.indexedFileId !== dependency.targetIndexedFileId ||
          targetSymbol.fileHashId !== dependency.targetFileHashId
        ) {
          return false;
        }
      }

      return true;
    });
  }

  private chunk<T>(values: readonly T[], size: number): T[][] {
    const batches: T[][] = [];

    for (let index = 0; index < values.length; index += size) {
      batches.push(values.slice(index, index + size));
    }

    return batches;
  }
}
