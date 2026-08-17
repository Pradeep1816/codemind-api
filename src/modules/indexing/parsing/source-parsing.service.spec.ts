import { ParserService } from '../../parser/parser.service';
import { ParseSourceResult } from '../../parser/types/parser.types';
import { GitService } from '../../repositories/git/git.service';
import { SourceLanguage } from '../enums/source-language.enum';
import {
  SourceParsingError,
  SourceParsingErrorCode,
} from './source-parsing.errors';
import { SourceParsingService } from './source-parsing.service';
import { ParseIndexedFileInput } from './source-parsing.types';

describe('SourceParsingService', () => {
  const input: ParseIndexedFileInput = {
    organizationId: '5abf1e5e-e03c-4890-83a5-c4e84ad48d18',
    repositoryId: 2,
    targetCommitSha: '8e008e725d9e411c5bff3a713b91afeaf4613f13',
    indexedFileId: 10,
    fileHashId: 20,
    path: 'src/app.ts',
    language: SourceLanguage.TypeScript,
    extension: 'ts',
    gitBlobOid: '1'.repeat(40),
    expectedSizeBytes: 24,
  };

  const parsedResult: ParseSourceResult = {
    indexedFileId: input.indexedFileId,
    fileHashId: input.fileHashId,
    path: input.path,
    language: input.language,
    extension: input.extension,
    symbols: [],
    imports: [],
    exports: [],
    relationships: [],
    diagnostics: [],
    hasSyntaxErrors: false,
  };

  function createService(content: Buffer, result = parsedResult) {
    const gitService = {
      readBlob: jest.fn().mockResolvedValue({
        objectId: input.gitBlobOid,
        content,
      }),
    };
    const parserService = {
      parse: jest.fn().mockResolvedValue(result),
    };

    return {
      service: new SourceParsingService(
        { maxFileSizeBytes: 100 } as never,
        gitService as unknown as GitService,
        parserService as unknown as ParserService,
      ),
      gitService,
      parserService,
    };
  }

  it('reads one bounded immutable blob and sends UTF-8 source to the parser', async () => {
    const content = Buffer.from('export const value = 1;\n');
    const { service, gitService, parserService } = createService(content);

    await expect(
      service.parseFile({ ...input, expectedSizeBytes: content.length }),
    ).resolves.toBe(parsedResult);
    expect(gitService.readBlob).toHaveBeenCalledWith(
      input.organizationId,
      input.repositoryId,
      input.targetCommitSha,
      input.gitBlobOid,
      100,
    );
    expect(parserService.parse).toHaveBeenCalledWith({
      indexedFileId: input.indexedFileId,
      fileHashId: input.fileHashId,
      path: input.path,
      language: input.language,
      extension: input.extension,
      content: content.toString('utf8'),
    });
  });

  it('rejects blob-size drift before parsing', async () => {
    const { service, parserService } = createService(Buffer.from('short'));

    await expect(service.parseFile(input)).rejects.toMatchObject<
      Partial<SourceParsingError>
    >({ code: SourceParsingErrorCode.BlobSizeMismatch });
    expect(parserService.parse).not.toHaveBeenCalled();
  });

  it('rejects non-UTF-8 source before parsing', async () => {
    const content = Buffer.from([0xc3, 0x28]);
    const { service, parserService } = createService(content);

    await expect(
      service.parseFile({ ...input, expectedSizeBytes: content.length }),
    ).rejects.toMatchObject<Partial<SourceParsingError>>({
      code: SourceParsingErrorCode.UnsupportedEncoding,
    });
    expect(parserService.parse).not.toHaveBeenCalled();
  });

  it('rejects invalid persisted identities before reading Git', async () => {
    const { service, gitService } = createService(Buffer.alloc(0));

    await expect(
      service.parseFile({ ...input, indexedFileId: 0 }),
    ).rejects.toMatchObject<Partial<SourceParsingError>>({
      code: SourceParsingErrorCode.InvalidMetadata,
    });
    expect(gitService.readBlob).not.toHaveBeenCalled();
  });
});
