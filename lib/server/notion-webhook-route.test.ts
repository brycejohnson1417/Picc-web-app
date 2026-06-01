import { afterEach, describe, expect, it, vi } from 'vitest';
import { Webhook } from 'standardwebhooks';

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

async function signedHeaders(rawBody: string, secret: string) {
  const verifier = new Webhook(secret);
  const date = new Date();
  const signature = await verifier.sign('msg_test', date, rawBody);

  return {
    'webhook-id': 'msg_test',
    'webhook-signature': signature,
    'webhook-timestamp': Math.floor(date.getTime() / 1000).toString(),
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

    const response = await POST(notionRequest(payload, await signedHeaders(rawBody, 'whsec_testsecret')));

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
        {
          'webhook-id': 'msg_test',
          'webhook-signature': 'v1,not-valid',
          'webhook-timestamp': Math.floor(Date.now() / 1000).toString(),
        },
      ),
    );

    expect(response.status).toBe(401);
    expect(enqueueTerritoryStoreSync).not.toHaveBeenCalled();
  });

  it('accepts signed verification tokens without logging the raw token value', async () => {
    setProductionWebhookEnv('whsec_testsecret');
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    const payload = { verification_token: 'raw-token-should-not-be-logged' };
    const rawBody = JSON.stringify(payload);
    const { POST } = await loadRoute();

    const response = await POST(notionRequest(payload, await signedHeaders(rawBody, 'whsec_testsecret')));

    expect(response.status).toBe(200);
    expect(JSON.stringify(infoSpy.mock.calls)).not.toContain('raw-token-should-not-be-logged');
  });
});
