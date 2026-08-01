import { execFile, ExecFileException } from 'node:child_process';
import { devNull } from 'node:os';
import { Inject, Injectable } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import gitConfig from '../../../config/git.config';
import { GitCommandError } from './git.errors';
import { GitCommandOptions, GitCommandResult } from './git.types';

@Injectable()
export class GitCommandService {
  constructor(
    @Inject(gitConfig.KEY)
    private readonly configuration: ConfigType<typeof gitConfig>,
  ) {}

  run(
    arguments_: readonly string[],
    options: GitCommandOptions,
  ): Promise<GitCommandResult> {
    if (arguments_.some((argument) => argument.includes('\0'))) {
      throw new GitCommandError(options.operation, null, null, false);
    }

    const gitArguments = [
      '-c',
      `core.hooksPath=${devNull}`,
      '-c',
      'credential.helper=',
      ...arguments_,
    ];

    return new Promise((resolve, reject) => {
      execFile(
        'git',
        gitArguments,
        {
          cwd: options.cwd,
          encoding: 'utf8',
          env: this.createProcessEnvironment(),
          maxBuffer: this.configuration.maxOutputBytes,
          timeout: this.configuration.commandTimeoutMs,
          windowsHide: true,
        },
        (error: ExecFileException | null, stdout: string, stderr: string) => {
          if (error) {
            reject(
              new GitCommandError(
                options.operation,
                error.code ?? null,
                error.signal ?? null,
                error.killed === true,
                { cause: error },
              ),
            );
            return;
          }

          resolve({ stdout, stderr });
        },
      );
    });
  }

  private createProcessEnvironment(): NodeJS.ProcessEnv {
    const environment = { ...process.env };

    for (const name of Object.keys(environment)) {
      if (name.startsWith('GIT_')) {
        delete environment[name];
      }
    }

    return {
      ...environment,
      GIT_CONFIG_GLOBAL: devNull,
      GIT_CONFIG_NOSYSTEM: '1',
      GIT_PROTOCOL_FROM_USER: '0',
      GIT_TERMINAL_PROMPT: '0',
      GCM_INTERACTIVE: 'Never',
    };
  }
}
