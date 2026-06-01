import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHmac } from 'node:crypto';

type LoadedRoute = {
  POST: (request: Request) => Promise<Response>;
  enqueueTerritoryStoreSync: ReturnType<typeof vi.fn>;
  syncTerritoryCheckInMirrorByPageId: ReturnType<typeof vi.fn>;
};

function setProductionWebhookEnv(secret?: string) {
  vi.stubEnv('NODE_ENV', 'production');
  if (secret === undefined) {
    vi.stubEnv('NOTION_WEBHOOK_SECRET', '');
  } else {
    vi.stubEnv('NOTION_WEBHOOK_SECRET', secret);
  }
}

async function loadRoute(): Promise<LoadedRoute> {
  vi.resetModules();

  const enqueueTerritoryStoreSync = vi.fn().mockResolvedValue({ queued: true });
  const syncTerritoryCheckInMirrorByPageId = vi.fn().mockResolvedValue({ synced: true });

  vi.doMock('@/lib/server/notion-territory', () => ({
    enqueueTerritoryStoreSync,
    syncTerritoryCheckInMirrorByPageId,
  }));

  const route = await import('../../app/api/webhooks/notion/route');

  return {
    POST: route.POST,
    enqueueTerritoryStoreSync,
    syncTerritoryCheckInMirrorByPageId,
  };
}

function notionRequest(payload: unknown, headers: HeadersInit = {}) {
  return new Request('https://piccnewyork.org/api/webhooks/notion', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...headers,
    },
    body: JSON.stringify(payload),
  });
}

function signedHeaders(rawBody: string, secret: string) {
  return {
    'x-notion-signature': `sha256=${createHmac('sha256', secret).update(rawBody).digest('hex')}`,
  };
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.doUnmock('@/lib/server/notion-territory');
});

describe('Notion webhook route', () => {
  it('rejects production webhooks when NOTION_WEBHOOK_SECRET is missing before queueing work', async () => {
    setProductionWebhookEnv();
    const payload = { type: 'page.updated', entity: { type: 'page', id: 'page_123' } };
    const rawBody = JSON.stringify(payload);
    const { POST, enqueueTerritoryStoreSync } = await loadRoute();

    const response = await POST(notionRequest(payload, signedHeaders(rawBody, 'whsec_testsecret')));

    expect(response.status).toBe(401);
    expect(enqueueTerritoryStoreSync).not.toHaveBeenCalled();
  });

  it('rejects production webhooks missing signature headers before queueing work', async () => {
    setProductionWebhookEnv('whsec_testsecret');
    const { POST, enqueueTerritoryStoreSync } = await loadRoute();

    const response = await POST(notionRequest({ type: 'page.updated', entity: { type: 'page', id: 'page_123' } }));

    expect(response.status).toBe(401);
    expect(enqueueTerritoryStoreSync).not.toHaveBeenCalled();
  });

  it('rejects invalid signatures before queueing work', async () => {
    setProductionWebhookEnv('whsec_testsecret');
    const { POST, enqueueTerritoryStoreSync } = await loadRoute();

    const response = await POST(
      notionRequest(
        { type: 'page.updated', entity: { type: 'page', id: 'page_123' } },
        { 'x-notion-signature': 'sha256=not-valid' },
      ),
    );

    expect(response.status).toBe(401);
    expect(enqueueTerritoryStoreSync).not.toHaveBeenCalled();
  });

  it('accepts unsigned verification tokens without logging the raw token value', async () => {
    setProductionWebhookEnv();
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    const payload = { verification_token: 'raw-token-should-not-be-logged' };
    const { POST } = await loadRoute();

    const response = await POST(notionRequest(payload));

    expect(response.status).toBe(200);
    expect(JSON.stringify(infoSpy.mock.calls)).not.toContain('raw-token-should-not-be-logged');
  });

  it('accepts Notion HMAC-signed page events and queues page sync work', async () => {
    const secret = 'secret_test_verification_token';
    setProductionWebhookEnv(secret);
    const payload = { type: 'page.content_updated', entity: { type: 'page', id: 'page_123' } };
    const rawBody = JSON.stringify(payload);
    const { POST, enqueueTerritoryStoreSync } = await loadRoute();

    const response = await POST(notionRequest(payload, signedHeaders(rawBody, secret)));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ ok: true, queuedPageId: 'page_123', queued: true });
    expect(enqueueTerritoryStoreSync).toHaveBeenCalledWith('page_123', { reason: 'page.content_updated' });
  });
});
