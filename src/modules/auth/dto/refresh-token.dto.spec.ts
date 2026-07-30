import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { RefreshTokenDto } from './refresh-token.dto';

describe('RefreshTokenDto', () => {
  it('accepts a refresh token without transforming it', async () => {
    const token = `header.${'a'.repeat(64)}.signature`;
    const input = plainToInstance(RefreshTokenDto, {
      refreshToken: token,
    });

    await expect(validate(input)).resolves.toHaveLength(0);
    expect(input.refreshToken).toBe(token);
  });

  it('rejects a short refresh token', async () => {
    const input = plainToInstance(RefreshTokenDto, {
      refreshToken: 'short-token',
    });

    await expect(validate(input)).resolves.not.toHaveLength(0);
  });
});
