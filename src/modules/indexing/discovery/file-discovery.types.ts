export interface DiscoveredFile {
  path: string;
  extension: string;
  sizeBytes: number;
  gitBlobOid: string;
}

export interface FileDiscoveryStatistics {
  observedEntries: number;
  selectedFiles: number;
  ignoredFiles: number;
  unsupportedFiles: number;
  oversizedFiles: number;
  specialFiles: number;
  selectedBytes: number;
}

export interface FileDiscoveryManifest {
  repositoryId: number;
  targetCommitSha: string;
  files: DiscoveredFile[];
  statistics: FileDiscoveryStatistics;
}
