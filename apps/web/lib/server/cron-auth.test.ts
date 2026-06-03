import { describe, expect, it } from 'vitest';
import { isCronRequestAuthorized } from '@/lib/server/cron-auth';

function requestWithHeaders(headers: HeadersInit = {}) {
  return new Request('https://piccnewyork.org/api/cron/notion-sync', {
    headers,
  });
}

describe('isCronRequestAuthorized', () => {
  it('fails closed in production when CRON_SECRET is missing even if x-vercel-cron is present', () => {
    const authorized = isCronRequestAuthorized(requestWithHeaders({ 'x-vercel-cron': '1' }), {
      cronSecret: undefined,
      nodeEnv: 'production',
    });

    expect(authorized).toBe(false);
  });

  it('rejects production cron requests when the bearer token is missing or wrong', () => {
    const missing = isCronRequestAuthorized(requestWithHeaders(), {
      cronSecret: 'expected-secret',
      nodeEnv: 'production',
    });
    const wrong = isCronRequestAuthorized(requestWithHeaders({ authorization: 'Bearer wrong-secret' }), {
      cronSecret: 'expected-secret',
      nodeEnv: 'production',
    });

    expect(missing).toBe(false);
    expect(wrong).toBe(false);
  });

  it('accepts production cron requests with the exact configured bearer token', () => {
    const authorized = isCronRequestAuthorized(requestWithHeaders({ authorization: 'Bearer expected-secret' }), {
      cronSecret: 'expected-secret',
      nodeEnv: 'production',
    });

    expect(authorized).toBe(true);
  });

  it('keeps local Vercel cron header behavior when CRON_SECRET is missing outside production', () => {
    const authorized = isCronRequestAuthorized(requestWithHeaders({ 'x-vercel-cron': '1' }), {
      cronSecret: undefined,
      nodeEnv: 'development',
    });

    expect(authorized).toBe(true);
  });
});
