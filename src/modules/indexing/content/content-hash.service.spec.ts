import { createHash } from 'node:crypto';
import { GitService } from '../../repositories/git/git.service';
import { IndexedFileEntity } from '../entities/indexed-file.entity';
import { IndexingMode } from '../enums/indexing-mode.enum';
import { SourceLanguage } from '../enums/source-language.enum';
import {
  FileInventoryResult,
  FileInventoryService,
} from '../file-inventory.service';
import { IndexingRepository } from '../indexing.repository';
import { LanguageDetectionService } from '../language/language-detection.service';
import { ContentHashError, ContentHashErrorCode } from './content-hash.errors';
import { ContentHashService } from './content-hash.service';

describe('ContentHashService', () => {
  const organizationId = '5abf1e5e-e03c-4890-83a5-c4e84ad48d18';
  const commitSha = '8e008e725d9e411c5bff3a713b91afeaf4613f13';
  const completedAt = new Date('2026-08-07T10:00:00.000Z');
  const aOid = 'a'.repeat(40);
  const bOldOid = 'b'.repeat(40);
  const bNewOid = 'c'.repeat(40);
  const dOid = 'd'.repeat(40);
  const jsonOid = 'e'.repeat(40);
  const changedContent = Buffer.from('export const changed = true;\n');

  function file(
    id: number,
    path: string,
    extension: string,
    language: SourceLanguage,
    hash: {
      id: number;
      gitBlobOid: string;
      sizeBytes: number;
      analysisCompletedAt: Date | null;
    },
  ): IndexedFileEntity {
    return {
      id,
      path,
      extension,
      language,
      currentFileHash: hash,
    } as unknown as IndexedFileEntity;
  }

  function inventory(): FileInventoryResult {
    return {
      jobId: 30,
      organizationId,
      repositoryId: 2,
      branchId: 3,
      targetCommitSha: commitSha,
      mode: IndexingMode.Incremental,
      files: [
        { path: 'src/a.ts', extension: 'ts', sizeBytes: 10, gitBlobOid: aOid },
        {
          path: 'src/b.ts',
          extension: 'ts',
          sizeBytes: changedContent.length,
          gitBlobOid: bNewOid,
        },
        {
          path: 'src/incomplete.ts',
          extension: 'ts',
          sizeBytes: 12,
          gitBlobOid: dOid,
        },
        {
          path: 'package.json',
          extension: 'json',
          sizeBytes: 8,
          gitBlobOid: jsonOid,
        },
      ],
      activeFiles: 4,
      newlyDeletedFiles: 0,
      parserSupportedFiles: 3,
      inventoryOnlyFiles: 1,
      languages: {},
      discovery: {
        observedEntries: 4,
        selectedFiles: 4,
        ignoredFiles: 0,
        unsupportedFiles: 0,
        oversizedFiles: 0,
        specialFiles: 0,
        selectedBytes: 40,
      },
    };
  }

  function createService(blob = changedContent) {
    const before = [
      file(1, 'src/a.ts', 'ts', SourceLanguage.TypeScript, {
        id: 11,
        gitBlobOid: aOid,
        sizeBytes: 10,
        analysisCompletedAt: completedAt,
      }),
      file(2, 'src/b.ts', 'ts', SourceLanguage.TypeScript, {
        id: 12,
        gitBlobOid: bOldOid,
        sizeBytes: changedContent.length,
        analysisCompletedAt: completedAt,
      }),
      file(3, 'src/incomplete.ts', 'ts', SourceLanguage.TypeScript, {
        id: 13,
        gitBlobOid: dOid,
        sizeBytes: 12,
        analysisCompletedAt: null,
      }),
      file(4, 'package.json', 'json', SourceLanguage.Json, {
        id: 14,
        gitBlobOid: jsonOid,
        sizeBytes: 8,
        analysisCompletedAt: completedAt,
      }),
    ];
    const after = [
      before[0],
      file(2, 'src/b.ts', 'ts', SourceLanguage.TypeScript, {
        id: 22,
        gitBlobOid: bNewOid,
        sizeBytes: changedContent.length,
        analysisCompletedAt: null,
      }),
      before[2],
      before[3],
    ];
    const indexingRepository = {
      findActiveFilesByBranch: jest
        .fn()
        .mockResolvedValueOnce(before)
        .mockResolvedValueOnce(after),
      persistFileHashBatch: jest.fn().mockResolvedValue({
        createdHashes: 1,
        reusedHashes: 0,
      }),
    };
    const gitService = {
      readBlob: jest
        .fn()
        .mockResolvedValue({ objectId: bNewOid, content: blob }),
    };

    return {
      service: new ContentHashService(
        { maxFileSizeBytes: 100 } as never,
        {} as FileInventoryService,
        indexingRepository as unknown as IndexingRepository,
        gitService as unknown as GitService,
        new LanguageDetectionService(),
      ),
      indexingRepository,
      gitService,
    };
  }

  it('hashes changed content and reselects unchanged but incomplete analysis', async () => {
    const { service, indexingRepository, gitService } = createService();

    const result = await service.hashInventory(inventory(), 'lease-token');

    expect(gitService.readBlob).toHaveBeenCalledTimes(1);
    expect(indexingRepository.persistFileHashBatch).toHaveBeenCalledWith({
      organizationId,
      repositoryId: 2,
      branchId: 3,
      indexJobId: 30,
      leaseToken: 'lease-token',
      hashes: [
        {
          indexedFileId: 2,
          sha256: createHash('sha256').update(changedContent).digest('hex'),
          gitBlobOid: bNewOid,
          sizeBytes: changedContent.length,
        },
      ],
    });
    expect(result).toMatchObject({
      selectedFiles: 4,
      hashedFiles: 1,
      unchangedFiles: 3,
      createdHashes: 1,
      reusedHashes: 0,
      hashedBytes: changedContent.length,
    });
    expect(result.analysisFiles.map(({ path }) => path)).toEqual([
      'src/b.ts',
      'src/incomplete.ts',
    ]);
  });

  it('rejects Git blob content whose size differs from tree metadata', async () => {
    const { service, indexingRepository } = createService(Buffer.from('bad'));

    await expect(
      service.hashInventory(inventory(), 'lease-token'),
    ).rejects.toMatchObject<Partial<ContentHashError>>({
      code: ContentHashErrorCode.BlobSizeMismatch,
    });
    expect(indexingRepository.persistFileHashBatch).not.toHaveBeenCalled();
  });
});
