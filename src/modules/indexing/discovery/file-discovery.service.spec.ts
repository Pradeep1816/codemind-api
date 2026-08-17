import { GitService } from '../../repositories/git/git.service';
import { GitTreeFileEntry } from '../../repositories/git/git.types';
import {
  FileDiscoveryError,
  FileDiscoveryErrorCode,
} from './file-discovery.errors';
import { FileDiscoveryService } from './file-discovery.service';

describe('FileDiscoveryService', () => {
  const organizationId = '5abf1e5e-e03c-4890-83a5-c4e84ad48d18';
  const commitSha = '8e008e725d9e411c5bff3a713b91afeaf4613f13';

  function entry(
    path: string,
    sizeBytes = 10,
    mode = '100644',
    objectId = '1'.repeat(40),
  ): GitTreeFileEntry {
    return { path, sizeBytes, mode, objectId };
  }

  function createService(
    entries: readonly GitTreeFileEntry[],
    overrides: Record<string, number> = {},
  ): FileDiscoveryService {
    const gitService = {
      listCommitFiles: jest.fn().mockResolvedValue(entries),
    };

    return new FileDiscoveryService(
      {
        maxFiles: 10,
        maxFileSizeBytes: 100,
        maxTotalBytes: 250,
        maxPathLength: 100,
        maxPathDepth: 8,
        ...overrides,
      } as never,
      gitService as unknown as GitService,
    );
  }

  it('selects safe indexable files and reports every filtered category', async () => {
    const service = createService([
      entry('src/app.ts', 20, '100644', '1'.repeat(40)),
      entry('src/Component.TSX', 25, '100644', '2'.repeat(40)),
      entry('node_modules/package/index.js', 10, '100644', '3'.repeat(40)),
      entry('assets/logo.png', 10, '100644', '4'.repeat(40)),
      entry('src/large.ts', 101, '100644', '5'.repeat(40)),
      entry('src/link.ts', 4, '120000', '6'.repeat(40)),
    ]);

    const result = await service.discover(organizationId, 2, commitSha);

    expect(result.files).toEqual([
      {
        path: 'src/app.ts',
        extension: 'ts',
        sizeBytes: 20,
        gitBlobOid: '1'.repeat(40),
      },
      {
        path: 'src/Component.TSX',
        extension: 'tsx',
        sizeBytes: 25,
        gitBlobOid: '2'.repeat(40),
      },
    ]);
    expect(result.statistics).toEqual({
      observedEntries: 6,
      selectedFiles: 2,
      ignoredFiles: 1,
      unsupportedFiles: 1,
      oversizedFiles: 1,
      specialFiles: 1,
      selectedBytes: 45,
    });
  });

  it.each([
    '../escape.ts',
    '/absolute.ts',
    'src\\windows.ts',
    'src//empty.ts',
    'src/./relative.ts',
    'src/\u0000unsafe.ts',
  ])('rejects unsafe repository path %s', async (path) => {
    const service = createService([entry(path)]);

    await expect(
      service.discover(organizationId, 2, commitSha),
    ).rejects.toMatchObject<Partial<FileDiscoveryError>>({
      code: FileDiscoveryErrorCode.UnsafePath,
    });
  });

  it('rejects duplicate normalized paths', async () => {
    const service = createService([
      entry('src/app.ts', 10, '100644', '1'.repeat(40)),
      entry('src/app.ts', 10, '100644', '2'.repeat(40)),
    ]);

    await expect(
      service.discover(organizationId, 2, commitSha),
    ).rejects.toMatchObject<Partial<FileDiscoveryError>>({
      code: FileDiscoveryErrorCode.DuplicatePath,
    });
  });

  it('enforces file-count and selected-byte ceilings', async () => {
    const files = [
      entry('src/a.ts', 60, '100644', '1'.repeat(40)),
      entry('src/b.ts', 60, '100644', '2'.repeat(40)),
    ];

    await expect(
      createService(files, { maxFiles: 1 }).discover(
        organizationId,
        2,
        commitSha,
      ),
    ).rejects.toMatchObject<Partial<FileDiscoveryError>>({
      code: FileDiscoveryErrorCode.FileLimitExceeded,
    });
    await expect(
      createService(files, { maxTotalBytes: 100 }).discover(
        organizationId,
        2,
        commitSha,
      ),
    ).rejects.toMatchObject<Partial<FileDiscoveryError>>({
      code: FileDiscoveryErrorCode.ByteLimitExceeded,
    });
  });
});
