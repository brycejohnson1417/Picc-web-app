import 'server-only';

import { prisma } from '@/lib/db/prisma';
import { loadNabisDaysOffRows, loadNyInventoryRows, loadNyWarehouseRows } from '@/lib/server/nabis-api';
import { resolveAccountIdentity } from '@/lib/server/account-identity';
import { loadTerritoryStoreDetail } from '@/lib/server/notion-territory';

const NY_WHOLESALE_EXCISE_TAX_RATE = 0.09;
const MOCK_ORDER_LEAD_DAYS = 5;
const NABIS_SELLER_NAME = 'California Fragrance Company Inc.';

type NabisInventoryRow = Record<string, unknown>;

type ProductAccumulator = {
  key: string;
  skuCode: string | null;
  productName: string;
  brandName: string;
  unitDescription: string | null;
  inventoryClass: string | null;
  inventoryCategory: string | null;
  casePackSize: number;
  unitPrice: number;
  availableUnits: number;
  sourceWarehouseIds: Set<string>;
  batchCount: number;
  batchCode: string | null;
  batchExpirationDate: string | null;
  batchLicenseNumber: string | null;
  latestInventoryAt: string | null;
};

export type MockOrderProposalLine = {
  skuCode: string | null;
  productName: string;
  brandName: string;
  unitDescription: string | null;
  inventoryClass: string | null;
  inventoryCategory: string | null;
  casePackSize: number;
  cases: number;
  units: number;
  unitPrice: number;
  caseTotal: number;
  availableUnits: number;
  availableCases: number;
  warehouseCount: number;
  sourceWarehouseIds: string[];
  batchCount: number;
  batchCode: string | null;
  batchExpirationDate: string | null;
  batchLicenseNumber: string | null;
  latestInventoryAt: string | null;
};

export type MockOrderProposalOrder = {
  orderType: 'Delivery to retailer';
  sellerName: string;
  poSoNumber: string;
  salesRepName: string | null;
  sourceWarehouseId: string | null;
  sourceWarehouseName: string | null;
  sourceWarehouseRegion: string | null;
  sourceWarehouseLabel: string | null;
  earliestDeliveryDate: string;
  licenseNumber: string | null;
  intakeContactName: string | null;
};

export type MockOrderProposalResponse = {
  ok: true;
  accountId: string | null;
  storeName: string;
  storeAddress: string | null;
  primaryContactName: string | null;
  generatedAt: string;
  source: 'nabis-api';
  nabisDraftOrderSupported: false;
  warning: string | null;
  order: MockOrderProposalOrder;
  summary: {
    sourceRowCount: number;
    eligibleProductCount: number;
    proposedLineCount: number;
    excludedNonProductRowCount: number;
    excludedInsufficientInventoryCount: number;
    totalCases: number;
    totalUnits: number;
    subtotal: number;
    taxRate: number;
    taxTotal: number;
    totalBalanceDue: number;
    inventoryUpdatedAt: string | null;
  };
  lines: MockOrderProposalLine[];
};

function readValue(row: Record<string, unknown>, candidates: string[]) {
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

function readString(row: Record<string, unknown>, candidates: string[]) {
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

function readNumber(row: Record<string, unknown>, candidates: string[]) {
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

function readBoolean(row: Record<string, unknown>, candidates: string[]) {
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

function positiveNumber(value: number | null | undefined) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function normalizeKey(value: string | null | undefined) {
  return value?.trim().toUpperCase().replace(/\s+/g, ' ') || '';
}

function parseDateIso(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function maxIso(left: string | null, right: string | null) {
  if (!left) return right;
  if (!right) return left;
  return left > right ? left : right;
}

function addCalendarDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function formatNyDateKey(date: Date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const part = (type: string) => parts.find((entry) => entry.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

function formatPoSoDate(date: Date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: '2-digit',
    month: 'numeric',
    day: 'numeric',
  }).formatToParts(date);
  const part = (type: string) => parts.find((entry) => entry.type === type)?.value ?? '';
  return `${part('month')}-${part('day')}-${part('year')}`;
}

function weekdayInNewYork(date: Date) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short',
  }).format(date);
}

function isWeekendInNewYork(date: Date) {
  const weekday = weekdayInNewYork(date);
  return weekday === 'Sat' || weekday === 'Sun';
}

function parseDaysOff(rows: Array<Record<string, unknown>>) {
  return new Set(
    rows
      .map((row) => readString(row, ['date', 'day', 'startDate']))
      .filter((value): value is string => Boolean(value))
      .map((value) => value.slice(0, 10)),
  );
}

function calculateEarliestDeliveryDate(generatedAt: Date, daysOffRows: Array<Record<string, unknown>>) {
  const daysOff = parseDaysOff(daysOffRows);
  let candidate = addCalendarDays(generatedAt, MOCK_ORDER_LEAD_DAYS);

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const dateKey = formatNyDateKey(candidate);
    if (!isWeekendInNewYork(candidate) && !daysOff.has(dateKey)) {
      return dateKey;
    }
    candidate = addCalendarDays(candidate, 1);
  }

  return formatNyDateKey(candidate);
}

function warehouseCounts(row: NabisInventoryRow) {
  const value = row.warehouseCounts;
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === 'object');
}

function availableWarehouseCounts(row: NabisInventoryRow) {
  return warehouseCounts(row).filter((warehouse) => (readNumber(warehouse, ['available']) ?? 0) > 0);
}

function warehouseIdFromCount(row: Record<string, unknown>) {
  return readString(row, ['warehouseId', 'id']);
}

function totalAvailableUnits(row: NabisInventoryRow) {
  return warehouseCounts(row).reduce((sum, warehouse) => sum + Math.max(0, readNumber(warehouse, ['available']) ?? 0), 0);
}

function latestInventoryTimestamp(row: NabisInventoryRow) {
  const fromWarehouses = warehouseCounts(row).reduce<string | null>((latest, warehouse) => {
    return maxIso(latest, parseDateIso(warehouse.updatedAt));
  }, null);

  return maxIso(fromWarehouses, parseDateIso(row.skuBatchLastUpdatedDate));
}

function inferBrandName(productName: string) {
  const [brand] = productName.split('|');
  return brand?.trim() || 'PICC';
}

function isNonProductInventory(row: NabisInventoryRow) {
  const type = String(readString(row, ['skuInventoryType']) || '').toUpperCase();
  const searchable = [
    readString(row, ['skuCode']),
    readString(row, ['skuName']),
    readString(row, ['skuDisplayName']),
    readString(row, ['skuInventoryCategory']),
    readString(row, ['skuInventoryClass']),
  ]
    .filter(Boolean)
    .join(' ');

  if (type && type !== 'CANNABIS') {
    return true;
  }

  if (readBoolean(row, ['skuIsSample', 'isSample', 'sample'])) {
    return true;
  }

  return /\bpos\b|\bdisplay\b|\bdummy\b|\bpackaging\b|\bpackage\b|\bmylar\b|\blabel\b|\bsticker\b|\binsert\b|\bcollateral\b|\bmerch\b/i.test(
    searchable,
  );
}

type WarehouseSummary = {
  id: string | null;
  name: string;
  region: string | null;
  label: string;
};

function parseWarehouseRow(row: Record<string, unknown>): WarehouseSummary | null {
  const name = readString(row, ['name', 'warehouseName']);
  if (!name) {
    return null;
  }

  const region = readString(row, ['region', 'state']);
  const id = readString(row, ['id', 'warehouseId']);
  let label = region ? `${name}, ${region}` : name;

  if (/rochester/i.test(name)) {
    label = `${name}, Rochester, NY`;
  } else if (/bronx/i.test(name)) {
    label = `${name}, Bronx, NY`;
  }

  return {
    id,
    name,
    region,
    label,
  };
}

function selectSourceWarehouse(lines: MockOrderProposalLine[], warehouseRows: Array<Record<string, unknown>>) {
  const warehouses = warehouseRows.map(parseWarehouseRow).filter((row): row is WarehouseSummary => Boolean(row));
  const byId = new Map(warehouses.map((warehouse) => [warehouse.id, warehouse]));
  const counts = new Map<string, number>();

  for (const line of lines) {
    for (const warehouseId of line.sourceWarehouseIds) {
      counts.set(warehouseId, (counts.get(warehouseId) ?? 0) + line.units);
    }
  }

  const topWarehouseId = [...counts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] ?? null;
  const selected =
    (topWarehouseId ? byId.get(topWarehouseId) : null) ??
    warehouses.find((warehouse) => /rochester/i.test(warehouse.name)) ??
    warehouses[0] ??
    null;

  return selected;
}

function buildPoSoNumber(storeName: string, generatedAt: Date) {
  return `${storeName} Mock Order - ${formatPoSoDate(generatedAt)}`;
}

function firstTruthy(...values: Array<string | null | undefined>) {
  return values.find((value) => Boolean(value?.trim()))?.trim() ?? null;
}

export function calculateMockOrderProposalFromInventoryRows(rows: Array<Record<string, unknown>>) {
  const products = new Map<string, ProductAccumulator>();
  let excludedNonProductRowCount = 0;

  for (const row of rows) {
    if (isNonProductInventory(row)) {
      excludedNonProductRowCount += 1;
      continue;
    }

    const skuCode = readString(row, ['skuCode']);
    const productName = readString(row, ['skuDisplayName', 'skuName']) || skuCode || 'Unknown SKU';
    const casePackSize = positiveNumber(readNumber(row, ['skuCasePackSize'])) ?? 1;
    const unitPrice = positiveNumber(readNumber(row, ['skuPricePerUnit'])) ?? 0;
    const key = normalizeKey(skuCode) || normalizeKey(productName);

    if (!key || unitPrice <= 0) {
      excludedNonProductRowCount += 1;
      continue;
    }

    const availableUnits = totalAvailableUnits(row);
    const current = products.get(key);
    const latestInventoryAt = latestInventoryTimestamp(row);
    const sourceWarehouseIds = availableWarehouseCounts(row)
      .map(warehouseIdFromCount)
      .filter((value): value is string => Boolean(value));
    const batchCode = readString(row, ['batchCode']);
    const batchExpirationDate = readString(row, ['batchExpirationDate']);
    const batchLicenseNumber = readString(row, ['batchLicenseNumber']);

    if (current) {
      current.availableUnits += availableUnits;
      sourceWarehouseIds.forEach((warehouseId) => current.sourceWarehouseIds.add(warehouseId));
      current.batchCount += 1;
      current.batchCode = current.batchCode ?? batchCode;
      current.batchExpirationDate = current.batchExpirationDate ?? batchExpirationDate;
      current.batchLicenseNumber = current.batchLicenseNumber ?? batchLicenseNumber;
      current.latestInventoryAt = maxIso(current.latestInventoryAt, latestInventoryAt);
      continue;
    }

    products.set(key, {
      key,
      skuCode,
      productName,
      brandName: readString(row, ['skuBrandName']) || inferBrandName(productName),
      unitDescription: readString(row, ['skuUnit']),
      inventoryClass: readString(row, ['skuInventoryClass']),
      inventoryCategory: readString(row, ['skuInventoryCategory']),
      casePackSize,
      unitPrice,
      availableUnits,
      sourceWarehouseIds: new Set(sourceWarehouseIds),
      batchCount: 1,
      batchCode,
      batchExpirationDate,
      batchLicenseNumber,
      latestInventoryAt,
    });
  }

  const productRows = [...products.values()];
  const lines = productRows
    .filter((product) => product.availableUnits >= product.casePackSize)
    .map((product): MockOrderProposalLine => {
      const units = product.casePackSize;
      return {
        skuCode: product.skuCode,
        productName: product.productName,
        brandName: product.brandName,
        unitDescription: product.unitDescription,
        inventoryClass: product.inventoryClass,
        inventoryCategory: product.inventoryCategory,
        casePackSize: product.casePackSize,
        cases: 1,
        units,
        unitPrice: product.unitPrice,
        caseTotal: roundMoney(product.unitPrice * units),
        availableUnits: product.availableUnits,
        availableCases: Math.floor(product.availableUnits / product.casePackSize),
        warehouseCount: product.sourceWarehouseIds.size,
        sourceWarehouseIds: [...product.sourceWarehouseIds],
        batchCount: product.batchCount,
        batchCode: product.batchCode,
        batchExpirationDate: product.batchExpirationDate,
        batchLicenseNumber: product.batchLicenseNumber,
        latestInventoryAt: product.latestInventoryAt,
      };
    })
    .sort((left, right) => {
      const brandSort = left.brandName.localeCompare(right.brandName);
      return brandSort === 0 ? left.productName.localeCompare(right.productName) : brandSort;
    });

  const totalBalanceDue = roundMoney(lines.reduce((sum, line) => sum + line.caseTotal, 0));
  const subtotal = roundMoney(totalBalanceDue / (1 + NY_WHOLESALE_EXCISE_TAX_RATE));
  const taxTotal = roundMoney(totalBalanceDue - subtotal);

  return {
    summary: {
      sourceRowCount: rows.length,
      eligibleProductCount: productRows.length,
      proposedLineCount: lines.length,
      excludedNonProductRowCount,
      excludedInsufficientInventoryCount: productRows.length - lines.length,
      totalCases: lines.reduce((sum, line) => sum + line.cases, 0),
      totalUnits: lines.reduce((sum, line) => sum + line.units, 0),
      subtotal,
      taxRate: NY_WHOLESALE_EXCISE_TAX_RATE,
      taxTotal,
      totalBalanceDue,
      inventoryUpdatedAt: lines.reduce<string | null>((latest, line) => maxIso(latest, line.latestInventoryAt), null),
    },
    lines,
  };
}

export async function getMockOrderProposal(input: {
  orgId: string;
  accountIdOrPageId: string;
}): Promise<MockOrderProposalResponse> {
  const resolved = await resolveAccountIdentity(input.accountIdOrPageId, input.orgId);
  if (!resolved?.notionPageId) {
    const error = new Error('Account not found.');
    (error as Error & { statusCode?: number }).statusCode = 404;
    throw error;
  }

  const [detail, inventoryResult, account, warehouseRows, daysOffRows] = await Promise.all([
    loadTerritoryStoreDetail(resolved.notionPageId),
    loadNyInventoryRows(),
    resolved.accountId
      ? prisma.account.findFirst({
          where: {
            id: resolved.accountId,
            orgId: input.orgId,
          },
          select: {
            licenseNumber: true,
            licensedLocationId: true,
            nabisRetailerId: true,
          },
        })
      : null,
    loadNyWarehouseRows(),
    loadNabisDaysOffRows(),
  ]);
  const proposal = calculateMockOrderProposalFromInventoryRows(inventoryResult.rows);
  const generatedAt = new Date();
  const primaryContactName = detail.crm.primaryContactName || detail.crm.primaryContactBuyer || detail.contacts[0]?.name || null;
  const salesRepName = firstTruthy(detail.crm.rep, detail.store.repNames[0]);
  const sourceWarehouse = selectSourceWarehouse(proposal.lines, warehouseRows);
  const order: MockOrderProposalOrder = {
    orderType: 'Delivery to retailer',
    sellerName: process.env.NABIS_SELLER_NAME?.trim() || NABIS_SELLER_NAME,
    poSoNumber: buildPoSoNumber(detail.store.name, generatedAt),
    salesRepName,
    sourceWarehouseId: sourceWarehouse?.id ?? null,
    sourceWarehouseName: sourceWarehouse?.name ?? null,
    sourceWarehouseRegion: sourceWarehouse?.region ?? null,
    sourceWarehouseLabel: sourceWarehouse?.label ?? null,
    earliestDeliveryDate: calculateEarliestDeliveryDate(generatedAt, daysOffRows),
    licenseNumber: firstTruthy(detail.store.licenseNumber, account?.licenseNumber, account?.licensedLocationId),
    intakeContactName: primaryContactName,
  };

  return {
    ok: true,
    accountId: resolved.accountId ?? null,
    storeName: detail.store.name,
    storeAddress: detail.store.locationAddress ?? detail.store.locationLabel ?? null,
    primaryContactName,
    generatedAt: generatedAt.toISOString(),
    source: 'nabis-api',
    nabisDraftOrderSupported: false,
    warning:
      proposal.lines.length === 0
        ? 'No in-stock cannabis SKUs had enough available inventory for one full case.'
        : 'This PDF is a proposal only. It does not create a Nabis draft order or reserve inventory.',
    order,
    summary: proposal.summary,
    lines: proposal.lines,
  };
}
