import type { Request } from 'express';

export interface RequestMetadata {
  ipAddress: string | null;
  userAgent: string | null;
}

export function getRequestMetadata(request: Request): RequestMetadata {
  return {
    ipAddress: request.ip?.slice(0, 45) ?? null,
    userAgent: request.get('user-agent')?.slice(0, 512) ?? null,
  };
}
