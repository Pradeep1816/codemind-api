import { GitService } from '../../repositories/git/git.service';
import {
  ImmutableSourceReadError,
  ImmutableSourceReadErrorCode,
} from './immutable-source-reader.errors';
import { ImmutableSourceReaderService } from './immutable-source-reader.service';

describe('ImmutableSourceReaderService', () => {
  const request = {
    organizationId: '5abf1e5e-e03c-4890-83a5-c4e84ad48d18',
    repositoryId: 2,
    targetCommitSha: '8e008e725d9e411c5bff3a713b91afeaf4613f13',
    indexedFileId: 3,
    fileHashId: 4,
    path: 'src/doctor.service.ts',
    gitBlobOid: 'a'.repeat(40),
    expectedSizeBytes: 24,
  };

  function createService(content: Buffer, objectId = request.gitBlobOid) {
    const gitService = {
      readBlob: jest.fn().mockResolvedValue({ objectId, content }),
    };
    const service = new ImmutableSourceReaderService(
      { maxFileSizeBytes: 100 } as never,
      gitService as unknown as GitService,
    );

    return { service, gitService };
  }

  it('returns bounded UTF-8 content with immutable identities', async () => {
    const content = Buffer.from('export const value = 1;\n');
    const { service, gitService } = createService(content);

    await expect(
      service.read({ ...request, expectedSizeBytes: content.length }),
    ).resolves.toEqual({
      indexedFileId: request.indexedFileId,
      fileHashId: request.fileHashId,
      path: request.path,
      gitBlobOid: request.gitBlobOid,
      sizeBytes: content.length,
      content: content.toString('utf8'),
    });
    expect(gitService.readBlob).toHaveBeenCalledWith(
      request.organizationId,
      request.repositoryId,
      request.targetCommitSha,
      request.gitBlobOid,
      100,
    );
  });

  it('rejects oversized metadata before reading Git', async () => {
    const { service, gitService } = createService(Buffer.alloc(0));

    await expect(
      service.read({ ...request, expectedSizeBytes: 101 }),
    ).rejects.toMatchObject<Partial<ImmutableSourceReadError>>({
      code: ImmutableSourceReadErrorCode.FileTooLarge,
    });
    expect(gitService.readBlob).not.toHaveBeenCalled();
  });

  it('rejects blob identity, size, and encoding drift', async () => {
    await expect(
      createService(
        Buffer.alloc(request.expectedSizeBytes),
        'b'.repeat(40),
      ).service.read(request),
    ).rejects.toMatchObject<Partial<ImmutableSourceReadError>>({
      code: ImmutableSourceReadErrorCode.BlobIdentityMismatch,
    });

    await expect(
      createService(Buffer.from('short')).service.read(request),
    ).rejects.toMatchObject<Partial<ImmutableSourceReadError>>({
      code: ImmutableSourceReadErrorCode.BlobSizeMismatch,
    });

    const invalidUtf8 = Buffer.from([0xc3, 0x28]);
    await expect(
      createService(invalidUtf8).service.read({
        ...request,
        expectedSizeBytes: invalidUtf8.length,
      }),
    ).rejects.toMatchObject<Partial<ImmutableSourceReadError>>({
      code: ImmutableSourceReadErrorCode.UnsupportedEncoding,
    });
  });

  it('rejects invalid persisted identities before reading Git', async () => {
    const { service, gitService } = createService(Buffer.alloc(0));

    await expect(
      service.read({ ...request, fileHashId: 0 }),
    ).rejects.toMatchObject<Partial<ImmutableSourceReadError>>({
      code: ImmutableSourceReadErrorCode.InvalidRequest,
    });
    expect(gitService.readBlob).not.toHaveBeenCalled();
  });
});
