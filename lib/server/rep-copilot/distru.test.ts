// Rep Copilot MCP: Distru boundary tests. Fetch is mocked; the keys used
// here are fake test values and must never appear in any result.

import { describe, expect, it, vi } from 'vitest';
import { createDistruBoundary } from './distru';

const FAKE_MCP_KEY = 'distru_mcp_test_fake_key';
const FAKE_REST_TOKEN = 'rest_test_fake_token';
const NOW = new Date('2026-11-18T12:00:00Z');

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function mcpFetch(products: unknown[]) {
  return vi.fn(async (_url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? '{}')) as { method?: string; id?: number | null };
    if (body.method === 'initialize') {
      return jsonResponse({ jsonrpc: '2.0', id: body.id, result: { protocolVersion: '2025-03-26' } });
    }
    if (body.method === 'notifications/initialized') {
      return new Response(null, { status: 202 });
    }
    if (body.method === 'tools/call') {
      return jsonResponse({
        jsonrpc: '2.0',
        id: body.id,
        result: { structuredContent: { results: products } },
      });
    }
    return jsonResponse({}, 404);
  });
}

describe('Distru boundary (MCP primary)', () => {
  it('reads the catalog over MCP and marks the transport', async () => {
    const fetchFn = mcpFetch([
      { name: 'SMACK 1G', sku: 'SB-1G', quantityAvailable: 40 },
      { name: 'Nom Nom Gummies', sku: 'NN-1', quantityAvailable: 12 },
    ]);
    const boundary = createDistruBoundary({ DISTRU_MCP_API_KEY: FAKE_MCP_KEY }, fetchFn as never, () => NOW);
    expect(boundary.isConfigured()).toBe(true);
    const result = await boundary.getCatalog();
    expect(result?.transport).toBe('mcp');
    expect(result?.data).toEqual([
      { name: 'SMACK 1G', sku: 'SB-1G', available: 40 },
      { name: 'Nom Nom Gummies', sku: 'NN-1', available: 12 },
    ]);
    expect(result?.asOf).toBe(NOW.toISOString());
  });

  it('sends the key as a bearer token and never returns it', async () => {
    const fetchFn = mcpFetch([{ name: 'SMACK 1G', sku: 'SB-1G', quantityAvailable: 1 }]);
    const boundary = createDistruBoundary({ DISTRU_MCP_API_KEY: FAKE_MCP_KEY }, fetchFn as never, () => NOW);
    const result = await boundary.getCatalog();
    const firstInit = (fetchFn.mock.calls[0]?.[1] ?? {}) as RequestInit;
    const headers = (firstInit.headers ?? {}) as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer ' + FAKE_MCP_KEY);
    expect(JSON.stringify(result)).not.toContain(FAKE_MCP_KEY);
  });

  it('caches reads for the TTL window', async () => {
    const fetchFn = mcpFetch([{ name: 'SMACK 1G', sku: 'SB-1G', quantityAvailable: 1 }]);
    const boundary = createDistruBoundary({ DISTRU_MCP_API_KEY: FAKE_MCP_KEY }, fetchFn as never, () => NOW);
    await boundary.getCatalog();
    const callsAfterFirst = fetchFn.mock.calls.length;
    await boundary.getCatalog();
    expect(fetchFn.mock.calls.length).toBe(callsAfterFirst);
  });
});

describe('Distru boundary (REST fallback)', () => {
  it('falls back to REST when the MCP call fails', async () => {
    const fetchFn = vi.fn(async (url: string) => {
      if (url.includes('mcp.distru.com')) throw new Error('mcp unavailable');
      return jsonResponse({
        data: [{ name: 'CHAMPS 1G', sku: 'CH-1G', quantity_available: 7 }],
      });
    });
    const boundary = createDistruBoundary(
      { DISTRU_MCP_API_KEY: FAKE_MCP_KEY, DISTRU_API_TOKEN: FAKE_REST_TOKEN },
      fetchFn as never,
      () => NOW,
    );
    const result = await boundary.getCatalog();
    expect(result?.transport).toBe('rest');
    expect(result?.data).toEqual([{ name: 'CHAMPS 1G', sku: 'CH-1G', available: 7 }]);
    expect(JSON.stringify(result)).not.toContain(FAKE_REST_TOKEN);
  });

  it('uses REST directly when no MCP key is configured', async () => {
    const fetchFn = vi.fn(async () =>
      jsonResponse({ data: [{ name: 'Sushi 1G', sku: 'SU-1G', quantity_active: 3 }] }),
    );
    const boundary = createDistruBoundary({ DISTRU_API_TOKEN: FAKE_REST_TOKEN }, fetchFn as never, () => NOW);
    const result = await boundary.getCatalog();
    expect(result?.transport).toBe('rest');
    expect(result?.data[0].available).toBe(3);
  });
});

describe('Distru boundary (unconfigured)', () => {
  it('reports unconfigured and returns null without calling fetch', async () => {
    const fetchFn = vi.fn(async () => jsonResponse({}));
    const boundary = createDistruBoundary({}, fetchFn as never, () => NOW);
    expect(boundary.isConfigured()).toBe(false);
    expect(await boundary.getCatalog()).toBeNull();
    expect(await boundary.getOpenInvoices({ distruCompanyId: null, storeName: 'Any' })).toBeNull();
    expect(fetchFn).not.toHaveBeenCalled();
  });
});
