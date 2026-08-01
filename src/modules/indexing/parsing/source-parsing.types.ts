import { SourceLanguage } from '../enums/source-language.enum';

export interface ParseIndexedFileInput {
  organizationId: string;
  repositoryId: number;
  targetCommitSha: string;
  indexedFileId: number;
  fileHashId: number;
  path: string;
  language: SourceLanguage;
  extension: string;
  gitBlobOid: string;
  expectedSizeBytes: number;
}
