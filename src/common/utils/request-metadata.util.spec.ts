import type { Request } from 'express';
import { getRequestMetadata } from './request-metadata.util';

describe('getRequestMetadata', () => {
  it('captures and bounds untrusted client metadata', () => {
    const request = {
      ip: '1'.repeat(60),
      get: jest.fn().mockReturnValue('A'.repeat(600)),
    } as unknown as Request;

    expect(getRequestMetadata(request)).toEqual({
      ipAddress: '1'.repeat(45),
      userAgent: 'A'.repeat(512),
    });
  });

  it('returns null when request metadata is unavailable', () => {
    const request = {
      get: jest.fn().mockReturnValue(undefined),
    } as unknown as Request;

    expect(getRequestMetadata(request)).toEqual({
      ipAddress: null,
      userAgent: null,
    });
  });
});
