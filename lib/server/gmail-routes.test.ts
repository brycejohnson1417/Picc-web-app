import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const contactId = '22222222222242228222222222222222';

function request(path: string, method = 'GET') {
  return new Request(`http://localhost${path}`, { method });
}

function baseMocks(input?: {
  contacts?: Array<{ id?: string; name?: string; email: string }>;
  messages?: Array<Record<string, string>>;
  gmailAccessUnavailable?: boolean;
  gmailStatusUnavailable?: boolean;
}) {
  const prisma = {
    gmailConnection: {
      findUnique: input?.gmailStatusUnavailable
        ? vi.fn().mockRejectedValue(Object.assign(new Error('private database detail'), { code: 'P2021' }))
        : vi.fn().mockResolvedValue({ id: 'gmail-1', mailboxEmail: 'rep@picc.co', status: 'SUCCESS', lastSyncedAt: null, lastError: null }),
      update: vi.fn().mockResolvedValue({}),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    crmContactProfile: {
      upsert: vi.fn().mockResolvedValue({ id: 'profile-1' }),
      update: vi.fn().mockResolvedValue({}),
    },
    crmContactActivity: {
      upsert: vi.fn().mockResolvedValue({}),
      findMany: vi.fn().mockResolvedValue([{ id: 'activity-1', summary: 'Email from Mara', occurredAt: new Date('2026-08-14T10:00:00Z'), externalUrl: 'https://mail.google.com/thread' }]),
    },
  };
  vi.doMock('@/lib/auth/api-guard', () => ({ guard: vi.fn().mockResolvedValue({ orgId: 'org-1', userId: 'user-1', role: 'SALES_REP' }) }));
  vi.doMock('@/lib/db/prisma', () => ({ prisma }));
  vi.doMock('@/lib/server/account-contact-runtime', () => ({
    loadAccountContactRuntime: vi.fn().mockResolvedValue({ contacts: input?.contacts ?? [{ id: contactId, name: 'Mara Vega', email: 'mara@example.com' }] }),
  }));
  vi.doMock('@/lib/server/gmail-connection', () => {
    class GmailNotConnectedError extends Error {}
    class GmailIntegrationUnavailableError extends Error {}
    return {
      GMAIL_SETUP_UNAVAILABLE_MESSAGE: 'Gmail setup is temporarily unavailable. Ask an administrator to finish setup, then try again.',
      GmailNotConnectedError,
      GmailIntegrationUnavailableError,
      getGmailConnectionStatus: input?.gmailStatusUnavailable
        ? vi.fn().mockRejectedValue(new GmailIntegrationUnavailableError('private database detail'))
        : vi.fn().mockResolvedValue({ id: 'gmail-1', mailboxEmail: 'rep@picc.co', status: 'SUCCESS', lastSyncedAt: null, lastError: null }),
      getGmailAccess: input?.gmailAccessUnavailable
        ? vi.fn().mockRejectedValue(new GmailIntegrationUnavailableError('private database detail'))
        : vi.fn().mockResolvedValue({ accessToken: 'access', connection: { id: 'gmail-1', mailboxEmail: 'rep@picc.co' } }),
    };
  });
  vi.doMock('@/lib/server/gmail-provider', () => ({
    gmailConfigurationStatus: vi.fn(() => ({ configured: true, redirectUri: 'https://app.example/callback' })),
    listGmailMessages: vi.fn().mockResolvedValue(input?.messages ?? [{ id: 'message-1', threadId: 'thread-1', from: 'Mara <mara@example.com>', to: 'rep@picc.co', subject: 'Placement', snippet: '', occurredAt: '2026-08-14T10:00:00.000Z', externalUrl: 'https://mail.google.com/thread-1' }]),
  }));
  return prisma;
}

describe('Gmail routes', () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.restoreAllMocks());

  it('reads and disconnects only the signed-in user connection inside the tenant', async () => {
    const prisma = baseMocks();
    const route = await import('@/app/api/integrations/gmail/route');
    const loaded = await route.GET();
    const loadedPayload = await loaded?.json();
    const disconnected = await route.DELETE();

    expect(loaded?.status).toBe(200);
    expect(loadedPayload.connection).toEqual(expect.objectContaining({ mailboxEmail: 'rep@picc.co' }));
    expect(disconnected?.status).toBe(200);
    expect(prisma.gmailConnection.deleteMany).toHaveBeenCalledWith({ where: { orgId: 'org-1', clerkUserId: 'user-1' } });
  });

  it('returns an actionable setup state when Gmail status storage is unavailable', async () => {
    baseMocks({ gmailStatusUnavailable: true });
    const route = await import('@/app/api/integrations/gmail/route');
    const response = await route.GET();
    const payload = await response?.json();

    expect(response?.status).toBe(503);
    expect(payload).toEqual({
      error: 'Gmail setup is temporarily unavailable. Ask an administrator to finish setup, then try again.',
    });
    expect(JSON.stringify(payload)).not.toContain('database');
  });

  it('indexes exact-contact Gmail activity under the current user and tenant', async () => {
    const prisma = baseMocks();
    const provider = await import('@/lib/server/gmail-provider');
    const { POST } = await import('@/app/api/contacts/[contactId]/gmail/route');
    const response = await POST(request(`/api/contacts/${contactId}/gmail`, 'POST'), { params: Promise.resolve({ contactId }) });

    expect(response?.status).toBe(200);
    expect(provider.listGmailMessages).toHaveBeenCalledWith('access', '{from:mara@example.com to:mara@example.com} newer_than:2y', 30);
    expect(prisma.crmContactActivity.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { orgId_actorClerkUserId_providerMessageId: { orgId: 'org-1', actorClerkUserId: 'user-1', providerMessageId: 'message-1' } },
      create: expect.objectContaining({ profileId: 'profile-1', actorClerkUserId: 'user-1', channel: 'EMAIL' }),
    }));
  });

  it('returns only recent mailbox people who are not already CRM contacts', async () => {
    baseMocks({
      contacts: [{ email: 'existing@example.com' }],
      messages: [
        { from: 'Existing <existing@example.com>', to: 'rep@picc.co', occurredAt: '2026-08-14T10:00:00.000Z' },
        { from: 'New Buyer <new@example.com>', to: 'rep@picc.co', occurredAt: '2026-08-13T10:00:00.000Z' },
      ],
    });
    const { GET } = await import('@/app/api/integrations/gmail/suggestions/route');
    const response = await GET();
    const payload = await response?.json();

    expect(response?.status).toBe(200);
    expect(payload.suggestions).toEqual([expect.objectContaining({ email: 'new@example.com', name: 'New Buyer' })]);
  });

  it('does not expose database internals when the Gmail schema is unavailable', async () => {
    baseMocks({ gmailAccessUnavailable: true });

    const { GET } = await import('@/app/api/integrations/gmail/suggestions/route');
    const response = await GET();
    const payload = await response?.json();

    expect(response?.status).toBe(503);
    expect(payload).toEqual({
      error: 'Gmail setup is temporarily unavailable. Ask an administrator to finish setup, then try again.',
    });
    expect(JSON.stringify(payload)).not.toContain('prisma');
    expect(JSON.stringify(payload)).not.toContain('GmailConnection');
  });
});
