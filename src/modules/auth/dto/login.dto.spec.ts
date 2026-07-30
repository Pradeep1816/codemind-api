import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { LoginDto } from './login.dto';

describe('LoginDto', () => {
  it('trims the email without changing the password', async () => {
    const input = plainToInstance(LoginDto, {
      email: ' pradeep@example.com ',
      password: ' password with spaces ',
    });

    const errors = await validate(input);

    expect(errors).toHaveLength(0);
    expect(input.email).toBe('pradeep@example.com');
    expect(input.password).toBe(' password with spaces ');
  });

  it('rejects invalid credentials input', async () => {
    const input = plainToInstance(LoginDto, {
      email: 'not-an-email',
      password: '',
    });

    const errors = await validate(input);
    const properties = errors.map((error) => error.property);

    expect(properties).toEqual(expect.arrayContaining(['email', 'password']));
  });
});
