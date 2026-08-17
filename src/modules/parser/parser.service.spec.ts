import { TypeScriptSourceParser } from './adapters/typescript-source.parser';
import { ParsedRelationshipKind } from './enums/parsed-relationship-kind.enum';
import { ParsedSymbolKind } from './enums/parsed-symbol-kind.enum';
import { ParserError, ParserErrorCode } from './parser.errors';
import { ParserService } from './parser.service';

describe('ParserService', () => {
  const service = new ParserService(new TypeScriptSourceParser());

  it('extracts TypeScript symbols, imports, exports, and inheritance', async () => {
    const result = await service.parse({
      indexedFileId: 10,
      fileHashId: 20,
      path: 'src/doctor.service.ts',
      language: 'typescript',
      extension: 'ts',
      content: `
        import { Repository } from './repository';

        export interface Schedulable {
          schedule(): void;
        }

        export class DoctorService extends Repository implements Schedulable {
          public schedule(): void {}
          private calculateSlots(): number { return 1; }
        }

        export function createDoctor(): DoctorService {
          return new DoctorService();
        }

        export const findDoctor = (id: number) => id;
        export { Repository } from './repository';
      `,
    });

    expect(result.symbols).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'Schedulable',
          kind: ParsedSymbolKind.Interface,
        }),
        expect.objectContaining({
          name: 'DoctorService',
          kind: ParsedSymbolKind.Class,
          exported: true,
        }),
        expect.objectContaining({
          qualifiedName: 'DoctorService.schedule',
          kind: ParsedSymbolKind.Method,
        }),
        expect.objectContaining({
          name: 'createDoctor',
          kind: ParsedSymbolKind.Function,
        }),
        expect.objectContaining({
          name: 'findDoctor',
          kind: ParsedSymbolKind.Function,
        }),
      ]),
    );
    expect(result.imports).toEqual([
      expect.objectContaining({
        moduleSpecifier: './repository',
        namedImports: [expect.objectContaining({ importedName: 'Repository' })],
      }),
    ]);
    expect(result.relationships).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: ParsedRelationshipKind.Extends,
          targetName: 'Repository',
        }),
        expect.objectContaining({
          kind: ParsedRelationshipKind.Implements,
          targetName: 'Schedulable',
        }),
      ]),
    );
    expect(result.exports.length).toBeGreaterThan(0);
    expect(result.hasSyntaxErrors).toBe(false);
  });

  it('reports syntax diagnostics without executing source code', async () => {
    const result = await service.parse({
      indexedFileId: 10,
      fileHashId: 20,
      path: 'src/broken.ts',
      language: 'typescript',
      extension: 'ts',
      content: 'export class Broken {',
    });

    expect(result.hasSyntaxErrors).toBe(true);
    expect(result.diagnostics.length).toBeGreaterThan(0);
  });

  it('parses JavaScript and JSX through the shared TypeScript adapter', async () => {
    const result = await service.parse({
      indexedFileId: 11,
      fileHashId: 21,
      path: 'src/doctor-card.jsx',
      language: 'javascript',
      extension: 'jsx',
      content: `
        export function DoctorCard({ name }) {
          return <article>{name}</article>;
        }
      `,
    });

    expect(result.symbols).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'DoctorCard',
          kind: ParsedSymbolKind.Function,
          exported: true,
        }),
      ]),
    );
    expect(result.hasSyntaxErrors).toBe(false);
  });

  it('rejects unsupported language and extension pairs', async () => {
    try {
      await service.parse({
        indexedFileId: 10,
        fileHashId: 20,
        path: 'src/app.py',
        language: 'python',
        extension: 'py',
        content: 'print("hello")',
      });
      throw new Error('Expected parser to reject Python');
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(ParserError);

      if (!(error instanceof ParserError)) {
        throw error;
      }

      expect(error.code).toBe(ParserErrorCode.UnsupportedLanguage);
    }
  });
});
