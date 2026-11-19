// Rep Copilot MCP: the Distru boundary (PRD section 4.5).
//
// PICC sells through Distru (Emcann menu) since the November 2026
// distribution switch. This module is the only place the Rep Copilot tools
// talk to Distru. Primary access is Distru's official MCP server
// (https://mcp.distru.com/mcp, Streamable HTTP, Bearer API key from
// DISTRU_MCP_API_KEY). If the MCP path is not configured or fails, the REST
// API (https://app.distru.com/public/v1/, Bearer DISTRU_API_TOKEN) is the
// fallback behind the same interface. Keys come from env only and are never
// included in any return value. Reads are cached for 15 minutes and every
// result carries its as-of timestamp.
//
// Note: PR #211 owns the app-wide Distru connection (lib/distru,
// lib/server/distru-service.ts). This boundary is scoped to the Rep Copilot
// tools behind the DistruBoundary interface so it can be swapped onto that
// module if #211 lands first.

export interface DistruCatalogItem {
  name: string;
  sku: string | null;
  available: number | null;
}

export interface DistruOpenInvoice {
  invoice_number: string;
  amount: number;
  days_overdue: number;
}

export interface DistruResult<T> {
  data: T;
  asOf: string;
  transport: 'mcp' | 'rest';
}

export interface DistruBoundary {
  isConfigured(): boolean;
  getCatalog(): Promise<DistruResult<DistruCatalogItem[]> | null>;
  getOpenInvoices(input: {
    distruCompanyId: string | null;
    storeName: string;
  }): Promise<DistruResult<DistruOpenInvoice[]> | null>;
  getMarketplaceOrders(input: {
    distruCompanyId: string | null;
    storeName: string;
  }): Promise<DistruResult<{ count: number; latestDate: string | null }> | null>;
}

export interface DistruEnv {
  DISTRU_MCP_API_KEY?: string;
  DISTRU_API_TOKEN?: string;
  DISTRU_MCP_ACCOUNT?: string;
  DISTRU_MCP_URL?: string;
  DISTRU_REST_BASE_URL?: string;
}

type FetchFn = typeof fetch;

const CACHE_TTL_MS = 15 * 60 * 1000;
const DEFAULT_MCP_URL = 'https://mcp.distru.com/mcp';
const DEFAULT_REST_BASE = 'https://app.distru.com/public/v1';
// The Distru MCP tools require an account selector; this is the EMCANN
// account the PICC key was issued for. Override with DISTRU_MCP_ACCOUNT.
const DEFAULT_ACCOUNT = 'EMCANN (NY) · Bryce@piccplatform.com';

interface CacheEntry {
  expiresAt: number;
  value: unknown;
}

export function createDistruBoundary(
  env: DistruEnv = process.env as DistruEnv,
  fetchFn: FetchFn = fetch,
  now: () => Date = () => new Date(),
): DistruBoundary {
  const mcpKey = env.DISTRU_MCP_API_KEY?.trim() || null;
  const restToken = env.DISTRU_API_TOKEN?.trim() || null;
  const mcpUrl = env.DISTRU_MCP_URL?.trim() || DEFAULT_MCP_URL;
  const restBase = (env.DISTRU_REST_BASE_URL?.trim() || DEFAULT_REST_BASE).replace(/\/$/, '');
  const account = env.DISTRU_MCP_ACCOUNT?.trim() || DEFAULT_ACCOUNT;
  const cache = new Map<string, CacheEntry>();

  function cached<T>(key: string): T | null {
    const entry = cache.get(key);
    if (!entry || entry.expiresAt <= now().getTime()) return null;
    return entry.value as T;
  }

  function store<T>(key: string, value: T): T {
    cache.set(key, { expiresAt: now().getTime() + CACHE_TTL_MS, value });
    return value;
  }

  async function mcpCallTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    if (!mcpKey) throw new Error('DISTRUMCP key not configured');
    const headers: Record<string, string> = {
      Authorization: 'Bearer ' + mcpKey,
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    };
    let sessionId: string | null = null;

    async function rpc(method: string, params: unknown, id: number | null): Promise<unknown> {
      const response = await fetchFn(mcpUrl, {
        method: 'POST',
        headers: sessionId ? { ...headers, 'Mcp-Session-Id': sessionId } : headers,
        body: JSON.stringify(
          id == null
            ? { jsonrpc: '2.0', method, params }
            : { jsonrpc: '2.0', id, method, params },
        ),
      });
      const sid = response.headers.get('mcp-session-id');
      if (sid) sessionId = sid;
      if (id == null) return null;
      if (!response.ok) throw new Error(`Distru MCP HTTP ${response.status}`);
      const text = await response.text();
      const payload = parseMcpPayload(text, response.headers.get('content-type') ?? '');
      if (payload && typeof payload === 'object' && 'error' in payload) {
        throw new Error(`Distru MCP error: ${JSON.stringify((payload as { error: unknown }).error)}`);
      }
      return (payload as { result?: unknown })?.result ?? null;
    }

    await rpc('initialize', {
      protocolVersion: '2025-03-26',
      capabilities: {},
      clientInfo: { name: 'picc-rep-copilot', version: '1.0.0' },
    }, 1);
    await rpc('notifications/initialized', {}, null);
    const result = (await rpc('tools/call', { name, arguments: args }, 2)) as {
      content?: Array<{ type: string; text?: string }>;
      structuredContent?: unknown;
      isError?: boolean;
    } | null;
    if (!result) return null;
    if (result.isError) throw new Error(`Distru MCP tool ${name} returned an error`);
    if (result.structuredContent != null) return result.structuredContent;
    const textPart = result.content?.find((part) => part.type === 'text' && part.text);
    if (textPart?.text) {
      try {
        return JSON.parse(textPart.text);
      } catch {
        return textPart.text;
      }
    }
    return null;
  }

  function parseMcpPayload(text: string, contentType: string): unknown {
    if (contentType.includes('text/event-stream')) {
      const dataLines = text
        .split('\n')
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trim())
        .filter(Boolean);
      const last = dataLines[dataLines.length - 1];
      return last ? JSON.parse(last) : null;
    }
    return text ? JSON.parse(text) : null;
  }

  function toolArgs(extra: Record<string, unknown>): Record<string, unknown> {
    return {
      intent: 'PICC Rep Copilot store intelligence for a field sales rep',
      userSatisfactionEstimate: 5,
      account,
      ...extra,
    };
  }

  function rowsFrom(payload: unknown): Record<string, unknown>[] {
    if (Array.isArray(payload)) return payload as Record<string, unknown>[];
    if (payload && typeof payload === 'object') {
      const obj = payload as Record<string, unknown>;
      for (const key of ['results', 'items', 'data', 'rows', 'products', 'invoices', 'orders']) {
        if (Array.isArray(obj[key])) return obj[key] as Record<string, unknown>[];
      }
    }
    return [];
  }

  function num(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) return Number(value);
    return null;
  }

  function str(value: unknown): string | null {
    return typeof value === 'string' && value.trim() !== '' ? value : null;
  }

  async function restGet(path: string): Promise<unknown> {
    if (!restToken) throw new Error('Distru REST token not configured');
    const response = await fetchFn(`${restBase}${path}`, {
      headers: { Authorization: 'Bearer ' + restToken, Accept: 'application/json' },
    });
    if (!response.ok) throw new Error(`Distru REST HTTP ${response.status}`);
    return response.json();
  }

  async function getCatalog(): Promise<DistruResult<DistruCatalogItem[]> | null> {
    const hit = cached<DistruResult<DistruCatalogItem[]>>('catalog');
    if (hit) return hit;
    const asOf = now().toISOString();
    if (mcpKey) {
      try {
        const payload = await mcpCallTool('distru-search-products', toolArgs({ limit: 100, status: 'ACTIVE' }));
        const items = rowsFrom(payload)
          .map((row) => ({
            name: str(row.name) ?? str(row.productName) ?? '',
            sku: str(row.sku),
            available: num(row.quantityAvailable) ?? num(row.availableQuantity) ?? num(row.quantity_active),
          }))
          .filter((item) => item.name !== '');
        if (items.length > 0) return store('catalog', { data: items, asOf, transport: 'mcp' as const });
      } catch (error) {
        console.debug('[rep-copilot] Distru MCP catalog failed, trying REST', error);
      }
    }
    if (restToken) {
      try {
        const payload = await restGet('/products');
        const items = rowsFrom(payload)
          .map((row) => ({
            name: str(row.name) ?? '',
            sku: str(row.sku),
            available: num(row.quantity_available) ?? num(row.quantity_active),
          }))
          .filter((item) => item.name !== '');
        if (items.length > 0) return store('catalog', { data: items, asOf, transport: 'rest' as const });
      } catch (error) {
        console.debug('[rep-copilot] Distru REST catalog failed', error);
      }
    }
    return null;
  }

  async function getOpenInvoices(input: {
    distruCompanyId: string | null;
    storeName: string;
  }): Promise<DistruResult<DistruOpenInvoice[]> | null> {
    const cacheKey = `invoices:${input.distruCompanyId ?? input.storeName}`;
    const hit = cached<DistruResult<DistruOpenInvoice[]>>(cacheKey);
    if (hit) return hit;
    const asOf = now().toISOString();
    if (mcpKey) {
      try {
        const payload = await mcpCallTool(
          'distru-search-invoices',
          toolArgs({ search: input.storeName, limit: 50 }),
        );
        const invoices = rowsFrom(payload)
          .map((row) => {
            const balance = num(row.balance) ?? num(row.amountDue) ?? num(row.total) ?? 0;
            const due = str(row.dueDate) ?? str(row.due_date);
            const days = due ? Math.max(0, Math.floor((now().getTime() - new Date(due).getTime()) / 86400000)) : 0;
            return {
              invoice_number: str(row.invoiceNumber) ?? str(row.number) ?? str(row.id) ?? 'unknown',
              amount: balance,
              days_overdue: num(row.daysOverdue) ?? days,
              status: str(row.status) ?? '',
            };
          })
          .filter((inv) => inv.amount > 0 && inv.status.toUpperCase() !== 'PAID')
          .map(({ invoice_number, amount, days_overdue }) => ({ invoice_number, amount, days_overdue }));
        return store(cacheKey, { data: invoices, asOf, transport: 'mcp' as const });
      } catch (error) {
        console.debug('[rep-copilot] Distru MCP invoices failed, trying REST', error);
      }
    }
    if (restToken) {
      try {
        const payload = await restGet('/invoices');
        const invoices = rowsFrom(payload)
          .map((row) => ({
            invoice_number: str(row.invoice_number) ?? str(row.number) ?? str(row.id) ?? 'unknown',
            amount: num(row.balance) ?? num(row.amount_due) ?? 0,
            days_overdue: num(row.days_overdue) ?? 0,
            company: str(row.company_name) ?? str(row.company_id),
          }))
          .filter(
            (inv) =>
              inv.amount > 0 &&
              (input.distruCompanyId
                ? inv.company === input.distruCompanyId || inv.company === input.storeName
                : inv.company === input.storeName),
          )
          .map(({ invoice_number, amount, days_overdue }) => ({ invoice_number, amount, days_overdue }));
        return store(cacheKey, { data: invoices, asOf, transport: 'rest' as const });
      } catch (error) {
        console.debug('[rep-copilot] Distru REST invoices failed', error);
      }
    }
    return null;
  }

  async function getMarketplaceOrders(input: {
    distruCompanyId: string | null;
    storeName: string;
  }): Promise<DistruResult<{ count: number; latestDate: string | null }> | null> {
    const cacheKey = `marketplace:${input.distruCompanyId ?? input.storeName}`;
    const hit = cached<DistruResult<{ count: number; latestDate: string | null }>>(cacheKey);
    if (hit) return hit;
    const asOf = now().toISOString();
    if (mcpKey) {
      try {
        const payload = await mcpCallTool(
          'distru-search-sales-orders',
          toolArgs({ search: input.storeName, limit: 50 }),
        );
        const rows = rowsFrom(payload).filter((row) => {
          const channel = (str(row.channel) ?? str(row.source) ?? str(row.orderType) ?? '').toLowerCase();
          return channel.includes('marketplace') || channel.includes('commerce') || channel.includes('menu');
        });
        const dates = rows
          .map((row) => str(row.createdAt) ?? str(row.orderDate) ?? str(row.created_at))
          .filter((value): value is string => value != null)
          .sort();
        return store(cacheKey, {
          data: { count: rows.length, latestDate: dates[dates.length - 1] ?? null },
          asOf,
          transport: 'mcp' as const,
        });
      } catch (error) {
        console.debug('[rep-copilot] Distru MCP marketplace orders failed', error);
      }
    }
    return null;
  }

  return {
    isConfigured: () => Boolean(mcpKey || restToken),
    getCatalog,
    getOpenInvoices,
    getMarketplaceOrders,
  };
}
