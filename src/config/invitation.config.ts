import { registerAs } from '@nestjs/config';

export default registerAs('invitation', () => ({
  ttlHours: Number.parseInt(process.env.INVITATION_TTL_HOURS ?? '72', 10),
}));
