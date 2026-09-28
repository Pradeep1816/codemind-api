import { Injectable } from '@nestjs/common';
import {
  CodeIntelligenceFile,
  CodeIntelligenceSymbol,
} from '../../indexing/ports/code-intelligence-reader.port';
import { KnowledgeNodeResponseDto } from '../../knowledge/dto/knowledge-response.dto';
import { SearchDocumentSourceType } from '../enums/search-document-source-type.enum';
import { normalizeTechnicalSearchText } from '../utils/search-text.utils';
import { SearchDocumentInput } from './search-projection.types';

export interface SearchDocumentScope {
  organizationId: string;
  repositoryId: number;
  branchId: number;
  searchIndexId: number;
}

const MAX_PROPERTY_DEPTH = 5;
const MAX_PROPERTY_TERMS = 1_000;

@Injectable()
export class SearchDocumentBuilderService {
  buildFileDocuments(
    scope: SearchDocumentScope,
    file: CodeIntelligenceFile,
    sourceContent: string,
    maxContentBytes: number,
  ): SearchDocumentInput[] {
    const normalizedPath = normalizeTechnicalSearchText(file.path);
    const fileDocument: SearchDocumentInput = {
      ...scope,
      sourceType: SearchDocumentSourceType.File,
      sourceIdentityKey: `file:${file.id}:${file.hash.id}`,
      indexedFileId: file.id,
      fileHashId: file.hash.id,
      codeSymbolId: null,
      knowledgeNodeId: null,
      title: this.truncateCharacters(file.path, 512),
      content: this.truncateUtf8(
        this.joinContent([
          normalizedPath,
          normalizeTechnicalSearchText(this.sanitizeText(sourceContent)),
        ]),
        maxContentBytes,
      ),
      path: file.path,
      language: file.language,
      kind: 'file',
      metadata: {
        extension: file.extension,
        sizeBytes: file.sizeBytes,
        sha256: file.hash.sha256,
        gitBlobOid: file.hash.gitBlobOid,
      },
    };

    return [
      fileDocument,
      ...file.symbols.map((symbol) =>
        this.buildSymbolDocument(scope, file, symbol, maxContentBytes),
      ),
    ];
  }

  buildKnowledgeDocument(
    scope: SearchDocumentScope,
    node: KnowledgeNodeResponseDto,
    maxContentBytes: number,
  ): SearchDocumentInput {
    const propertyTerms = this.collectPropertyTerms(node.properties);

    return {
      ...scope,
      sourceType: SearchDocumentSourceType.KnowledgeNode,
      sourceIdentityKey: `knowledge:${node.id}`,
      indexedFileId: null,
      fileHashId: null,
      codeSymbolId: null,
      knowledgeNodeId: node.id,
      title: this.truncateCharacters(node.name, 512),
      content: this.truncateUtf8(
        this.joinContent([
          normalizeTechnicalSearchText(node.name),
          node.summary,
          node.kind,
          ...propertyTerms,
        ]),
        maxContentBytes,
      ),
      path: null,
      language: null,
      kind: node.kind,
      metadata: {
        confidence: node.confidence,
        derivationType: node.derivationType,
        analyzerName: node.analyzerName,
        analyzerVersion: node.analyzerVersion,
        contentFingerprint: node.contentFingerprint,
        propertySchemaVersion: node.propertySchemaVersion,
      },
    };
  }

  private buildSymbolDocument(
    scope: SearchDocumentScope,
    file: CodeIntelligenceFile,
    symbol: CodeIntelligenceSymbol,
    maxContentBytes: number,
  ): SearchDocumentInput {
    return {
      ...scope,
      sourceType: SearchDocumentSourceType.Symbol,
      sourceIdentityKey: `symbol:${symbol.id}`,
      indexedFileId: file.id,
      fileHashId: file.hash.id,
      codeSymbolId: symbol.id,
      knowledgeNodeId: null,
      title: this.truncateCharacters(symbol.qualifiedName, 512),
      content: this.truncateUtf8(
        this.joinContent([
          normalizeTechnicalSearchText(symbol.name),
          normalizeTechnicalSearchText(symbol.qualifiedName),
          symbol.signature,
          symbol.documentation,
          symbol.kind,
          symbol.visibility,
          symbol.exported ? 'exported' : null,
          symbol.defaultExport ? 'default export' : null,
        ]),
        maxContentBytes,
      ),
      path: file.path,
      language: file.language,
      kind: symbol.kind,
      metadata: {
        name: symbol.name,
        qualifiedName: symbol.qualifiedName,
        visibility: symbol.visibility,
        exported: symbol.exported,
        defaultExport: symbol.defaultExport,
        startLine: symbol.startLine,
        startColumn: symbol.startColumn,
        endLine: symbol.endLine,
        endColumn: symbol.endColumn,
      },
    };
  }

  private collectPropertyTerms(value: unknown): string[] {
    const terms: string[] = [];
    const seen = new Set<object>();

    const visit = (current: unknown, depth: number): void => {
      if (terms.length >= MAX_PROPERTY_TERMS || depth > MAX_PROPERTY_DEPTH) {
        return;
      }

      if (
        typeof current === 'string' ||
        typeof current === 'number' ||
        typeof current === 'boolean'
      ) {
        terms.push(String(current));
        return;
      }

      if (current === null || current === undefined) {
        return;
      }

      if (Array.isArray(current)) {
        for (const item of current) {
          visit(item, depth + 1);
        }
        return;
      }

      if (typeof current === 'object') {
        if (seen.has(current)) {
          return;
        }
        seen.add(current);

        for (const [key, item] of Object.entries(current)) {
          terms.push(normalizeTechnicalSearchText(key));
          visit(item, depth + 1);

          if (terms.length >= MAX_PROPERTY_TERMS) {
            break;
          }
        }
      }
    };

    visit(value, 0);
    return terms;
  }

  private sanitizeText(value: string): string {
    return value.replaceAll('\0', ' ');
  }

  private joinContent(values: readonly (string | null | undefined)[]): string {
    return values
      .map((value) => value?.trim())
      .filter((value): value is string => Boolean(value))
      .join('\n');
  }

  private truncateCharacters(value: string, maxLength: number): string {
    return value.length <= maxLength ? value : value.slice(0, maxLength);
  }

  private truncateUtf8(value: string, maxBytes: number): string {
    const bytes = Buffer.from(value, 'utf8');

    if (bytes.length <= maxBytes) {
      return value;
    }

    for (let end = maxBytes; end >= Math.max(0, maxBytes - 4); end -= 1) {
      try {
        return new TextDecoder('utf-8', { fatal: true }).decode(
          bytes.subarray(0, end),
        );
      } catch {
        // A UTF-8 code point crosses the boundary; try the previous byte.
      }
    }

    return '';
  }
}
