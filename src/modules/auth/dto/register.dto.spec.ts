import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { RegisterDto } from './register.dto';

describe('RegisterDto', () => {
  it('trims validated registration fields without changing the password', async () => {
    const input = plainToInstance(RegisterDto, {
      organizationName: ' CodeMind Labs ',
      organizationSlug: ' codemind-labs ',
      name: ' Pradeep Mahto ',
      email: ' pradeep@example.com ',
      password: ' password with spaces ',
    });

    const errors = await validate(input);

    expect(errors).toHaveLength(0);
    expect(input).toMatchObject({
      organizationName: 'CodeMind Labs',
      organizationSlug: 'codemind-labs',
      name: 'Pradeep Mahto',
      email: 'pradeep@example.com',
      password: ' password with spaces ',
    });
  });

  it('rejects an invalid organization slug and a short password', async () => {
    const input = plainToInstance(RegisterDto, {
      organizationName: 'CodeMind Labs',
      organizationSlug: 'CodeMind Labs',
      name: 'Pradeep Mahto',
      email: 'pradeep@example.com',
      password: 'short',
    });

    const errors = await validate(input);
    const properties = errors.map((error) => error.property);

    expect(properties).toEqual(
      expect.arrayContaining(['organizationSlug', 'password']),
    );
  });
});
