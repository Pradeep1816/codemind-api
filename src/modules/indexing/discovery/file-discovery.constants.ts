export const INDEXABLE_EXTENSIONS = new Set([
  'js',
  'json',
  'jsx',
  'md',
  'ts',
  'tsx',
  'yaml',
  'yml',
]);

export const IGNORED_DIRECTORY_NAMES = new Set([
  '.git',
  'build',
  'coverage',
  'dist',
  'node_modules',
]);

export const REGULAR_GIT_FILE_MODES = new Set(['100644', '100755']);
