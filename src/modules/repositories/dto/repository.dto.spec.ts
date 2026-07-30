import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AddRepositoryMemberDto } from './add-repository-member.dto';
import { CreateRepositoryDto } from './create-repository.dto';
import { ListRepositoriesQueryDto } from './list-repositories-query.dto';
import { UpdateRepositoryDto } from './update-repository.dto';
import {
  RepositoryProvider,
  RepositoryStatus,
} from '../entities/repository.entity';

describe('repository DTOs', () => {
  it('normalizes and validates repository registration input', async () => {
    const input = plainToInstance(CreateRepositoryDto, {
      name: ' CodeMind API ',
      remoteUrl: ' https://github.com/codemind/codemind-api.git ',
      defaultBranch: ' feature/repository-foundation ',
    });

    await expect(validate(input)).resolves.toHaveLength(0);
    expect(input).toEqual({
      name: 'CodeMind API',
      remoteUrl: 'https://github.com/codemind/codemind-api.git',
      defaultBranch: 'feature/repository-foundation',
    });
  });

  it('rejects insecure, credential-bearing, and query-bearing URLs', async () => {
    const values = [
      'http://github.com/codemind/api.git',
      'https://token@github.com/codemind/api.git',
      'https://github.com/codemind/api.git?token=secret',
    ];

    for (const remoteUrl of values) {
      const input = plainToInstance(CreateRepositoryDto, {
        name: 'CodeMind API',
        remoteUrl,
      });
      const errors = await validate(input);

      expect(errors.map((error) => error.property)).toContain('remoteUrl');
    }
  });

  it('applies list defaults and validates repository filters', async () => {
    const defaults = plainToInstance(ListRepositoriesQueryDto, {});
    const input = plainToInstance(ListRepositoriesQueryDto, {
      page: '2',
      limit: '50',
      search: ' api ',
      provider: RepositoryProvider.GitHub,
      status: RepositoryStatus.Active,
    });

    await expect(validate(defaults)).resolves.toHaveLength(0);
    await expect(validate(input)).resolves.toHaveLength(0);
    expect(defaults).toMatchObject({ page: 1, limit: 20 });
    expect(input).toMatchObject({
      page: 2,
      limit: 50,
      search: 'api',
      provider: RepositoryProvider.GitHub,
      status: RepositoryStatus.Active,
    });
  });

  it('rejects unsupported branches and lifecycle statuses', async () => {
    const input = plainToInstance(UpdateRepositoryDto, {
      defaultBranch: 'feature branch',
      status: 'deleted',
    });
    const errors = await validate(input);

    expect(errors.map((error) => error.property)).toEqual(
      expect.arrayContaining(['defaultBranch', 'status']),
    );
  });

  it('requires a UUID v4 repository member user ID', async () => {
    const valid = plainToInstance(AddRepositoryMemberDto, {
      userId: '25d8bd53-047b-42d8-9efa-4ecedfe422d3',
    });
    const invalid = plainToInstance(AddRepositoryMemberDto, {
      userId: 'not-a-user-id',
    });

    await expect(validate(valid)).resolves.toHaveLength(0);
    await expect(validate(invalid)).resolves.toHaveLength(1);
  });
});
