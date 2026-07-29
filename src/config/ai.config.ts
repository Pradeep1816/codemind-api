import { registerAs } from '@nestjs/config';

export default registerAs('ai', () => ({
  provider: process.env.AI_PROVIDER ?? 'openai',
  model: process.env.AI_MODEL || undefined,
  apiKey: process.env.AI_API_KEY || undefined,
  baseUrl: process.env.AI_BASE_URL || undefined,
}));
