import { Injectable } from '@nestjs/common';
import { posix } from 'node:path';

const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.json'] as const;

@Injectable()
export class RelativeModuleResolverService {
  /**
   * Produces ordered repository-relative candidates for explicit relative
   * modules. Package names and path aliases remain unresolved intentionally.
   */
  createCandidatePaths(
    sourcePath: string,
    moduleSpecifier: string,
  ): readonly string[] {
    if (
      !moduleSpecifier.startsWith('./') &&
      !moduleSpecifier.startsWith('../')
    ) {
      return [];
    }

    const targetBase = posix.normalize(
      posix.join(posix.dirname(sourcePath), moduleSpecifier),
    );

    if (
      targetBase === '..' ||
      targetBase.startsWith('../') ||
      targetBase.startsWith('/')
    ) {
      return [];
    }

    const extension = posix.extname(targetBase).toLowerCase();
    const candidates: string[] = [];

    if (extension.length > 0) {
      if (extension === '.js') {
        candidates.push(
          `${targetBase.slice(0, -extension.length)}.ts`,
          `${targetBase.slice(0, -extension.length)}.tsx`,
        );
      } else if (extension === '.jsx') {
        candidates.push(`${targetBase.slice(0, -extension.length)}.tsx`);
      }

      candidates.push(targetBase);
    } else {
      for (const sourceExtension of SOURCE_EXTENSIONS) {
        candidates.push(`${targetBase}${sourceExtension}`);
      }

      for (const sourceExtension of SOURCE_EXTENSIONS) {
        candidates.push(posix.join(targetBase, `index${sourceExtension}`));
      }
    }

    return [...new Set(candidates)];
  }
}
