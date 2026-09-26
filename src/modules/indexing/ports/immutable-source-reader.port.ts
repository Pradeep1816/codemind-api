export const IMMUTABLE_SOURCE_READER = Symbol('IMMUTABLE_SOURCE_READER');

export interface ImmutableSourceReadRequest {
  organizationId: string;
  repositoryId: number;
  targetCommitSha: string;
  indexedFileId: number;
  fileHashId: number;
  path: string;
  gitBlobOid: string;
  expectedSizeBytes: number;
}

export interface ImmutableSourceContent {
  indexedFileId: number;
  fileHashId: number;
  path: string;
  gitBlobOid: string;
  sizeBytes: number;
  content: string;
}

export interface ImmutableSourceReader {
  read(request: ImmutableSourceReadRequest): Promise<ImmutableSourceContent>;
}
