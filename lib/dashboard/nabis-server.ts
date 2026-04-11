import 'server-only';

import { prisma } from '@/lib/db/prisma';
import type { NabisDashboardMetadata, NabisDashboardResponse, SerializedNabisOrder } from '@/lib/dashboard/nabis-types';

const apiCache = new Map<string, { cachedAt: number; payload: Omit<NabisDashboardResponse, 'orders'> & { orders: Array<Omit<SerializedNabisOrder, 'matchedAccountId' | 'matchedAccountName'>> } }>();

const PAGE_SIZE = 500;
const CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_PAGES_SCANNED = 200;
const DEFAULT_API_BASE_URL = 'https://platform-api.nabis.pro';

const EXCLUDED_CUSTOMER_NAMES = new Set([
  'california fragrance company inc',
  'california fragrance company, inc.',
]);

const SALES_REP_NAME_OVERRIDES = new Map([
  ['b.rosenthal@piccplatform.com', 'Benjamin Rosenthal'],
  ['donovan@piccplatform.com', 'Donovan Snyder'],
  ['roxy@piccplatform.com', 'Roxy Adviento'],
  ['eric@piccplatform.com', 'Eric Acosta'],
  ['bryce@piccplatform.com', 'Bryce Johnson'],
  ['mm@piccplatform.com', 'Matthew Masi'],
]);

const INTERNAL_TRANSFER_ACTIONS = new Set([
  'PICKUP_FROM_NABIS',
  'DROPOFF_TO_NABIS',
  'INTERNAL_TRANSFER',
  'TRANSFER',
]);

const INTERNAL_TRANSFER_PATTERNS = [/\binternal transfer\b/i, /\btransfer to nabis\b/i, /\btransfer from nabis\b/i];

const CANCELED_STATUSES = new Set(['CANCELED', 'CANCELLED', 'VOID', 'VOIDED', 'REJECTED', 'REFUNDED']);

type NabisApiOrderRow = {
  id?: string | number | null;
  order?: string | number | null;
  createdDate?: string | null;
  createdTimestamp?: string | null;
  status?: string | null;
  retailer?: string | null;
  soldBy?: string | null;
  orderTotal?: string | number | null;
  orderSubtotal?: string | number | null;
  wholesaleValue?: string | number | null;
  creditMemo?: string | number | null;
  lineItemSubtotalAfterDiscount?: string | number | null;
  lineItemSubtotal?: string | number | null;
  orderAction?: string | null;
  orderName?: string | null;
  notes?: string | null;
  licensedLocationId?: string | null;
  retailerId?: string | null;
  siteLicenseNumber?: string | null;
};

type NormalizedOrder = Omit<SerializedNabisOrder, 'matchedAccountId' | 'matchedAccountName'> & {
  isInternalTransfer: boolean;
};

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function titleCase(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function normalizeRepName(soldBy: string | null | undefined) {
  if (!soldBy || typeof soldBy !== 'string') {
    return 'Unassigned';
  }

  const normalized = soldBy.trim();
  const override = SALES_REP_NAME_OVERRIDES.get(normalized.toLowerCase());
  if (override) {
    return override;
  }

  const candidate = normalized.includes('@') ? normalized.split('@')[0] : normalized;
  return titleCase(candidate.replace(/[._-]+/g, ' '));
}

function parseCurrency(value: unknown) {
  const numeric = Number.parseFloat(String(value ?? '0').replace(/[^0-9.-]/g, ''));
  return Number.isFinite(numeric) ? numeric : 0;
}

function isExcludedCustomer(customerName: string | null | undefined) {
  return EXCLUDED_CUSTOMER_NAMES.has(String(customerName || '').toLowerCase().trim());
}

function getOrderNetSalesFromRow(row: NabisApiOrderRow) {
  const orderTotal = parseCurrency(row.orderTotal);
  const orderSubtotal = parseCurrency(row.orderSubtotal);
  const wholesaleValue = parseCurrency(row.wholesaleValue);
  const creditMemo = parseCurrency(row.creditMemo);

  if (orderTotal > 0) {
    return Math.max(0, orderTotal - creditMemo);
  }

  if (orderSubtotal > 0) {
    return Math.max(0, orderSubtotal - creditMemo);
  }

  if (wholesaleValue > 0) {
    return Math.max(0, wholesaleValue - creditMemo);
  }

  return Math.max(0, parseCurrency(row.lineItemSubtotalAfterDiscount || row.lineItemSubtotal));
}

function getLicensedLocationIdFromRow(row: NabisApiOrderRow) {
  return row.licensedLocationId?.trim() || row.retailerId?.trim() || null;
}

function isInternalTransferRow(row: NabisApiOrderRow) {
  if (isExcludedCustomer(row.retailer)) {
    return true;
  }

  const action = String(row.orderAction || '').toUpperCase().trim();
  if (INTERNAL_TRANSFER_ACTIONS.has(action)) {
    return true;
  }

  const searchableText = [row.orderName, row.notes, row.retailer]
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .join(' ');

  return INTERNAL_TRANSFER_PATTERNS.some((pattern) => pattern.test(searchableText));
}

export function isIsoDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function ensureDateRange(query: { start?: string | null; end?: string | null }) {
  const start = String(query.start || '');
  const end = String(query.end || '');

  if (!isIsoDate(start) || !isIsoDate(end) || start > end) {
    const error = new Error('Use valid start/end dates in YYYY-MM-DD format.');
    (error as Error & { statusCode?: number }).statusCode = 400;
    throw error;
  }

  return { start, end };
}

function getRetryDelayMs(response: Response, attempt: number) {
  const retryAfterHeader = response.headers.get('retry-after');
  const retryAfterSeconds = Number.parseInt(retryAfterHeader || '', 10);
  if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
    return retryAfterSeconds * 1000;
  }
  return Math.min(1000 * 2 ** attempt, 8000);
}

async function fetchOrdersPage({
  page,
  apiKey,
  apiBaseUrl,
}: {
  page: number;
  apiKey: string;
  apiBaseUrl: string;
}) {
  if (!apiKey) {
    const error = new Error('Missing NABIS_API_KEY. Add it to the server environment.');
    (error as Error & { statusCode?: number }).statusCode = 500;
    throw error;
  }

  const url = new URL('/v2/ny/order', apiBaseUrl || DEFAULT_API_BASE_URL);
  url.searchParams.set('page', String(page));
  url.searchParams.set('limit', String(PAGE_SIZE));

  for (let attempt = 0; attempt < 7; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    try {
      const response = await fetch(url, {
        headers: {
          'x-nabis-access-token': apiKey,
        },
        signal: controller.signal,
        cache: 'no-store',
      });

      clearTimeout(timeout);

      if (response.status === 429 && attempt < 6) {
        await wait(getRetryDelayMs(response, attempt));
        continue;
      }

      if (!response.ok) {
        const message = await response.text();
        const error = new Error(`Nabis API request failed (${response.status}). ${message}`);
        (error as Error & { statusCode?: number }).statusCode = response.status;
        throw error;
      }

      return (await response.json()) as {
        data?: NabisApiOrderRow[];
        totalCount?: number;
        totalNumPages?: number;
        nextPage?: number | null;
      };
    } catch (error) {
      clearTimeout(timeout);

      const message = error instanceof Error ? error.message : String(error);
      if (attempt < 6 && ((error as Error)?.name === 'AbortError' || /fetch failed/i.test(message))) {
        await wait(500 * (attempt + 1));
        continue;
      }

      throw error;
    }
  }

  throw new Error('Nabis API request exhausted all retries.');
}

function normalizeOrders(rows: NabisApiOrderRow[]): NormalizedOrder[] {
  const deduped = new Map<string, NormalizedOrder>();

  for (const row of rows) {
    const createdDate = row.createdDate || String(row.createdTimestamp || '').slice(0, 10);
    if (!isIsoDate(createdDate)) {
      continue;
    }

    const orderKey = String(row.order || row.id || '').trim();
    if (!orderKey) {
      continue;
    }

    const status = String(row.status || '').toUpperCase();
    const current = deduped.get(orderKey) || {
      id: String(row.id || orderKey),
      orderNumber: orderKey,
      createdDate,
      status,
      customerName: String(row.retailer || 'Unknown Retailer'),
      total: getOrderNetSalesFromRow(row),
      salesRep: normalizeRepName(row.soldBy),
      monthKey: createdDate.slice(0, 7),
      isCanceled: CANCELED_STATUSES.has(status),
      isInternalTransfer: isInternalTransferRow(row),
      // For NY orders, CRM "Licensed Location ID" matches Nabis retailerId.
      // siteLicenseNumber is the OCM license number and must not be used as this key.
      licensedLocationId: getLicensedLocationIdFromRow(row),
    };

    current.id = String(row.id || current.id || orderKey);
    current.status = status;
    current.salesRep = normalizeRepName(row.soldBy);
    current.customerName = String(row.retailer || current.customerName || 'Unknown Retailer');
    current.isCanceled = CANCELED_STATUSES.has(status);
    current.isInternalTransfer = current.isInternalTransfer || isInternalTransferRow(row);
    current.total = Math.max(current.total, getOrderNetSalesFromRow(row));
    current.licensedLocationId = getLicensedLocationIdFromRow(row) || current.licensedLocationId || null;

    deduped.set(orderKey, current);
  }

  return [...deduped.values()].sort((left, right) => {
    if (left.createdDate === right.createdDate) {
      return right.orderNumber.localeCompare(left.orderNumber);
    }
    return right.createdDate.localeCompare(left.createdDate);
  });
}

function filterOrdersByDateRange(orders: NormalizedOrder[], start: string, end: string) {
  return orders.filter((order) => order.createdDate >= start && order.createdDate <= end);
}

function getPageDateBounds(rows: NabisApiOrderRow[]) {
  const dates = rows
    .map((row) => row.createdDate || String(row.createdTimestamp || '').slice(0, 10))
    .filter((value): value is string => isIsoDate(value))
    .sort();

  if (dates.length === 0) {
    return null;
  }

  return {
    oldest: dates[0],
    newest: dates[dates.length - 1],
  };
}

function buildDashboardPayloadFromRows({
  rows,
  start,
  end,
  fetchedAt = new Date().toISOString(),
  totalCount = rows.length,
  totalPages = 1,
  pagesScanned = 1,
  partialScan = false,
  cacheHit = false,
}: {
  rows: NabisApiOrderRow[];
  start: string;
  end: string;
  fetchedAt?: string;
  totalCount?: number;
  totalPages?: number;
  pagesScanned?: number;
  partialScan?: boolean;
  cacheHit?: boolean;
}) {
  const allOrders = normalizeOrders(rows);
  const dateRangeOrders = filterOrdersByDateRange(allOrders, start, end);
  const internalTransferOrders = dateRangeOrders.filter((order) => order.isInternalTransfer).length;
  const canceledOrders = dateRangeOrders.filter((order) => order.isCanceled).length;
  const orders = dateRangeOrders.filter((order) => !order.isInternalTransfer && !order.isCanceled);

  return {
    orders,
    metadata: {
      fetchedAt,
      range: {
        startCreatedAt: start,
        endCreatedAt: end,
      },
      uniqueOrders: orders.length,
      canceledOrders,
      internalTransferOrders,
      lineItems: rows.length,
      totalCount,
      totalPages,
      pagesScanned,
      partialScan,
      cacheHit,
    } satisfies NabisDashboardMetadata,
  };
}

async function getRawDashboardPayload({
  start,
  end,
  forceRefresh = false,
  apiKey = process.env.NABIS_API_KEY || '',
  apiBaseUrl = process.env.NABIS_API_BASE_URL || DEFAULT_API_BASE_URL,
}: {
  start: string;
  end: string;
  forceRefresh?: boolean;
  apiKey?: string;
  apiBaseUrl?: string;
}) {
  const cacheKey = `${start}:${end}`;
  const cached = apiCache.get(cacheKey);

  if (!forceRefresh && cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
    return {
      ...cached.payload,
      metadata: {
        ...cached.payload.metadata,
        cacheHit: true,
      },
    };
  }

  const scannedPages: Array<{ data?: NabisApiOrderRow[]; totalCount?: number; totalNumPages?: number; nextPage?: number | null }> = [];
  let totalCount = 0;
  let totalPages = 0;
  let stoppedBecauseReachedDate = false;
  let page = 0;

  while (page < MAX_PAGES_SCANNED) {
    if (page > 0) {
      await wait(200);
    }

    const pageResult = await fetchOrdersPage({ page, apiKey, apiBaseUrl });
    scannedPages.push(pageResult);

    if (page === 0) {
      totalCount = Number(pageResult.totalCount || 0);
      totalPages = Number(pageResult.totalNumPages || 0);
    }

    const rows = pageResult.data || [];
    const bounds = getPageDateBounds(rows);

    if (!rows.length || !bounds) {
      break;
    }

    if (bounds.newest < start) {
      stoppedBecauseReachedDate = true;
      break;
    }

    page += 1;

    if (pageResult.nextPage == null || (totalPages > 0 && page >= totalPages)) {
      break;
    }
  }

  const allRows = scannedPages.flatMap((pageResult) => pageResult.data || []);
  const payload = buildDashboardPayloadFromRows({
    rows: allRows,
    start,
    end,
    totalCount: totalCount || allRows.length,
    totalPages,
    pagesScanned: scannedPages.length,
    partialScan: !stoppedBecauseReachedDate && totalPages > scannedPages.length,
  });

  apiCache.set(cacheKey, {
    cachedAt: Date.now(),
    payload,
  });

  return payload;
}

function normalizeLicenseNumber(value: string | null | undefined) {
  return value?.trim().toUpperCase() || '';
}

async function attachMatchedAccounts(orgId: string, orders: Array<Omit<SerializedNabisOrder, 'matchedAccountId' | 'matchedAccountName'>>) {
  const accounts = await prisma.account.findMany({
    where: { orgId },
    select: {
      id: true,
      name: true,
      licenseNumber: true,
    },
  });

  const accountByLicense = new Map<string, { id: string; name: string }>();
  for (const account of accounts) {
    const key = normalizeLicenseNumber(account.licenseNumber);
    if (!key || accountByLicense.has(key)) {
      continue;
    }
    accountByLicense.set(key, { id: account.id, name: account.name });
  }

  return orders.map((order) => {
    const matchedAccount = accountByLicense.get(normalizeLicenseNumber(order.licensedLocationId));
    return {
      ...order,
      matchedAccountId: matchedAccount?.id ?? null,
      matchedAccountName: matchedAccount?.name ?? null,
    };
  });
}

export async function getDashboardPayload({
  orgId,
  start,
  end,
  forceRefresh = false,
}: {
  orgId: string;
  start: string;
  end: string;
  forceRefresh?: boolean;
}) {
  const payload = await getRawDashboardPayload({ start, end, forceRefresh });
  const orders = await attachMatchedAccounts(orgId, payload.orders);
  return {
    orders,
    metadata: payload.metadata,
  } satisfies NabisDashboardResponse;
}
