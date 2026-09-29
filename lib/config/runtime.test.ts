import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => vi.unstubAllEnvs());

describe('authentication runtime boundary', () => {
  it.each([
    ['production', 'true', 'pk_test_example', 'sk_test_example', false, true],
    ['production', 'false', 'pk_test_example', 'sk_test_example', false, true],
    ['production', 'true', '', '', false, true],
    ['production', 'false', 'pk_live_example', 'sk_test_example', false, true],
    ['production', 'true', 'pk_live_example', 'sk_live_example', false, false],
    ['development', 'true', 'pk_test_example', 'sk_test_example', true, false],
    ['development', 'true', '', '', true, false],
    ['development', 'false', 'pk_test_example', 'sk_test_example', false, false],
    ['development', 'true', 'pk_live_example', 'sk_live_example', false, false],
  ])('%s demo=%s publishable=%s secret=%s', async (environment, demo, publishable, secret, bypass, invalid) => {
    vi.resetModules();
    vi.stubEnv('NODE_ENV', environment);
    vi.stubEnv('DEMO_MODE', demo);
    vi.stubEnv('NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY', publishable);
    vi.stubEnv('CLERK_SECRET_KEY', secret);
    const runtime = await import('./runtime');
    expect(runtime.AUTH_BYPASS_MODE).toBe(bypass);
    expect(runtime.DEMO_MODE).toBe(bypass);
    expect(runtime.PRODUCTION_AUTH_MISCONFIGURED).toBe(invalid);
  });
});
