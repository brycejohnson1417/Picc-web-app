import { afterEach, expect, it, vi } from 'vitest';

const { auth, currentUser, bootstrap } = vi.hoisted(() => ({ auth: vi.fn(), currentUser: vi.fn(), bootstrap: vi.fn() }));
vi.mock('@clerk/nextjs/server', () => ({ auth, currentUser }));
vi.mock('@/lib/auth/bootstrap', () => ({ ensureWorkspaceAndMembership: bootstrap }));
vi.mock('@/lib/auth/access-policy', () => ({ evaluateUserAccess: vi.fn(), getSharedWorkspaceId: vi.fn() }));
vi.mock('@/lib/rbac/guards', () => ({ getUserRole: vi.fn() }));
afterEach(() => vi.unstubAllEnvs());

it('refuses production test-key access before authentication or membership writes', async () => {
  vi.resetModules();
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('DEMO_MODE', 'true');
  vi.stubEnv('NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY', 'pk_test_example');
  vi.stubEnv('CLERK_SECRET_KEY', 'sk_test_example');
  const { guard } = await import('./api-guard');
  const result = await guard(['ADMIN']);
  expect('error' in result && result.error?.status).toBe(503);
  expect(auth).not.toHaveBeenCalled();
  expect(bootstrap).not.toHaveBeenCalled();
});
