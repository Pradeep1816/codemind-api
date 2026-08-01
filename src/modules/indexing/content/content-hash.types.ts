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
}
