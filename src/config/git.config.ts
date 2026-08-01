import { resolve } from 'node:path';
import { registerAs } from '@nestjs/config';

function readInteger(name: string, fallback: number): number {
  return Number.parseInt(process.env[name] ?? String(fallback), 10);
}

function resolveOptionalPath(value: string | undefined): string | undefined {
  const normalized = value?.trim();

  return normalized ? resolve(normalized) : undefined;
}

export default registerAs('git', () => ({
  workspaceRoot: resolve(
    process.env.GIT_WORKSPACE_ROOT ?? '.codemind/repositories',
  ),
  localRepositoriesRoot: resolveOptionalPath(
    process.env.GIT_LOCAL_REPOSITORIES_ROOT,
  ),
  commandTimeoutMs: readInteger('GIT_COMMAND_TIMEOUT_MS', 120_000),
  maxOutputBytes: readInteger('GIT_MAX_OUTPUT_BYTES', 1_048_576),
  cloneDepth: readInteger('GIT_CLONE_DEPTH', 1),
}));
