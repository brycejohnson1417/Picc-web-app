import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('Gmail connection access', () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.restoreAllMocks());

  it('classifies a missing Gmail table as integration setup unavailable', async () => {
    vi.doMock('@/lib/db/prisma', () => ({
      prisma: {
        gmailConnection: {
          findUnique: vi.fn().mockRejectedValue(Object.assign(
            new Error('The table `public.GmailConnection` does not exist in the current database.'),
            { code: 'P2021', meta: { table: 'public.GmailConnection' } },
          )),
        },
      },
    }));
    vi.doMock('@/lib/server/gmail-provider', () => ({ refreshGmailAccessToken: vi.fn() }));

    const { getGmailAccess } = await import('@/lib/server/gmail-connection');

    await expect(getGmailAccess('org-1', 'user-1')).rejects.toMatchObject({
      name: 'GmailIntegrationUnavailableError',
      message: 'Gmail setup is temporarily unavailable. Ask an administrator to finish setup, then try again.',
    });
  });

  it('classifies a missing Gmail table while loading Settings status', async () => {
    vi.doMock('@/lib/db/prisma', () => ({
      prisma: {
        gmailConnection: {
          findUnique: vi.fn().mockRejectedValue(Object.assign(new Error('private database detail'), { code: 'P2021' })),
        },
      },
    }));
    vi.doMock('@/lib/server/gmail-provider', () => ({ refreshGmailAccessToken: vi.fn() }));

    const gmailConnection = await import('@/lib/server/gmail-connection');

    expect(typeof gmailConnection.getGmailConnectionStatus).toBe('function');
    await expect(gmailConnection.getGmailConnectionStatus('org-1', 'user-1')).rejects.toMatchObject({
      name: 'GmailIntegrationUnavailableError',
      message: 'Gmail setup is temporarily unavailable. Ask an administrator to finish setup, then try again.',
    });
  });
});
