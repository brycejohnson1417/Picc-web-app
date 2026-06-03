import 'server-only';

import { prisma } from '@/lib/db/prisma';
import {
  matchPreferredPartnerPrice,
  preferredPartnerPriceKey,
  PREFERRED_PARTNER_PRICING,
  type PreferredPartnerPrice,
} from '@/lib/preferred-partner/pricing';
import { fetchNabisJson } from '@/lib/server/nabis-api';
import { resolveAccountIdentity } from '@/lib/server/account-identity';
import { loadTerritoryStoreDetail } from '@/lib/server/notion-territory';

const PAGE_SIZE = 500;
const MAX_ORDER_PAGES = 220;
const ORDER_PAGE_REQUEST_DELAY_MS = 250;
const ORDER_DETAIL_REQUEST_DELAY_MS = 350;
const HISTORICAL_PPP_START_YEAR = 2025;
const CANCELED_STATUSES = new Set(['CANCELED', 'CANCELLED', 'VOID', 'VOIDED', 'REJECTED', 'REFUNDED']);
const INTERNAL_TRANSFER_ACTIONS = new Set(['PICKUP_FROM_NABIS', 'DROPOFF_TO_NABIS', 'INTERNAL_TRANSFER', 'TRANSFER']);

type NabisRawOrderRow = Record<string, unknown>;

type NabisPagedResponse<T> = {
  data?: T[];
  nextPage?: number | null;
};

type CachedOrderHeader = {
  externalOrderId: string;
  orderNumber: string | null;
};

type CachedOrderLine = {
  productName: string;
  quantity: unknown;
  unitPrice: unknown;
  isSample: boolean;
  itemStrain: string | null;
  itemCategory: string | null;
  itemClass: string | null;
};

type CachedOrderWithLines = CachedOrderHeader & {
  orderCreatedDate: Date | null;
  deliveryDate: Date | null;
  orderTotal: unknown;
  status: string | null;
  lines: CachedOrderLine[];
};

type AccountMatchContext = {
  accountId: string | null;
  notionPageId: string;
  accountName: string | null;
  storeName: string;
  names: Set<string>;
  identifiers: Set<string>;
  licenseNumbers: Set<string>;
  retailerIds: Set<string>;
};

type ParsedLine = {
  productName: string;
  quantity: number;
  paidUnitPrice: number;
  paidTotal: number;
  standardUnitPrice: number | null;
  standardTotal: number;
  preferredUnitPrice: number | null;
  preferredTotal: number;
  savings: number;
  standardWholesaleDiscount: number;
  priceKey: string | null;
  matchedPriceLabel: string | null;
};

type PriceBreakdownRow = {
  priceKey: string;
  brand: string;
  size: string;
  quantity: number;
  standardWholesale: number;
  currentPromoPrice: number | null;
  pppPrice: number;
  standardWholesaleTotal: number;
  currentPromoTotal: number;
  pppPricingTotal: number;
};

type CalculatedOrder = {
  orderNumber: string;
  orderDate: string | null;
  paidTotal: number;
  currentPromoTotal: number;
  standardWholesaleTotal: number;
  preferredTotal: number;
  savings: number;
  standardWholesaleDiscount: number;
  lineCount: number;
  matchedLineCount: number;
  unmatchedLineCount: number;
  breakdownRows: PriceBreakdownRow[];
  lines: ParsedLine[];
};

export type PreferredPartnerSavingsResponse = {
  ok: true;
  year: number | null;
  years: number[];
  periodLabel: string;
  calculationMode: 'year' | 'historical';
  accountId: string | null;
  storeName: string;
  primaryContactName: string | null;
  recipientEmail: string | null;
  subject: string;
  script: string;
  scriptHtml: string;
  source: 'nabis-api';
  warning: string | null;
  summary: {
    orderCount: number;
    totalPaid: number;
    totalCurrentPromo: number;
    totalStandardWholesale: number;
    totalPreferred: number;
    totalSavings: number;
    totalStandardWholesaleDiscount: number;
    matchedLineCount: number;
    unmatchedLineCount: number;
  };
  orders: CalculatedOrder[];
};

function normalize(value: string | null | undefined) {
  return value?.trim().toLowerCase().replace(/\s+/g, ' ') || '';
}

function normalizeIdentifier(value: string | null | undefined) {
  return value?.trim().toUpperCase().replace(/\s+/g, '') || '';
}

function addToSet(set: Set<string>, value: string | null | undefined, normalizer = normalizeIdentifier) {
  const normalized = normalizer(value);
  if (normalized) {
    set.add(normalized);
  }
}

function readValue(row: NabisRawOrderRow, candidates: string[]) {
  for (const candidate of candidates) {
    if (Object.prototype.hasOwnProperty.call(row, candidate)) {
      const value = row[candidate];
      if (value !== null && value !== undefined && value !== '') {
        return value;
      }
    }
  }
  return null;
}

function readString(row: NabisRawOrderRow, candidates: string[]) {
  const value = readValue(row, candidates);
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed || null;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  return null;
}

function readNumber(row: NabisRawOrderRow, candidates: string[]) {
  const value = readValue(row, candidates);
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value.replace(/[^0-9.-]/g, ''));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function numberFromUnknown(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value.replace(/[^0-9.-]/g, ''));
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (value && typeof value === 'object' && typeof value.toString === 'function') {
    const parsed = Number.parseFloat(value.toString().replace(/[^0-9.-]/g, ''));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function positiveNumber(value: number | null | undefined) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function sumPositiveNumbers(rows: NabisRawOrderRow[], candidates: string[]) {
  return rows.reduce((sum, row) => sum + (positiveNumber(readNumber(row, candidates)) ?? 0), 0);
}

function readBoolean(row: NabisRawOrderRow, candidates: string[]) {
  const value = readValue(row, candidates);
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    return ['true', 'yes', '1'].includes(value.trim().toLowerCase());
  }
  if (typeof value === 'number') {
    return value === 1;
  }
  return false;
}

function parseDate(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function rowDate(row: NabisRawOrderRow) {
  return parseDate(readString(row, ['createdTimestamp', 'createdDate', 'deliveryDate', 'paidAt']));
}

function orderIdentityKeys(row: NabisRawOrderRow) {
  return ['order', 'orderNumber', 'externalOrderId', 'id']
    .map((field) => normalizeIdentifier(readString(row, [field])))
    .filter((value, index, values): value is string => Boolean(value && values.indexOf(value) === index));
}

function mergeCachedAndLiveOrderRows(cachedRows: NabisRawOrderRow[], liveRows: NabisRawOrderRow[]) {
  if (cachedRows.length === 0) {
    return liveRows;
  }
  if (liveRows.length === 0) {
    return cachedRows;
  }

  const cachedOrderKeys = new Set<string>();
  for (const row of cachedRows) {
    for (const key of orderIdentityKeys(row)) {
      cachedOrderKeys.add(key);
    }
  }

  const liveGroups = new Map<string, { keys: Set<string>; rows: NabisRawOrderRow[] }>();
  liveRows.forEach((row, index) => {
    const keys = orderIdentityKeys(row);
    const groupKey = keys.find((key) => liveGroups.has(key)) ?? keys[0] ?? `__missing_order_key_${index}`;
    const group = liveGroups.get(groupKey) ?? { keys: new Set<string>(), rows: [] };
    for (const key of keys) {
      group.keys.add(key);
    }
    group.rows.push(row);
    liveGroups.set(groupKey, group);
    for (const key of keys) {
      liveGroups.set(key, group);
    }
  });

  const merged = [...cachedRows];
  const appendedGroups = new Set<{ keys: Set<string>; rows: NabisRawOrderRow[] }>();
  for (const group of liveGroups.values()) {
    if (appendedGroups.has(group)) {
      continue;
    }
    appendedGroups.add(group);
    if ([...group.keys].some((key) => cachedOrderKeys.has(key))) {
      continue;
    }
    merged.push(...group.rows);
    for (const key of group.keys) {
      cachedOrderKeys.add(key);
    }
  }

  return merged;
}

function dateKey(date: Date | null) {
  return date ? date.toISOString().slice(0, 10) : null;
}

function currentYear() {
  return new Date().getFullYear();
}

function shouldRefreshLiveRowsForYear(year: number) {
  return year >= currentYear();
}

function resolveSavingsYears(input: { year?: number | null; historical?: boolean | null }) {
  const latestYear = currentYear();
  if (input.historical) {
    return Array.from({ length: Math.max(1, latestYear - HISTORICAL_PPP_START_YEAR + 1) }, (_, index) => HISTORICAL_PPP_START_YEAR + index);
  }

  const year = input.year && input.year >= 2020 && input.year <= latestYear + 1 ? input.year : latestYear;
  return [year];
}

function periodLabel(years: number[]) {
  if (years.length === 0) {
    return String(currentYear());
  }
  if (years.length === 1) {
    return String(years[0]);
  }
  return `${years[0]}-${years[years.length - 1]}`;
}

function yearBounds(year: number) {
  return {
    start: new Date(Date.UTC(year, 0, 1, 0, 0, 0, 0)),
    end: new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999)),
  };
}

function isCanceled(row: NabisRawOrderRow) {
  return CANCELED_STATUSES.has(String(readString(row, ['status']) || '').toUpperCase());
}

function isInternalTransfer(row: NabisRawOrderRow) {
  const action = String(readString(row, ['orderAction', 'action']) || '').toUpperCase().trim();
  if (INTERNAL_TRANSFER_ACTIONS.has(action)) {
    return true;
  }

  const searchableText = [readString(row, ['orderName']), readString(row, ['notes']), readString(row, ['retailer'])]
    .filter(Boolean)
    .join(' ');

  return /\binternal transfer\b|\btransfer to nabis\b|\btransfer from nabis\b/i.test(searchableText);
}

function rowMatchesAccount(row: NabisRawOrderRow, context: AccountMatchContext) {
  const rowRetailerId = normalizeIdentifier(readString(row, ['retailerId', 'licensedLocationId']));
  const rowLicense = normalizeIdentifier(readString(row, ['siteLicenseNumber', 'licenseNumber']));
  const rowRetailerName = normalize(readString(row, ['retailer', 'licensedLocationName']));

  return (
    (rowRetailerId && (context.retailerIds.has(rowRetailerId) || context.identifiers.has(rowRetailerId))) ||
    (rowLicense && (context.licenseNumbers.has(rowLicense) || context.identifiers.has(rowLicense))) ||
    (rowRetailerName && context.names.has(rowRetailerName))
  );
}

function pageIsOlderThanStart(rows: NabisRawOrderRow[], start: Date) {
  const dates = rows.map(rowDate).filter((date): date is Date => Boolean(date));
  if (dates.length === 0) {
    return false;
  }
  return Math.max(...dates.map((date) => date.getTime())) < start.getTime();
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseNabisRows(payload: unknown) {
  if (Array.isArray(payload)) {
    return payload.filter((row): row is NabisRawOrderRow => Boolean(row) && typeof row === 'object');
  }

  if (!payload || typeof payload !== 'object') {
    return [];
  }

  const data = (payload as { data?: unknown }).data;
  if (Array.isArray(data)) {
    return data.filter((row): row is NabisRawOrderRow => Boolean(row) && typeof row === 'object');
  }
  if (data && typeof data === 'object') {
    return [data as NabisRawOrderRow];
  }

  return [payload as NabisRawOrderRow];
}

async function fetchNabisPage(page: number) {
  return (await fetchNabisJson('/v2/ny/order', {
    searchParams: {
      page: String(page),
      limit: String(PAGE_SIZE),
      action: 'DELIVERY_TO_RETAILER',
    },
  })) as NabisPagedResponse<NabisRawOrderRow>;
}

async function fetchNabisOrderRows(order: CachedOrderHeader) {
  const idsToTry = [order.externalOrderId, order.orderNumber].filter((value, index, values): value is string =>
    Boolean(value?.trim() && values.findIndex((candidate) => candidate === value) === index),
  );
  const errors: string[] = [];

  for (const id of idsToTry) {
    try {
      const payload = await fetchNabisJson(`/v2/ny/order/${encodeURIComponent(id)}`);
      const rows = parseNabisRows(payload);
      if (rows.length > 0) {
        return rows;
      }
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }

  throw new Error(errors[0] ?? `Nabis order ${order.externalOrderId} returned no rows.`);
}

async function loadNabisRowsForAccount(context: AccountMatchContext, year: number) {
  const { start, end } = yearBounds(year);
  const rows: NabisRawOrderRow[] = [];
  let page = 0;

  while (page < MAX_ORDER_PAGES) {
    if (page > 0) {
      await wait(ORDER_PAGE_REQUEST_DELAY_MS);
    }

    const payload = await fetchNabisPage(page);
    const pageRows = payload.data ?? [];
    for (const row of pageRows) {
      const date = rowDate(row);
      if (!date || date < start || date > end) {
        continue;
      }
      if (!rowMatchesAccount(row, context) || isCanceled(row) || isInternalTransfer(row)) {
        continue;
      }
      rows.push(row);
    }

    if (!pageRows.length || payload.nextPage == null || payload.nextPage <= page || pageIsOlderThanStart(pageRows, start)) {
      break;
    }

    page = payload.nextPage;
  }

  return rows;
}

function localOrderFilters(context: AccountMatchContext) {
  return [
    context.accountId ? { accountId: context.accountId } : null,
    ...[...context.retailerIds].map((value) => ({ nabisRetailerId: { equals: value, mode: 'insensitive' as const } })),
    ...[...context.identifiers].map((value) => ({ licensedLocationId: { equals: value, mode: 'insensitive' as const } })),
    { licensedLocationName: { equals: context.storeName, mode: 'insensitive' as const } },
    ...(context.accountName ? [{ licensedLocationName: { equals: context.accountName, mode: 'insensitive' as const } }] : []),
  ].filter((filter): filter is NonNullable<typeof filter> => Boolean(filter));
}

async function loadCachedOrdersForAccount(context: AccountMatchContext, year: number) {
  const { start, end } = yearBounds(year);
  const filters = localOrderFilters(context);
  if (filters.length === 0) {
    return [];
  }

  const rows = await prisma.nabisOrder.findMany({
    where: {
      OR: filters,
      isInternalTransfer: false,
      NOT: [...CANCELED_STATUSES].map((status) => ({ status })),
      orderCreatedDate: {
        gte: start,
        lte: end,
      },
    },
    select: {
      externalOrderId: true,
      orderNumber: true,
      orderCreatedDate: true,
      deliveryDate: true,
      orderTotal: true,
      status: true,
      createdAt: true,
      lines: {
        select: {
          productName: true,
          quantity: true,
          unitPrice: true,
          isSample: true,
          itemStrain: true,
          itemCategory: true,
          itemClass: true,
        },
      },
    },
    orderBy: [{ orderCreatedDate: 'asc' }, { deliveryDate: 'asc' }, { createdAt: 'asc' }],
  });

  const seen = new Set<string>();
  return rows.filter((row) => {
    const key = row.externalOrderId.trim() || row.orderNumber?.trim();
    if (!key || seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

export function cachedNabisOrdersToPreferredPartnerRows(orders: CachedOrderWithLines[]) {
  const rows: NabisRawOrderRow[] = [];

  for (const order of orders) {
    const orderNumber = order.orderNumber?.trim() || order.externalOrderId;
    const orderDate = order.orderCreatedDate ?? order.deliveryDate;
    const orderTotal = numberFromUnknown(order.orderTotal);

    for (const line of order.lines) {
      const quantity = numberFromUnknown(line.quantity);
      const unitPrice = numberFromUnknown(line.unitPrice);
      if (!line.productName.trim() || quantity == null || quantity <= 0 || unitPrice == null || unitPrice < 0) {
        continue;
      }

      const lineSubtotal = roundMoney(quantity * unitPrice);
      rows.push({
        id: order.externalOrderId,
        order: orderNumber,
        orderNumber,
        createdTimestamp: orderDate?.toISOString() ?? null,
        deliveryDate: order.deliveryDate?.toISOString() ?? null,
        orderTotal,
        status: order.status,
        skuName: line.productName,
        productName: line.productName,
        units: quantity,
        quantity,
        pricePerUnit: unitPrice,
        unitPrice,
        lineItemSubtotal: lineSubtotal,
        lineItemSubtotalAfterDiscount: lineSubtotal,
        sample: line.isSample,
        isSample: line.isSample,
        itemStrain: line.itemStrain,
        itemCategory: line.itemCategory,
        itemClass: line.itemClass,
      });
    }
  }

  return rows;
}

async function loadNabisRowsFromCachedOrderHeaders(headers: CachedOrderHeader[]) {
  const rows: NabisRawOrderRow[] = [];

  for (const [index, header] of headers.entries()) {
    if (index > 0) {
      await wait(ORDER_DETAIL_REQUEST_DELAY_MS);
    }
    rows.push(...(await fetchNabisOrderRows(header)));
  }

  return rows;
}

function readOrderPaidTotalBeforeCredit(rows: NabisRawOrderRow[], paidFromLines: number) {
  const first = rows[0];
  const orderTotal = positiveNumber(readNumber(first, ['orderTotal']));
  const orderTaxAmount = positiveNumber(readNumber(first, ['orderTaxAmount', 'taxAmount']));
  const taxInclusiveLineTotal = sumPositiveNumbers(rows, ['taxInclusiveLineItemSubtotal']);

  if (orderTotal != null) {
    // Intentionally do not subtract creditMemo. Credits can be refunds, returns, or promos;
    // this email needs the original invoice basis before those credits were applied.
    // Nabis orderTotal is already the tax-inclusive invoice total for these invoices.
    return roundMoney(orderTotal);
  }

  if (taxInclusiveLineTotal > 0) {
    return roundMoney(taxInclusiveLineTotal);
  }

  return roundMoney(paidFromLines + (orderTaxAmount ?? 0));
}

function parseLine(row: NabisRawOrderRow): ParsedLine | null {
  if (readBoolean(row, ['sample', 'isSample', 'lineItemIsSample'])) {
    return null;
  }

  const productName =
    readString(row, ['skuName', 'skuDisplayName', 'productName', 'lineItemProductName', 'skuCode', 'unitDescription']) || 'Unknown SKU';
  if (isNonDiscountableLine(productName)) {
    return null;
  }

  const quantity = readNumber(row, ['units', 'quantity', 'lineItemQuantity']) ?? 0;
  const subtotal = readNumber(row, ['taxInclusiveLineItemSubtotal', 'lineItemSubtotalAfterDiscount', 'lineItemSubtotal']);
  const unitPrice =
    quantity > 0 && subtotal != null
      ? subtotal / quantity
      : readNumber(row, ['skuPricePerUnit', 'lineItemPricePerUnitAfterDiscount', 'pricePerUnit', 'unitPrice', 'lineItemPricePerUnit']);

  if (!Number.isFinite(quantity) || quantity <= 0 || unitPrice == null || !Number.isFinite(unitPrice)) {
    return null;
  }

  const paidTotal = roundMoney(subtotal != null && Number.isFinite(subtotal) ? subtotal : quantity * unitPrice);
  const price = matchPreferredPartnerPrice({
    productName,
    skuName: readString(row, ['skuName']),
    skuDisplayName: readString(row, ['skuDisplayName']),
    skuCode: readString(row, ['skuCode']),
    unitDescription: readString(row, ['unitDescription']),
  });
  const standardUnitPrice = price?.standardWholesale ?? null;
  const standardTotal = standardUnitPrice == null ? paidTotal : roundMoney(standardUnitPrice * quantity);
  const preferredUnitPrice = price?.preferredWholesale ?? null;
  const preferredTotal = preferredUnitPrice == null ? paidTotal : roundMoney(preferredUnitPrice * quantity);
  const savings = preferredUnitPrice == null ? 0 : roundMoney(Math.max(0, paidTotal - preferredTotal));
  const standardWholesaleDiscount =
    preferredUnitPrice == null || standardUnitPrice == null ? 0 : roundMoney(Math.max(0, standardTotal - preferredTotal));

  return {
    productName,
    quantity,
    paidUnitPrice: unitPrice,
    paidTotal,
    standardUnitPrice,
    standardTotal,
    preferredUnitPrice,
    preferredTotal,
    savings,
    standardWholesaleDiscount,
    priceKey: price ? preferredPartnerPriceKey(price) : null,
    matchedPriceLabel: price ? `${price.brand} ${price.size}` : null,
  };
}

function isNonDiscountableLine(productName: string) {
  return /\bstore display\b|\bdisplay\b|\bcollateral\b|\bmerch\b/i.test(productName);
}

function buildBreakdownRows(lines: ParsedLine[]) {
  const grouped = new Map<string, ParsedLine[]>();
  for (const line of lines) {
    if (!line.priceKey) {
      continue;
    }
    const current = grouped.get(line.priceKey) ?? [];
    current.push(line);
    grouped.set(line.priceKey, current);
  }

  return PREFERRED_PARTNER_PRICING.map((price: PreferredPartnerPrice): PriceBreakdownRow => {
    const priceKey = preferredPartnerPriceKey(price);
    const priceLines = grouped.get(priceKey) ?? [];
    const quantity = roundMoney(priceLines.reduce((sum, line) => sum + line.quantity, 0));
    const currentPromoTotal = roundMoney(priceLines.reduce((sum, line) => sum + line.paidTotal, 0));
    const standardWholesaleTotal = roundMoney(price.standardWholesale * quantity);
    const pppPricingTotal = roundMoney(price.preferredWholesale * quantity);

    return {
      priceKey,
      brand: price.displayBrand,
      size: price.weight,
      quantity,
      standardWholesale: price.standardWholesale,
      currentPromoPrice: quantity > 0 ? roundMoney(currentPromoTotal / quantity) : null,
      pppPrice: price.preferredWholesale,
      standardWholesaleTotal,
      currentPromoTotal,
      pppPricingTotal,
    };
  });
}

function summarizeOrder(orderNumber: string, rows: NabisRawOrderRow[]): CalculatedOrder | null {
  const first = rows[0];
  const lines = rows.map(parseLine).filter((line): line is ParsedLine => Boolean(line));
  if (lines.length === 0) {
    return null;
  }

  const paidFromLines = roundMoney(lines.reduce((sum, line) => sum + line.paidTotal, 0));
  const paidTotal = readOrderPaidTotalBeforeCredit(rows, paidFromLines);
  const matchedLineCount = lines.filter((line) => line.preferredUnitPrice != null).length;
  const unmatchedLineCount = lines.filter((line) => line.preferredUnitPrice == null && !isNonDiscountableLine(line.productName)).length;
  const breakdownRows = buildBreakdownRows(lines);
  const currentPromoTotal = roundMoney(breakdownRows.reduce((sum, row) => sum + row.currentPromoTotal, 0));
  const standardWholesaleTotal = roundMoney(breakdownRows.reduce((sum, row) => sum + row.standardWholesaleTotal, 0));
  const preferredTotal = roundMoney(breakdownRows.reduce((sum, row) => sum + row.pppPricingTotal, 0));
  const savings = roundMoney(Math.max(0, currentPromoTotal - preferredTotal));
  const standardWholesaleDiscount = roundMoney(Math.max(0, standardWholesaleTotal - preferredTotal));

  if (matchedLineCount === 0) {
    return null;
  }

  return {
    orderNumber,
    orderDate: dateKey(rowDate(first)),
    paidTotal,
    currentPromoTotal,
    standardWholesaleTotal,
    preferredTotal,
    savings,
    standardWholesaleDiscount,
    lineCount: lines.length,
    matchedLineCount,
    unmatchedLineCount,
    breakdownRows,
    lines,
  };
}

export function calculatePreferredPartnerOrdersFromRows(rows: Array<Record<string, unknown>>) {
  const grouped = new Map<string, NabisRawOrderRow[]>();
  for (const row of rows) {
    const orderNumber = readString(row, ['order', 'orderNumber', 'id']) || 'Unknown';
    const current = grouped.get(orderNumber) ?? [];
    current.push(row);
    grouped.set(orderNumber, current);
  }

  return [...grouped.entries()]
    .map(([orderNumber, orderRows]) => summarizeOrder(orderNumber, orderRows))
    .filter((order): order is CalculatedOrder => Boolean(order))
    .sort((left, right) => String(left.orderDate ?? '').localeCompare(String(right.orderDate ?? '')));
}

function currency(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(value);
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildEmailScript(input: {
  primaryContactName: string | null;
  periodLabel: string;
  calculationMode: 'year' | 'historical';
  totalSavings: number;
  orders: CalculatedOrder[];
}) {
  const greetingName = input.primaryContactName?.trim() || 'there';
  const reportIntro =
    input.calculationMode === 'historical'
      ? `I ran a historical report on your ${input.periodLabel} orders, and you've missed out on roughly ${currency(input.totalSavings)} in savings by not being on our PICC Preferred Partners Program (PPP).`
      : `I ran a quick report on your ${input.periodLabel} orders, and you've missed out on roughly ${currency(input.totalSavings)} in savings so far this year by not being on our PICC Preferred Partners Program (PPP).`;
  const pricingNote =
    input.calculationMode === 'historical'
      ? 'Historical Nabis promo prices are reflected from the actual invoice line totals available for each order date'
      : 'Nabis promo pricing is reflected from the actual invoice line totals available for each order';
  const breakdown =
    input.orders.length === 0
      ? 'No eligible invoiced orders came back for this period.'
      : input.orders
          .map(
            (order) =>
              `Order #${order.orderNumber}${order.orderDate ? ` | ${order.orderDate}` : ''} | Order Total = ${currency(order.paidTotal)}
Estimated Total with PPP Pricing: ${currency(order.preferredTotal)}
Missed Savings (Discount Eligible with PPP Pricing) = ${currency(order.savings)}
PPP Discount Amount (Based on Standard Wholesale Pricing) = ${currency(order.standardWholesaleDiscount)}`,
          )
          .join('\n\n');

  return `Hi ${greetingName},

${reportIntro}

Here's the breakdown:

Your ${input.periodLabel} missed PICC Preferred Partner savings (examples):
Note: These figures are estimates based on order data from your Orders via Nabis Marketplace. ${pricingNote}, and may be subject to slight inaccuracies or edge cases. Happy to provide a detailed breakdown on request.

${breakdown}

Every additional order without becoming a PICC Preferred Partner is more money left on the table. PPP is completely free and built to make reorders easier and reduce risk:
  -No Overstock Guarantee (you won't get stuck with product that doesn't move)
  -Personalized reorder proposals based on your sales data via Headset
  -20% off standard wholesale pricing on every order

One Important Note: Our temporary promotional pricing on Nabis Marketplace is ending soon and prices will return to standard wholesale. Preferred Partners will continue receiving 20% off our standard wholesale - non-PPP accounts will not.

If you want, I can get you set up in 5-10 minutes and apply PPP pricing to your next reorder so the missed savings stop here.

Best next step: Reply "YES" + the best number to reach you. Also tell me the best time to reach out, and we'll get you onboarded in 5-10 minutes.

Best,
{Your Name}
{Title} | PICC Platform
{Phone}`;
}

function buildEmailScriptHtml(input: {
  primaryContactName: string | null;
  periodLabel: string;
  calculationMode: 'year' | 'historical';
  totalSavings: number;
  orders: CalculatedOrder[];
}) {
  const greetingName = escapeHtml(input.primaryContactName?.trim() || 'there');
  const label = escapeHtml(input.periodLabel);
  const totalSavings = escapeHtml(currency(input.totalSavings));
  const greenStyle = 'background:#00ff00;color:#000;font-weight:700;padding:1px 3px;';
  const reportIntro =
    input.calculationMode === 'historical'
      ? `I ran a historical report on your ${label} orders, and <strong><u>you've missed out on roughly ${totalSavings} in savings</u></strong> by not being on our PICC Preferred Partners Program (PPP).`
      : `I ran a quick report on your ${label} orders, and <strong><u>you've missed out on roughly ${totalSavings} in savings so far this year</u></strong> by not being on our PICC Preferred Partners Program (PPP).`;
  const pricingNote =
    input.calculationMode === 'historical'
      ? 'Historical Nabis promo prices are reflected from the actual invoice line totals available for each order date'
      : 'Nabis promo pricing is reflected from the actual invoice line totals available for each order';
  const orderBlocks =
    input.orders.length === 0
      ? '<p style="margin:22px 0 0 0;">No eligible invoiced orders came back for this period.</p>'
      : input.orders
          .map((order) => {
            const orderNumber = escapeHtml(order.orderNumber);
            const dateLabel = order.orderDate ? ` | ${escapeHtml(order.orderDate)}` : '';
            return `<div style="margin:22px 0 0 0;">
  <div><strong>Order #${orderNumber}${dateLabel} | <span style="text-decoration:underline;">Order Total</span> =</strong> ${escapeHtml(currency(order.paidTotal))}</div>
  <div><strong>Estimated Total with PPP Pricing:</strong> ${escapeHtml(currency(order.preferredTotal))}</div>
  <div><span style="${greenStyle}">Missed Savings <em>(Discount Eligible with PPP Pricing)</em> = ${escapeHtml(currency(order.savings))}</span></div>
  <div><span style="${greenStyle}">PPP Discount Amount <em>(Based on Standard Wholesale Pricing)</em> = ${escapeHtml(currency(order.standardWholesaleDiscount))}</span></div>
</div>`;
          })
          .join('');

  return `<div style="font-family:Arial,Helvetica,sans-serif;color:#202124;font-size:14px;line-height:1.45;">
  <p style="margin:0 0 18px 0;">Hi ${greetingName},</p>

  <p style="margin:0 0 18px 0;">${reportIntro}</p>

  <p style="margin:0 0 18px 0;font-size:20px;font-weight:600;">Here's the breakdown:</p>

  <p style="margin:0 0 4px 0;"><strong><u>Your ${label} missed PICC Preferred Partner savings (examples):</u></strong></p>
  <p style="margin:0 0 18px 0;font-size:11px;font-style:italic;"><strong>Note:</strong> These figures are estimates based on order data from your Orders via Nabis Marketplace. ${escapeHtml(pricingNote)}, and may be subject to slight inaccuracies or edge cases. Happy to provide a detailed breakdown on request.</p>

  ${orderBlocks}

  <p style="margin:24px 0 10px 0;">Every additional order without becoming a PICC Preferred Partner means more money left on the table. PPP is completely free and built to make reorders easier and reduce risk:</p>
  <ul style="margin:0 0 14px 28px;padding:0;">
    <li><strong>No Overstock Guarantee</strong> (you won't get stuck with product that doesn't move)</li>
    <li><strong>Personalized reorder proposals</strong> based on your sales data via Headset</li>
    <li><strong>20% off standard wholesale pricing</strong> on <u>every order</u></li>
  </ul>

  <p style="margin:16px 0;"><strong>One Important Note:</strong> <em>Our temporary promotional pricing on Nabis Marketplace is ending soon and prices will return to standard wholesale. Preferred Partners will continue receiving 20% off our standard wholesale - non-PPP accounts will not.</em></p>

  <p style="margin:16px 0;"><strong>If you want, I can get you set up in 5-10 minutes and apply PPP pricing to your next reorder so the missed savings stop here.</strong></p>

  <p style="margin:16px 0;"><strong>Best next step:</strong> Reply "YES" + the best phone number to reach you. Also tell me the best time to reach out, and we'll get you onboarded in 5-10 minutes.</p>

  <p style="margin:16px 0 0 0;">Best,</p>
  <p style="margin:14px 0 0 0;">{Your Name}<br />{Title} | PICC Platform<br />{Phone}</p>
</div>`;
}

function summarize(orders: CalculatedOrder[]) {
  return {
    orderCount: orders.length,
    totalPaid: roundMoney(orders.reduce((sum, order) => sum + order.paidTotal, 0)),
    totalCurrentPromo: roundMoney(orders.reduce((sum, order) => sum + order.currentPromoTotal, 0)),
    totalStandardWholesale: roundMoney(orders.reduce((sum, order) => sum + order.standardWholesaleTotal, 0)),
    totalPreferred: roundMoney(orders.reduce((sum, order) => sum + order.preferredTotal, 0)),
    totalSavings: roundMoney(orders.reduce((sum, order) => sum + order.savings, 0)),
    totalStandardWholesaleDiscount: roundMoney(orders.reduce((sum, order) => sum + order.standardWholesaleDiscount, 0)),
    matchedLineCount: orders.reduce((sum, order) => sum + order.matchedLineCount, 0),
    unmatchedLineCount: orders.reduce((sum, order) => sum + order.unmatchedLineCount, 0),
  };
}

export async function getPreferredPartnerSavings(input: {
  orgId: string;
  accountIdOrPageId: string;
  year?: number | null;
  historical?: boolean | null;
}): Promise<PreferredPartnerSavingsResponse> {
  const years = resolveSavingsYears(input);
  const label = periodLabel(years);
  const calculationMode = input.historical ? 'historical' : 'year';
  const resolved = await resolveAccountIdentity(input.accountIdOrPageId, input.orgId);
  if (!resolved?.notionPageId) {
    const error = new Error('Account not found.');
    (error as Error & { statusCode?: number }).statusCode = 404;
    throw error;
  }

  const [detail, account] = await Promise.all([
    loadTerritoryStoreDetail(resolved.notionPageId),
    resolved.accountId
      ? prisma.account.findUnique({
          where: { id: resolved.accountId },
          select: {
            id: true,
            name: true,
            licenseNumber: true,
            licensedLocationId: true,
            nabisRetailerId: true,
          },
        })
      : null,
  ]);

  const context: AccountMatchContext = {
    accountId: account?.id ?? resolved.accountId ?? null,
    notionPageId: resolved.notionPageId,
    accountName: account?.name ?? null,
    storeName: detail.store.name,
    names: new Set(),
    identifiers: new Set(),
    licenseNumbers: new Set(),
    retailerIds: new Set(),
  };
  addToSet(context.names, detail.store.name, normalize);
  addToSet(context.names, account?.name, normalize);
  addToSet(context.identifiers, detail.store.licenseNumber);
  addToSet(context.identifiers, account?.licensedLocationId);
  addToSet(context.identifiers, account?.nabisRetailerId);
  addToSet(context.identifiers, account?.licenseNumber);
  addToSet(context.licenseNumbers, detail.store.licenseNumber);
  addToSet(context.licenseNumbers, account?.licenseNumber);
  addToSet(context.retailerIds, account?.nabisRetailerId);
  addToSet(context.retailerIds, account?.licensedLocationId);

  let warning: string | null = null;
  let orders: CalculatedOrder[] = [];

  for (const year of years) {
    try {
      const cachedOrders = await loadCachedOrdersForAccount(context, year);
      const cachedRows = cachedNabisOrdersToPreferredPartnerRows(cachedOrders);
      let rows =
        cachedRows.length > 0 ? cachedRows : cachedOrders.length > 0 ? await loadNabisRowsFromCachedOrderHeaders(cachedOrders) : [];

      if (shouldRefreshLiveRowsForYear(year)) {
        const liveRows = await loadNabisRowsForAccount(context, year);
        rows = rows.length > 0 ? mergeCachedAndLiveOrderRows(rows, liveRows) : liveRows;
      } else if (rows.length === 0) {
        rows = await loadNabisRowsForAccount(context, year);
      }

      const yearOrders = calculatePreferredPartnerOrdersFromRows(rows);
      orders.push(...yearOrders);
      if (rows.length > 0 && yearOrders.length === 0) {
        warning = [warning, `${year}: Nabis returned orders, but no eligible line items could be priced.`].filter(Boolean).join(' ');
      }
    } catch (error) {
      const rawMessage = error instanceof Error ? error.message : '';
      const statusMatch = rawMessage.match(/with\s+(\d{3})/i);
      const reason =
        statusMatch?.[1] === '429'
          ? 'Nabis rate limited the request'
          : statusMatch?.[1]
            ? `Nabis returned ${statusMatch[1]}`
            : rawMessage.includes('NABIS_API_KEY')
              ? 'Nabis API credentials are not configured'
              : 'Nabis invoice detail is unavailable';
      const calculationError = new Error(
        `${reason}. No PPP email was generated because live Nabis invoice totals are required for credit memo, tax accuracy, and historical promo pricing.`,
      );
      (calculationError as Error & { statusCode?: number }).statusCode = 424;
      throw calculationError;
    }
  }
  orders = orders.sort((left, right) => String(left.orderDate ?? '').localeCompare(String(right.orderDate ?? '')));

  const summary = summarize(orders);
  const primaryContactName = detail.crm.primaryContactName || detail.crm.primaryContactBuyer || detail.contacts[0]?.name || null;
  const recipientEmail = detail.crm.primaryContactEmail || detail.crm.contactEmail || detail.contacts[0]?.email || null;
  const subject = `PICC Preferred Partner savings for ${detail.store.name}`;
  const script = buildEmailScript({
    primaryContactName,
    periodLabel: label,
    calculationMode,
    totalSavings: summary.totalSavings,
    orders,
  });
  const scriptHtml = buildEmailScriptHtml({
    primaryContactName,
    periodLabel: label,
    calculationMode,
    totalSavings: summary.totalSavings,
    orders,
  });

  return {
    ok: true,
    year: calculationMode === 'year' ? years[0] : null,
    years,
    periodLabel: label,
    calculationMode,
    accountId: context.accountId,
    storeName: detail.store.name,
    primaryContactName,
    recipientEmail,
    subject,
    script,
    scriptHtml,
    source: 'nabis-api',
    warning:
      summary.unmatchedLineCount > 0
        ? [warning, `${summary.unmatchedLineCount} line item${summary.unmatchedLineCount === 1 ? '' : 's'} did not match the PPP price guide.`]
            .filter(Boolean)
            .join(' ')
        : warning,
    summary,
    orders,
  };
}
