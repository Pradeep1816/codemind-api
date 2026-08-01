export enum GitSourceKind {
  GitHubHttps = 'github_https',
  Local = 'local',
}

export interface GitRepositorySource {
  kind: GitSourceKind;
  location: string;
}

export interface GitRemoteInspection {
  source: GitRepositorySource;
  defaultBranch: string | null;
  headCommitSha: string | null;
}

export interface GitBranchState {
  name: string;
  commitSha: string;
  isDefault: boolean;
}

export interface GitRepositoryState {
  workspacePath: string;
  defaultBranch: string | null;
  headCommitSha: string | null;
  sizeBytes: number;
  branches: GitBranchState[];
}

export interface GitCommandResult {
  stdout: string;
  stderr: string;
}

export interface GitCommandOptions {
  operation: string;
  cwd?: string;
}
