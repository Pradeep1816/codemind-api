import { CodeSymbolKind } from '../../indexing/enums/code-symbol-kind.enum';
import { CodeSymbolVisibility } from '../../indexing/enums/code-symbol-visibility.enum';
import { SourceLanguage } from '../../indexing/enums/source-language.enum';
import { CodeIntelligenceFile } from '../../indexing/ports/code-intelligence-reader.port';
import { KnowledgeNodeResponseDto } from '../../knowledge/dto/knowledge-response.dto';
import { KnowledgeDerivationType } from '../../knowledge/enums/knowledge-derivation-type.enum';
import { KnowledgeNodeKind } from '../../knowledge/enums/knowledge-node-kind.enum';
import { SearchDocumentSourceType } from '../enums/search-document-source-type.enum';
import { SearchDocumentBuilderService } from './search-document-builder.service';

describe('SearchDocumentBuilderService', () => {
  const service = new SearchDocumentBuilderService();
  const scope = {
    organizationId: '8da12c58-f008-43f3-8d43-87a6aafd36f4',
    repositoryId: 2,
    branchId: 3,
    searchIndexId: 4,
  };

  it('builds bounded file and symbol documents with normalized identifiers', () => {
    const documents = service.buildFileDocuments(
      scope,
      file(),
      'export class DoctorScheduleService {\0 calculateRoundingWindow() {} }',
      256,
    );

    expect(documents).toHaveLength(2);
    expect(documents[0]).toMatchObject({
      sourceType: SearchDocumentSourceType.File,
      sourceIdentityKey: 'file:10:20',
      title: 'src/scheduling/doctor-schedule.service.ts',
      indexedFileId: 10,
      fileHashId: 20,
    });
    expect(documents[0].content).toContain('doctor schedule service');
    expect(documents[0].content).not.toContain('\0');
    expect(documents[1]).toMatchObject({
      sourceType: SearchDocumentSourceType.Symbol,
      sourceIdentityKey: 'symbol:30',
      title: 'DoctorScheduleService.calculateRoundingWindow',
      codeSymbolId: 30,
      kind: CodeSymbolKind.Method,
    });
    expect(documents[1].content).toContain('calculate rounding window');
    expect(documents[1].content).toContain('Rounds appointment times');
  });

  it('extracts bounded searchable terms from knowledge properties', () => {
    const document = service.buildKnowledgeDocument(
      scope,
      knowledgeNode(),
      256,
    );

    expect(document).toMatchObject({
      sourceType: SearchDocumentSourceType.KnowledgeNode,
      sourceIdentityKey: 'knowledge:50',
      title: 'AppointmentRoundingRule',
      knowledgeNodeId: 50,
      kind: KnowledgeNodeKind.BusinessRule,
    });
    expect(document.content).toContain('appointment rounding rule');
    expect(document.content).toContain('rounding interval');
    expect(document.content).toContain('15');
    expect(Buffer.byteLength(document.content, 'utf8')).toBeLessThanOrEqual(
      256,
    );
  });

  it('does not split a multibyte character when truncating content', () => {
    const documents = service.buildFileDocuments(
      scope,
      { ...file(), symbols: [] },
      'schedule '.repeat(20) + '🩺'.repeat(20),
      83,
    );

    expect(Buffer.byteLength(documents[0].content, 'utf8')).toBeLessThanOrEqual(
      83,
    );
    expect(documents[0].content).not.toContain('�');
  });

  function file(): CodeIntelligenceFile {
    return {
      id: 10,
      path: 'src/scheduling/doctor-schedule.service.ts',
      extension: '.ts',
      language: SourceLanguage.TypeScript,
      sizeBytes: 90,
      hash: {
        id: 20,
        sha256: 'a'.repeat(64),
        gitBlobOid: 'b'.repeat(40),
        sizeBytes: 90,
      },
      symbols: [
        {
          id: 30,
          indexedFileId: 10,
          fileHashId: 20,
          name: 'calculateRoundingWindow',
          qualifiedName: 'DoctorScheduleService.calculateRoundingWindow',
          kind: CodeSymbolKind.Method,
          visibility: CodeSymbolVisibility.Public,
          exported: false,
          defaultExport: false,
          signature: 'calculateRoundingWindow(time: Date): Date',
          documentation: 'Rounds appointment times to the configured window.',
          startLine: 2,
          startColumn: 3,
          startOffset: 40,
          endLine: 4,
          endColumn: 4,
          endOffset: 88,
        },
      ],
      dependencies: [],
    };
  }

  function knowledgeNode(): KnowledgeNodeResponseDto {
    return {
      id: 50,
      identityKey: 'rule:appointment-rounding',
      kind: KnowledgeNodeKind.BusinessRule,
      name: 'AppointmentRoundingRule',
      summary: 'Appointments use fixed scheduling windows.',
      derivationType: KnowledgeDerivationType.Deterministic,
      confidence: 0.95,
      analyzerName: 'typescript-business',
      analyzerVersion: '1.0.0',
      contentFingerprint: 'c'.repeat(64),
      propertySchemaVersion: 1,
      properties: {
        roundingInterval: 15,
        unit: 'minutes',
      },
      createdAt: new Date().toISOString(),
    };
  }
});
