export interface IndexingWorkspaceIdentity {
  organizationId: string;
  repositoryId: number;
  jobId: number;
  targetCommitSha: string;
}

export interface IndexingWorkspace {
  rootPath: string;
  sourcePath: string;
  metadataPath: string;
  cachePath: string;
  gitObjectCachePath: string;
  targetCommitSha: string;
}
