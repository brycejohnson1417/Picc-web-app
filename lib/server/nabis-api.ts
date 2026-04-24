import 'server-only';

const DEFAULT_API_BASE_URL = 'https://platform-api.nabis.pro';
const DEFAULT_PAGE_LIMIT = 500;

export type NabisPagedResponse<T> = {
  data?: T[];
  page?: number | null;
  totalCount?: number | null;
  totalNumPages?: number | null;
  nextPage?: number | null;
  prevPage?: number | null;
};

export type NabisPagedFetchResult<T> = {
  rows: T[];
  pages: Array<{
    page: number;
    rowCount: number;
    nextPage: number | null;
    totalCount: number | null;
    totalNumPages: number | null;
  }>;
  totalCount: number | null;
  totalNumPages: number | null;
};

export type NabisApiCapability = {
  id: string;
  label: string;
  method: 'GET';
  path: string;
  region: 'NY' | 'GLOBAL';
  paged: boolean;
  writable: false;
  status: 'supported' | 'documented-unavailable';
};

export const NABIS_API_CAPABILITIES: NabisApiCapability[] = [
  {
    id: 'ny-inventory-list',
    label: 'Get Many Inventory (NY)',
    method: 'GET',
    path: '/v2/ny/inventory',
    region: 'NY',
    paged: true,
    writable: false,
    status: 'supported',
  },
  {
    id: 'ny-inventory-by-product-code',
    label: 'Get Inventory by Product Code (NY)',
    method: 'GET',
    path: '/v2/ny/inventory/{itemCode}',
    region: 'NY',
    paged: false,
    writable: false,
    status: 'supported',
  },
  {
    id: 'ny-retailer-list',
    label: 'Get Many Retailers (NY)',
    method: 'GET',
    path: '/v2/ny/retailer',
    region: 'NY',
    paged: true,
    writable: false,
    status: 'supported',
  },
  {
    id: 'ny-retailer-by-nabis-id',
    label: 'Get Retailer by Nabis ID (NY)',
    method: 'GET',
    path: '/v2/ny/retailer/{id}',
    region: 'NY',
    paged: false,
    writable: false,
    status: 'supported',
  },
  {
    id: 'ny-order-list',
    label: 'Get Many Orders (NY)',
    method: 'GET',
    path: '/v2/ny/order',
    region: 'NY',
    paged: true,
    writable: false,
    status: 'supported',
  },
  {
    id: 'ny-order-by-nabis-id',
    label: 'Get Order by Nabis ID (NY)',
    method: 'GET',
    path: '/v2/ny/order/{id}',
    region: 'NY',
    paged: false,
    writable: false,
    status: 'supported',
  },
  {
    id: 'ny-warehouse-list',
    label: 'Get Many Warehouses (NY)',
    method: 'GET',
    path: '/v2/ny/warehouses',
    region: 'NY',
    paged: false,
    writable: false,
    status: 'supported',
  },
  {
    id: 'nabis-days-off-list',
    label: 'Get Nabis Days Off',
    method: 'GET',
    path: '/v2/nabis-days-off',
    region: 'GLOBAL',
    paged: false,
    writable: false,
    status: 'supported',
  },
  {
    id: 'ny-invoice-list',
    label: 'Get Many Invoices (NY)',
    method: 'GET',
    path: '/v2/ny/invoice',
    region: 'NY',
    paged: true,
    writable: false,
    status: 'documented-unavailable',
  },
];

export const NABIS_NY_RETAILER_SCOPE_NOTE =
  'NY retailer rows are Nabis ecosystem counterparties, not a dispensary-only source of truth. Account-specific retail workflows should reconcile them against CRM accounts, order destinations, and license data.';

export function getNabisApiBaseUrl() {
  return process.env.NABIS_API_BASE_URL?.trim() || DEFAULT_API_BASE_URL;
}

export function getNabisApiKey() {
  return process.env.NABIS_API_KEY?.trim() || null;
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function retryDelayMs(response: Response, attempt: number) {
  const retryAfter = Number.parseInt(response.headers.get('retry-after') || '', 10);
  if (Number.isFinite(retryAfter) && retryAfter > 0) {
    return Math.min(retryAfter * 1000, 30000);
  }
  return Math.min(1500 * 2 ** attempt, 30000);
}

export async function fetchNabisJson(path: string, options?: { searchParams?: Record<string, string>; timeoutMs?: number }) {
  const apiKey = getNabisApiKey();
  if (!apiKey) {
    throw new Error('NABIS_API_KEY is not configured.');
  }

  const url = new URL(path, getNabisApiBaseUrl());
  for (const [key, value] of Object.entries(options?.searchParams ?? {})) {
    url.searchParams.set(key, value);
  }

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const timeoutMs = options?.timeoutMs;
    const controller = timeoutMs ? new AbortController() : null;
    const timeout = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;

    try {
      const response = await fetch(url, {
        headers: {
          'x-nabis-access-token': apiKey,
        },
        signal: controller?.signal,
        cache: 'no-store',
      });

      if (timeout) {
        clearTimeout(timeout);
      }

      if ((response.status === 429 || response.status >= 500) && attempt < 5) {
        await wait(retryDelayMs(response, attempt));
        continue;
      }

      if (!response.ok) {
        throw new Error(`Nabis request failed with ${response.status} for ${path}.`);
      }

      return (await response.json()) as unknown;
    } catch (error) {
      if (timeout) {
        clearTimeout(timeout);
      }

      const message = error instanceof Error ? error.message : String(error);
      const retryableAbort = (error as Error)?.name === 'AbortError' || /fetch failed/i.test(message);
      if (attempt < 5 && retryableAbort) {
        await wait(500 * (attempt + 1));
        continue;
      }
      throw error;
    }
  }

  throw new Error(`Nabis request exhausted retries for ${path}.`);
}

function responseRows<T>(payload: unknown) {
  if (Array.isArray(payload)) {
    return payload.filter((row): row is T => Boolean(row) && typeof row === 'object');
  }

  const data = (payload as NabisPagedResponse<T> | null)?.data;
  return Array.isArray(data) ? data.filter((row): row is T => Boolean(row) && typeof row === 'object') : [];
}

export async function fetchNabisPaged<T>(
  path: string,
  options?: {
    searchParams?: Record<string, string>;
    limit?: number;
    maxPages?: number;
    pageDelayMs?: number;
    timeoutMs?: number;
  },
): Promise<NabisPagedFetchResult<T>> {
  const rows: T[] = [];
  const pages: NabisPagedFetchResult<T>['pages'] = [];
  const limit = Math.min(Math.max(Math.trunc(options?.limit ?? DEFAULT_PAGE_LIMIT), 1), DEFAULT_PAGE_LIMIT);
  const maxPages = Math.max(Math.trunc(options?.maxPages ?? 40), 1);
  const pageDelayMs = Math.max(Math.trunc(options?.pageDelayMs ?? 150), 0);
  let page = 0;
  let totalCount: number | null = null;
  let totalNumPages: number | null = null;

  for (let pageIndex = 0; pageIndex < maxPages; pageIndex += 1) {
    if (pageIndex > 0 && pageDelayMs > 0) {
      await wait(pageDelayMs);
    }

    const payload = (await fetchNabisJson(path, {
      searchParams: {
        ...(options?.searchParams ?? {}),
        page: String(page),
        limit: String(limit),
      },
      timeoutMs: options?.timeoutMs,
    })) as NabisPagedResponse<T>;

    const pageRows = responseRows<T>(payload);
    rows.push(...pageRows);
    totalCount = payload.totalCount ?? totalCount;
    totalNumPages = payload.totalNumPages ?? totalNumPages;
    pages.push({
      page,
      rowCount: pageRows.length,
      nextPage: payload.nextPage ?? null,
      totalCount: payload.totalCount ?? null,
      totalNumPages: payload.totalNumPages ?? null,
    });

    if (!pageRows.length || payload.nextPage == null || payload.nextPage <= page) {
      break;
    }

    page = payload.nextPage;
  }

  return {
    rows,
    pages,
    totalCount,
    totalNumPages,
  };
}

export async function loadNyInventoryRows(options?: { maxPages?: number; pageDelayMs?: number }) {
  return fetchNabisPaged<Record<string, unknown>>('/v2/ny/inventory', {
    limit: DEFAULT_PAGE_LIMIT,
    maxPages: options?.maxPages ?? 20,
    pageDelayMs: options?.pageDelayMs ?? 4100,
    timeoutMs: 30000,
  });
}

export async function loadNyInventoryByProductCode(itemCode: string) {
  return fetchNabisJson(`/v2/ny/inventory/${encodeURIComponent(itemCode)}`, {
    timeoutMs: 30000,
  });
}

export async function loadNyRetailers(options?: { maxPages?: number; pageDelayMs?: number }) {
  return fetchNabisPaged<Record<string, unknown>>('/v2/ny/retailer', {
    limit: DEFAULT_PAGE_LIMIT,
    maxPages: options?.maxPages ?? 40,
    pageDelayMs: options?.pageDelayMs ?? 150,
    timeoutMs: 30000,
  });
}

export async function loadNyRetailerByNabisId(id: string) {
  return fetchNabisJson(`/v2/ny/retailer/${encodeURIComponent(id)}`, {
    timeoutMs: 30000,
  });
}

export async function loadNyOrders(options?: { searchParams?: Record<string, string>; maxPages?: number; pageDelayMs?: number }) {
  return fetchNabisPaged<Record<string, unknown>>('/v2/ny/order', {
    searchParams: options?.searchParams,
    limit: DEFAULT_PAGE_LIMIT,
    maxPages: options?.maxPages ?? 220,
    pageDelayMs: options?.pageDelayMs ?? 175,
    timeoutMs: 30000,
  });
}

export async function loadNyOrderByNabisId(id: string) {
  return fetchNabisJson(`/v2/ny/order/${encodeURIComponent(id)}`, {
    timeoutMs: 30000,
  });
}

export async function loadNyWarehouseRows() {
  const payload = await fetchNabisJson('/v2/ny/warehouses', { timeoutMs: 30000 });
  return responseRows<Record<string, unknown>>(payload);
}

export async function loadNabisDaysOffRows() {
  const payload = await fetchNabisJson('/v2/nabis-days-off', { timeoutMs: 30000 });
  return responseRows<Record<string, unknown>>(payload);
}
