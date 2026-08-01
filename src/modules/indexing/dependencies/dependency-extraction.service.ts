import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import indexingConfig from '../../../config/indexing.config';
import { ParsedExportKind } from '../../parser/enums/parsed-export-kind.enum';
import { ParsedRelationshipKind } from '../../parser/enums/parsed-relationship-kind.enum';
import {
  ParsedImport,
  ParsedRelationship,
  ParseSourceResult,
  SourceRange,
} from '../../parser/types/parser.types';
import { CodeDependencyKind } from '../enums/code-dependency-kind.enum';
import { SourceParsingService } from '../parsing/source-parsing.service';
import { SymbolExtractionService } from '../symbols/symbol-extraction.service';
import {
  CodeDependenciesRepository,
  PersistCodeDependencyRecord,
} from './code-dependencies.repository';
import {
  DependencyExtractionError,
  DependencyExtractionErrorCode,
} from './dependency-extraction.errors';
import {
  DependencyExtractionResult,
  DependencyResolutionFile,
  DependencySymbolLookup,
  ExtractAndPersistDependenciesInput,
  NormalizedDependency,
} from './dependency-extraction.types';
import { RelativeModuleResolverService } from './relative-module-resolver.service';

interface ImportBinding {
  moduleSpecifier: string;
  importedName: string;
  namespace: boolean;
}

const MAX_MODULE_SPECIFIER_LENGTH = 1_024;
const MAX_TARGET_NAME_LENGTH = 512;
const MAX_LOCAL_NAME_LENGTH = 255;

@Injectable()
export class DependencyExtractionService {
  constructor(
    @Inject(indexingConfig.KEY)
    private readonly configuration: ConfigType<typeof indexingConfig>,
    private readonly sourceParsingService: SourceParsingService,
    private readonly symbolExtractionService: SymbolExtractionService,
    private readonly codeDependenciesRepository: CodeDependenciesRepository,
    private readonly relativeModuleResolver: RelativeModuleResolverService,
  ) {}

  /**
   * Runs one parser pass, persists symbols first, resolves reliable local-file
   * targets, and reconciles the complete dependency set for that file hash.
   */
  async extractAndPersist(
    input: ExtractAndPersistDependenciesInput,
  ): Promise<DependencyExtractionResult> {
    const parsed = await this.sourceParsingService.parseFile(input);
    this.assertParserIdentity(input, parsed);
    const symbolResult = await this.symbolExtractionService.persistParsed(
      input,
      parsed,
    );
    const normalized = this.normalizeDependencies(parsed);

    if (normalized.length > this.configuration.maxDependenciesPerFile) {
      throw new DependencyExtractionError(
        'Source file exceeds the configured dependency limit',
        DependencyExtractionErrorCode.TooManyDependencies,
      );
    }

    normalized.forEach((dependency) => this.assertDependency(dependency));
    const persistedDependencies = await this.resolveDependencies(
      input,
      normalized,
    );
    this.assertUniqueIdentities(persistedDependencies);
    const persistence =
      await this.codeDependenciesRepository.persistFileVersion({
        organizationId: input.organizationId,
        repositoryId: input.repositoryId,
        branchId: input.branchId,
        indexJobId: input.indexJobId,
        targetCommitSha: input.targetCommitSha,
        sourceIndexedFileId: input.indexedFileId,
        sourceFileHashId: input.fileHashId,
        sourceGitBlobOid: input.gitBlobOid,
        sourceSizeBytes: input.expectedSizeBytes,
        dependencies: persistedDependencies,
      });

    if (!persistence) {
      throw new DependencyExtractionError(
        'Indexing job no longer owns dependency persistence for this file version',
        DependencyExtractionErrorCode.PersistenceOwnershipLost,
      );
    }

    const symbolResolvedDependencies = persistedDependencies.filter(
      (dependency) => dependency.targetSymbolId !== null,
    ).length;
    const fileResolvedDependencies = persistedDependencies.filter(
      (dependency) => dependency.targetIndexedFileId !== null,
    ).length;

    return {
      indexJobId: input.indexJobId,
      indexedFileId: input.indexedFileId,
      fileHashId: input.fileHashId,
      parsedDependencies: persistedDependencies.length,
      createdDependencies: persistence.createdDependencies,
      updatedDependencies: persistence.updatedDependencies,
      removedDependencies: persistence.removedDependencies,
      fileResolvedDependencies,
      symbolResolvedDependencies,
      unresolvedDependencies:
        persistedDependencies.length - fileResolvedDependencies,
      parsedSymbols: symbolResult.parsedSymbols,
      diagnostics: parsed.diagnostics.length,
      hasSyntaxErrors: parsed.hasSyntaxErrors,
    };
  }

  private normalizeDependencies(
    parsed: ParseSourceResult,
  ): NormalizedDependency[] {
    return [
      ...parsed.imports.flatMap((sourceImport) =>
        this.normalizeImport(sourceImport),
      ),
      ...parsed.exports.map((sourceExport) => ({
        kind: CodeDependencyKind.Export,
        sourceSymbol: null,
        moduleSpecifier: sourceExport.moduleSpecifier,
        targetName: this.readExportTargetName(
          sourceExport.kind,
          sourceExport.localName,
          sourceExport.exportedName,
        ),
        localName: sourceExport.exportedName,
        typeOnly: sourceExport.typeOnly,
        ...this.flattenRange(sourceExport.range),
      })),
      ...this.normalizeRelationships(parsed.imports, parsed.relationships),
    ];
  }

  private normalizeImport(sourceImport: ParsedImport): NormalizedDependency[] {
    const dependencies: NormalizedDependency[] = [];
    const base = {
      kind: CodeDependencyKind.Import,
      sourceSymbol: null,
      moduleSpecifier: sourceImport.moduleSpecifier,
    } as const;

    if (sourceImport.defaultImport) {
      dependencies.push({
        ...base,
        targetName: 'default',
        localName: sourceImport.defaultImport,
        typeOnly: sourceImport.typeOnly,
        ...this.flattenRange(sourceImport.range),
      });
    }

    if (sourceImport.namespaceImport) {
      dependencies.push({
        ...base,
        targetName: '*',
        localName: sourceImport.namespaceImport,
        typeOnly: sourceImport.typeOnly,
        ...this.flattenRange(sourceImport.range),
      });
    }

    for (const namedImport of sourceImport.namedImports) {
      dependencies.push({
        ...base,
        targetName: namedImport.importedName,
        localName: namedImport.localName,
        typeOnly: namedImport.typeOnly,
        ...this.flattenRange(namedImport.range),
      });
    }

    if (dependencies.length === 0) {
      dependencies.push({
        ...base,
        targetName: null,
        localName: null,
        typeOnly: sourceImport.typeOnly,
        ...this.flattenRange(sourceImport.range),
      });
    }

    return dependencies;
  }

  private normalizeRelationships(
    imports: readonly ParsedImport[],
    relationships: readonly ParsedRelationship[],
  ): NormalizedDependency[] {
    const bindings = this.createImportBindings(imports);

    return relationships.map((relationship) => {
      const resolution = this.resolveRelationshipBinding(
        relationship.targetName,
        bindings,
      );

      return {
        kind:
          relationship.kind === ParsedRelationshipKind.Extends
            ? CodeDependencyKind.Extends
            : CodeDependencyKind.Implements,
        sourceSymbol: relationship.sourceSymbol,
        moduleSpecifier: resolution?.moduleSpecifier ?? null,
        targetName: resolution?.targetName ?? relationship.targetName,
        localName: relationship.targetName,
        typeOnly: false,
        ...this.flattenRange(relationship.range),
      };
    });
  }

  private createImportBindings(
    imports: readonly ParsedImport[],
  ): ReadonlyMap<string, ImportBinding> {
    const bindings = new Map<string, ImportBinding>();

    for (const sourceImport of imports) {
      if (sourceImport.defaultImport) {
        bindings.set(sourceImport.defaultImport, {
          moduleSpecifier: sourceImport.moduleSpecifier,
          importedName: 'default',
          namespace: false,
        });
      }

      if (sourceImport.namespaceImport) {
        bindings.set(sourceImport.namespaceImport, {
          moduleSpecifier: sourceImport.moduleSpecifier,
          importedName: '*',
          namespace: true,
        });
      }

      for (const namedImport of sourceImport.namedImports) {
        bindings.set(namedImport.localName, {
          moduleSpecifier: sourceImport.moduleSpecifier,
          importedName: namedImport.importedName,
          namespace: false,
        });
      }
    }

    return bindings;
  }

  private resolveRelationshipBinding(
    targetName: string,
    bindings: ReadonlyMap<string, ImportBinding>,
  ): { moduleSpecifier: string; targetName: string } | null {
    const [rootName, ...memberPath] = targetName.split('.');
    const binding = rootName ? bindings.get(rootName) : undefined;

    if (!binding) {
      return null;
    }

    return {
      moduleSpecifier: binding.moduleSpecifier,
      targetName:
        binding.namespace && memberPath.length > 0
          ? memberPath.join('.')
          : binding.importedName,
    };
  }

  private readExportTargetName(
    kind: ParsedExportKind,
    localName: string | null,
    exportedName: string | null,
  ): string | null {
    if (kind === ParsedExportKind.All || kind === ParsedExportKind.Namespace) {
      return '*';
    }

    return localName ?? exportedName;
  }

  private async resolveDependencies(
    input: ExtractAndPersistDependenciesInput,
    normalized: readonly NormalizedDependency[],
  ): Promise<PersistCodeDependencyRecord[]> {
    const candidatePathsByModule = new Map<string, readonly string[]>();

    for (const dependency of normalized) {
      if (
        dependency.moduleSpecifier &&
        !candidatePathsByModule.has(dependency.moduleSpecifier)
      ) {
        candidatePathsByModule.set(
          dependency.moduleSpecifier,
          this.relativeModuleResolver.createCandidatePaths(
            input.path,
            dependency.moduleSpecifier,
          ),
        );
      }
    }

    const resolutionFiles =
      await this.codeDependenciesRepository.findResolutionFiles(
        input.organizationId,
        input.repositoryId,
        input.branchId,
        [...candidatePathsByModule.values()].flat(),
      );
    const resolutionFileByPath = new Map(
      resolutionFiles.map((file) => [file.path, file]),
    );
    const fileByModule = new Map<string, DependencyResolutionFile>();

    for (const [moduleSpecifier, candidates] of candidatePathsByModule) {
      const resolvedFile = candidates
        .map((candidate) => resolutionFileByPath.get(candidate))
        .find((file): file is DependencyResolutionFile => file !== undefined);

      if (resolvedFile) {
        fileByModule.set(moduleSpecifier, resolvedFile);
      }
    }

    const sourceFile: DependencyResolutionFile = {
      indexedFileId: input.indexedFileId,
      fileHashId: input.fileHashId,
      path: input.path,
    };
    const symbolFileHashIds = [
      input.fileHashId,
      ...resolutionFiles.map((file) => file.fileHashId),
    ];
    const symbols =
      await this.codeDependenciesRepository.findSymbolsByFileHashes(
        input.organizationId,
        input.repositoryId,
        symbolFileHashIds,
      );
    const symbolsByFileHash = this.groupSymbolsByFileHash(symbols);

    return normalized.map((dependency) => {
      const sourceSymbol = dependency.sourceSymbol
        ? this.findSourceSymbol(
            symbolsByFileHash.get(input.fileHashId) ?? [],
            dependency.sourceSymbol,
          )
        : null;
      let targetFile = dependency.moduleSpecifier
        ? (fileByModule.get(dependency.moduleSpecifier) ?? null)
        : dependency.kind === CodeDependencyKind.Export
          ? sourceFile
          : null;
      let targetSymbol = targetFile
        ? this.findTargetSymbol(
            symbolsByFileHash.get(targetFile.fileHashId) ?? [],
            dependency.targetName,
          )
        : null;

      if (
        !dependency.moduleSpecifier &&
        (dependency.kind === CodeDependencyKind.Extends ||
          dependency.kind === CodeDependencyKind.Implements)
      ) {
        targetSymbol = this.findTargetSymbol(
          symbolsByFileHash.get(input.fileHashId) ?? [],
          dependency.targetName,
        );
        targetFile = targetSymbol ? sourceFile : null;
      }

      return {
        identityHash: this.createIdentityHash(dependency),
        kind: dependency.kind,
        sourceSymbolId: sourceSymbol?.id ?? null,
        moduleSpecifier: dependency.moduleSpecifier,
        targetName: dependency.targetName,
        localName: dependency.localName,
        typeOnly: dependency.typeOnly,
        targetIndexedFileId: targetFile?.indexedFileId ?? null,
        targetFileHashId: targetFile?.fileHashId ?? null,
        targetSymbolId: targetSymbol?.id ?? null,
        startLine: dependency.startLine,
        startColumn: dependency.startColumn,
        startOffset: dependency.startOffset,
        endLine: dependency.endLine,
        endColumn: dependency.endColumn,
        endOffset: dependency.endOffset,
      };
    });
  }

  private groupSymbolsByFileHash(
    symbols: readonly DependencySymbolLookup[],
  ): ReadonlyMap<number, DependencySymbolLookup[]> {
    const grouped = new Map<number, DependencySymbolLookup[]>();

    for (const symbol of symbols) {
      const existing = grouped.get(symbol.fileHashId) ?? [];
      existing.push(symbol);
      grouped.set(symbol.fileHashId, existing);
    }

    return grouped;
  }

  private findSourceSymbol(
    symbols: readonly DependencySymbolLookup[],
    reference: NonNullable<NormalizedDependency['sourceSymbol']>,
  ): DependencySymbolLookup | null {
    return (
      symbols.find(
        (symbol) =>
          symbol.kind === reference.kind &&
          symbol.qualifiedName === reference.qualifiedName &&
          symbol.startOffset === reference.startOffset,
      ) ?? null
    );
  }

  private findTargetSymbol(
    symbols: readonly DependencySymbolLookup[],
    targetName: string | null,
  ): DependencySymbolLookup | null {
    if (!targetName || targetName === '*') {
      return null;
    }

    if (targetName === 'default') {
      const defaultExports = symbols.filter((symbol) => symbol.defaultExport);
      return defaultExports.length === 1 ? defaultExports[0] : null;
    }

    const simpleName = targetName.split('.').at(-1) ?? targetName;
    const candidates = symbols.filter((symbol) => symbol.name === simpleName);
    const exactQualifiedNames = candidates.filter(
      (symbol) => symbol.qualifiedName === targetName,
    );

    if (exactQualifiedNames.length === 1) {
      return exactQualifiedNames[0];
    }

    const exportedCandidates = candidates.filter((symbol) => symbol.exported);

    if (exportedCandidates.length === 1) {
      return exportedCandidates[0];
    }

    return candidates.length === 1 ? candidates[0] : null;
  }

  private assertParserIdentity(
    input: ExtractAndPersistDependenciesInput,
    parsed: ParseSourceResult,
  ): void {
    if (
      parsed.indexedFileId !== input.indexedFileId ||
      parsed.fileHashId !== input.fileHashId ||
      parsed.path !== input.path
    ) {
      throw new DependencyExtractionError(
        'Parser result does not match the requested dependency source',
        DependencyExtractionErrorCode.ParserIdentityMismatch,
      );
    }
  }

  private assertDependency(dependency: NormalizedDependency): void {
    const validPosition =
      Number.isSafeInteger(dependency.startLine) &&
      dependency.startLine >= 1 &&
      Number.isSafeInteger(dependency.startColumn) &&
      dependency.startColumn >= 1 &&
      Number.isSafeInteger(dependency.startOffset) &&
      dependency.startOffset >= 0 &&
      Number.isSafeInteger(dependency.endLine) &&
      dependency.endLine >= dependency.startLine &&
      Number.isSafeInteger(dependency.endColumn) &&
      dependency.endColumn >= 1 &&
      (dependency.endLine > dependency.startLine ||
        dependency.endColumn >= dependency.startColumn) &&
      Number.isSafeInteger(dependency.endOffset) &&
      dependency.endOffset >= dependency.startOffset;

    if (
      (dependency.moduleSpecifier?.length ?? 0) > MAX_MODULE_SPECIFIER_LENGTH ||
      (dependency.targetName?.length ?? 0) > MAX_TARGET_NAME_LENGTH ||
      (dependency.localName?.length ?? 0) > MAX_LOCAL_NAME_LENGTH ||
      !validPosition
    ) {
      throw new DependencyExtractionError(
        'Parser returned dependency metadata outside persistence limits',
        DependencyExtractionErrorCode.InvalidMetadata,
      );
    }
  }

  private assertUniqueIdentities(
    dependencies: readonly PersistCodeDependencyRecord[],
  ): void {
    const identities = new Set<string>();

    for (const dependency of dependencies) {
      if (identities.has(dependency.identityHash)) {
        throw new DependencyExtractionError(
          'Parser returned duplicate dependency identities for one file version',
          DependencyExtractionErrorCode.DuplicateDependencyIdentity,
        );
      }

      identities.add(dependency.identityHash);
    }
  }

  private createIdentityHash(dependency: NormalizedDependency): string {
    return createHash('sha256')
      .update(
        JSON.stringify([
          dependency.kind,
          dependency.moduleSpecifier,
          dependency.targetName,
          dependency.localName,
          dependency.typeOnly,
          dependency.startOffset,
        ]),
      )
      .digest('hex');
  }

  private flattenRange(range: SourceRange): {
    startLine: number;
    startColumn: number;
    startOffset: number;
    endLine: number;
    endColumn: number;
    endOffset: number;
  } {
    return {
      startLine: range.start.line,
      startColumn: range.start.column,
      startOffset: range.start.offset,
      endLine: range.end.line,
      endColumn: range.end.column,
      endOffset: range.end.offset,
    };
  }
}
