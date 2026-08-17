import { SourceLanguage } from '../enums/source-language.enum';

export interface ContentAnalysisFile {
  indexedFileId: number;
  fileHashId: number;
  path: string;
  extension: string;
  language: SourceLanguage;
  gitBlobOid: string;
  sizeBytes: number;
}

export interface ContentHashResult {
  jobId: number;
  repositoryId: number;
  branchId: number;
  targetCommitSha: string;
  selectedFiles: number;
  newlyDeletedFiles: number;
  hashedFiles: number;
  unchangedFiles: number;
  createdHashes: number;
  reusedHashes: number;
  hashedBytes: number;
  analysisFiles: readonly ContentAnalysisFile[];
}
