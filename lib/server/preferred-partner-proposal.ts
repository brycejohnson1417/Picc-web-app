import 'server-only';

import * as XLSX from 'xlsx';
import { resolveAccountIdentity } from '@/lib/server/account-identity';
import { loadNabisDaysOffRows, loadNyInventoryRows, loadNyWarehouseRows } from '@/lib/server/nabis-api';
import { loadTerritoryStoreDetail } from '@/lib/server/notion-territory';
import { getPreferredPartnerSavings } from '@/lib/server/preferred-partner-savings';
import { matchPreferredPartnerPrice, preferredPartnerPriceKey, PREFERRED_PARTNER_PRICING, type PreferredPartnerPrice } from '@/lib/preferred-partner/pricing';

const NY_WHOLESALE_EXCISE_TAX_RATE = 0.09;
const NABIS_SELLER_NAME = 'California Fragrance Company Inc.';
const PPP_ORDER_LEAD_DAYS = 5;
const PPP_RESTOCK_INTERVAL_DAYS = 42;
const STRATEGIC_RECENT_SALE_WINDOW_DAYS = 21;

type InputRow = Record<string, unknown>;
type NabisInventoryRow = Record<string, unknown>;

export type PreferredPartnerProposalInputRow = {
  sourceIndex: number;
  storeName: string | null;
  productName: string;
  totalQuantityOnHand: number;
  totalUnitsSold: number;
  avgUnitsPerDay: number | null;
  inStockAvgSalesPerDay: number | null;
  totalSales: number | null;
  estDaysRemaining: number | null;
  minimumSuggestedOrder: number | null;
  lastSale: string | null;
  lastQtyIncreaseDate: string | null;
  percentDaysInStock: number | null;
  potentialLostProfit: number | null;
  price: PreferredPartnerPrice | null;
  priceKey: string | null;
};

export type PreferredPartnerProposalOverviewRow = {
  priceKey: string;
  displayBrand: string;
  productName: string;
  avgUnitsPerDay: number;
  unitsOnHandAtDelivery: number;
  orderAmount: number;
  totalUnitsSold: number;
  potentialLostProfit: number;
};

export type PreferredPartnerProposalLine = {
  skuCode: string | null;
  productName: string;
  brandName: string;
  unitDescription: string | null;
  inventoryClass: string | null;
  inventoryCategory: string | null;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  availableUnits: number;
  availableCases: number;
  casePackSize: number;
  warehouseCount: number;
  sourceWarehouseIds: string[];
  batchCount: number;
  batchCode: string | null;
  batchExpirationDate: string | null;
  batchLicenseNumber: string | null;
  latestInventoryAt: string | null;
  priceKey: string;
  price: PreferredPartnerPrice;
  sourceKind: 'demand' | 'strategic-add';
  matchedHeadsetRows: string[];
};

export type PreferredPartnerProposalBreakdownRow = {
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

type ProposalOrder = {
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
  paymentTerms: 'Net 30';
};

type FamilyDemand = {
  price: PreferredPartnerPrice;
  priceKey: string;
  rows: PreferredPartnerProposalInputRow[];
  strategicRows: PreferredPartnerProposalInputRow[];
  targetUnits: number;
  kind: 'demand' | 'strategic-add';
};

type LiveCandidate = {
  skuCode: string | null;
  productName: string;
  brandName: string;
  unitDescription: string | null;
  inventoryClass: string | null;
  inventoryCategory: string | null;
  casePackSize: number;
  unitPrice: number;
  availableUnits: number;
  availableCases: number;
  warehouseCount: number;
  sourceWarehouseIds: string[];
  batchCount: number;
  batchCode: string | null;
  batchExpirationDate: string | null;
  batchLicenseNumber: string | null;
  latestInventoryAt: string | null;
  price: PreferredPartnerPrice;
  priceKey: string;
};

type WarehouseSummary = {
  id: string | null;
  name: string;
  region: string | null;
  label: string;
};

type HistoricalOrderLine = {
  productName: string;
  quantity: number;
  priceKey: string | null;
};

type HistoricalOrder = {
  orderDate: string | null;
  breakdownRows: Array<{
    priceKey: string;
    quantity: number;
  }>;
  lines: HistoricalOrderLine[];
};

type FamilyHistory = {
  orderCount: number;
  lastQuantity: number;
  averageQuantity: number;
  maxQuantity: number;
  recentProductNames: string[];
  lastLineTargets: Array<{
    productName: string;
    quantity: number;
  }>;
};

export type PreferredPartnerProposalResponse = {
  ok: true;
  accountId: string | null;
  storeName: string;
  storeAddress: string | null;
  primaryContactName: string | null;
  generatedAt: string;
  source: 'headset-report+nabis-api';
  warning: string | null;
  inputSummary: {
    format: 'json' | 'csv';
    rowCount: number;
    parsedRowCount: number;
    matchedRowCount: number;
    demandRowCount: number;
    strategicRowCount: number;
    unmatchedRowCount: number;
    unmatchedProducts: string[];
    omittedDemandFamilies: string[];
  };
  order: ProposalOrder;
  summary: {
    sourceRowCount: number;
    proposedLineCount: number;
    totalUnits: number;
    subtotal: number;
    taxRate: number;
    taxTotal: number;
    creditMemo: number;
    currentPromoTotal: number;
    preferredTotal: number;
    standardWholesaleTotal: number;
    totalBalanceDue: number;
    inventoryUpdatedAt: string | null;
    restockIntervalDays: number;
  };
  overviewRows: PreferredPartnerProposalOverviewRow[];
  breakdownRows: PreferredPartnerProposalBreakdownRow[];
  lines: PreferredPartnerProposalLine[];
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

function compactText(value: string | null | undefined) {
  return value
    ?.toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim() || '';
}

function nameTokens(value: string | null | undefined) {
  return new Set(
    compactText(value)
      .split(' ')
      .filter((token) => token.length >= 3),
  );
}

function tokenOverlapScore(left: string | null | undefined, right: string | null | undefined) {
  const leftTokens = nameTokens(left);
  const rightTokens = nameTokens(right);
  if (leftTokens.size === 0 || rightTokens.size === 0) {
    return 0;
  }

  let overlap = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) {
      overlap += 1;
    }
  }
  return overlap / Math.max(leftTokens.size, rightTokens.size);
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
  let candidate = addCalendarDays(generatedAt, PPP_ORDER_LEAD_DAYS);

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const dateKey = formatNyDateKey(candidate);
    if (!isWeekendInNewYork(candidate) && !daysOff.has(dateKey)) {
      return dateKey;
    }
    candidate = addCalendarDays(candidate, 1);
  }

  return formatNyDateKey(candidate);
}

function parseInputRows(rawInput: string) {
  const trimmed = rawInput.trim();
  if (!trimmed) {
    return { format: 'json' as const, rows: [] as InputRow[] };
  }

  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    const parsed = JSON.parse(trimmed) as unknown;
    if (Array.isArray(parsed)) {
      return {
        format: 'json' as const,
        rows: parsed.filter((row): row is InputRow => Boolean(row) && typeof row === 'object'),
      };
    }
    throw new Error('Expected a JSON array of Headset rows.');
  }

  const workbook = XLSX.read(trimmed, { type: 'string', raw: false });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) {
    return { format: 'csv' as const, rows: [] as InputRow[] };
  }
  const sheet = workbook.Sheets[firstSheetName];
  return {
    format: 'csv' as const,
    rows: XLSX.utils.sheet_to_json<InputRow>(sheet, { defval: null, raw: false }),
  };
}

function normalizeHeadsetRows(rawRows: InputRow[]) {
  return rawRows
    .map((row, index): PreferredPartnerProposalInputRow | null => {
      const productName = readString(row, ['Name', 'Product Name', 'Product']);
      if (!productName) {
        return null;
      }
      const price = matchPreferredPartnerPrice({
        productName,
        skuName: productName,
      });
      return {
        sourceIndex: index,
        storeName: readString(row, ['Store Name', 'Store']),
        productName,
        totalQuantityOnHand: positiveNumber(readNumber(row, ['Total Quantity on Hand', 'Quantity on Hand', 'On Hand'])) ?? 0,
        totalUnitsSold: positiveNumber(readNumber(row, ['Total Units Sold', 'Units Sold'])) ?? 0,
        avgUnitsPerDay: positiveNumber(readNumber(row, ['In Stock Avg Units per Day', 'Avg Units per Day'])),
        inStockAvgSalesPerDay: positiveNumber(readNumber(row, ['In Stock Avg Sales per Day', 'Avg Sales per Day'])),
        totalSales: positiveNumber(readNumber(row, ['Total Sales'])),
        estDaysRemaining: positiveNumber(readNumber(row, ['Est. Days Remaining', 'Estimated Days Remaining'])),
        minimumSuggestedOrder: positiveNumber(readNumber(row, ['Minimum Suggested Order', 'Suggested Order'])),
        lastSale: readString(row, ['Last Sale']),
        lastQtyIncreaseDate: readString(row, ['Last Qty Inc Date', 'Last Qty Increase Date']),
        percentDaysInStock: positiveNumber(readNumber(row, ['Percent Days In Stock'])),
        potentialLostProfit: positiveNumber(readNumber(row, ['Potential Lost Profit'])) ?? 0,
        price,
        priceKey: price ? preferredPartnerPriceKey(price) : null,
      };
    })
    .filter((row): row is PreferredPartnerProposalInputRow => Boolean(row));
}

function demandQuantityForRow(row: PreferredPartnerProposalInputRow, restockIntervalDays: number) {
  if (row.minimumSuggestedOrder != null) {
    return row.minimumSuggestedOrder;
  }
  const avgUnitsPerDay = row.avgUnitsPerDay ?? 0;
  if (avgUnitsPerDay <= 0) {
    return 0;
  }
  return Math.max(0, avgUnitsPerDay * restockIntervalDays - row.totalQuantityOnHand);
}

function isDemandRow(row: PreferredPartnerProposalInputRow, restockIntervalDays: number) {
  return demandQuantityForRow(row, restockIntervalDays) > 0 || row.totalUnitsSold > 0 || (row.avgUnitsPerDay ?? 0) > 0;
}

function strategicFamilyTarget(price: PreferredPartnerPrice) {
  if (price.size === '4-Pack' || price.size === '5-Pack') {
    return 5;
  }
  return 20;
}

function roundFamilyTarget(quantity: number, price: PreferredPartnerPrice) {
  if (quantity <= 0) {
    return 0;
  }
  if (price.size === '4-Pack' || price.size === '5-Pack') {
    return Math.max(1, Math.round(quantity));
  }
  return Math.max(10, Math.round(quantity / 10) * 10);
}

function recentDateWithinDays(value: string | null, days: number) {
  if (!value) {
    return false;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return false;
  }
  const now = Date.now();
  return now - date.getTime() <= days * 24 * 60 * 60 * 1000;
}

function sortHistoricalOrders(orders: HistoricalOrder[]) {
  return [...orders].sort((left, right) => {
    const leftTime = left.orderDate ? new Date(left.orderDate).getTime() : 0;
    const rightTime = right.orderDate ? new Date(right.orderDate).getTime() : 0;
    return rightTime - leftTime;
  });
}

function buildFamilyHistory(orders: HistoricalOrder[]) {
  const byKey = new Map<string, FamilyHistory>();
  const sortedOrders = sortHistoricalOrders(orders);

  for (const order of sortedOrders) {
    const namesByPriceKey = new Map<string, string[]>();
    const lineTargetsByPriceKey = new Map<string, Array<{ productName: string; quantity: number }>>();
    for (const line of order.lines) {
      if (!line.priceKey) continue;
      const current = namesByPriceKey.get(line.priceKey) ?? [];
      current.push(line.productName);
      namesByPriceKey.set(line.priceKey, current);
      const currentTargets = lineTargetsByPriceKey.get(line.priceKey) ?? [];
      currentTargets.push({
        productName: line.productName,
        quantity: line.quantity,
      });
      lineTargetsByPriceKey.set(line.priceKey, currentTargets);
    }

    for (const row of order.breakdownRows) {
      if (!row.priceKey || row.quantity <= 0) continue;
      const current = byKey.get(row.priceKey);
      const recentNames = namesByPriceKey.get(row.priceKey) ?? [];
      if (!current) {
        byKey.set(row.priceKey, {
          orderCount: 1,
          lastQuantity: row.quantity,
          averageQuantity: row.quantity,
          maxQuantity: row.quantity,
          recentProductNames: [...new Set(recentNames)].slice(0, 8),
          lastLineTargets: (lineTargetsByPriceKey.get(row.priceKey) ?? []).slice(0, 12),
        });
        continue;
      }

      const nextOrderCount = current.orderCount + 1;
      current.averageQuantity = roundMoney((current.averageQuantity * current.orderCount + row.quantity) / nextOrderCount);
      current.orderCount = nextOrderCount;
      current.maxQuantity = Math.max(current.maxQuantity, row.quantity);
      current.recentProductNames = [...new Set([...current.recentProductNames, ...recentNames])].slice(0, 8);
    }
  }

  return byKey;
}

function resolveFamilyTargetUnits(family: FamilyDemand, history: FamilyHistory | null) {
  if (!history || history.maxQuantity <= 0) {
    return family.targetUnits;
  }

  if (family.kind === 'strategic-add') {
    return roundFamilyTarget(Math.max(family.targetUnits, history.lastQuantity), family.price);
  }

  return roundFamilyTarget(Math.max(1, history.lastQuantity), family.price);
}

export function buildProposalFamilies(rows: PreferredPartnerProposalInputRow[], restockIntervalDays = PPP_RESTOCK_INTERVAL_DAYS) {
  const byKey = new Map<string, FamilyDemand>();
  const unmatchedProducts: string[] = [];

  for (const row of rows) {
    if (!row.price || !row.priceKey) {
      unmatchedProducts.push(row.productName);
      continue;
    }

    const current = byKey.get(row.priceKey) ?? {
      price: row.price,
      priceKey: row.priceKey,
      rows: [],
      strategicRows: [],
      targetUnits: 0,
      kind: 'demand' as const,
    };

    if (isDemandRow(row, restockIntervalDays)) {
      current.rows.push(row);
      current.targetUnits += demandQuantityForRow(row, restockIntervalDays);
    } else if (row.totalQuantityOnHand > 0) {
      current.strategicRows.push(row);
    }

    byKey.set(row.priceKey, current);
  }

  const families = [...byKey.values()]
    .map((family) => {
      if (family.rows.length > 0) {
        return {
          ...family,
          targetUnits: roundFamilyTarget(family.targetUnits, family.price),
          kind: 'demand' as const,
        };
      }

      const includeStrategic =
        family.strategicRows.length >= 2 ||
        family.strategicRows.reduce((sum, row) => sum + row.totalQuantityOnHand, 0) >= 20 ||
        family.strategicRows.some((row) => recentDateWithinDays(row.lastSale, STRATEGIC_RECENT_SALE_WINDOW_DAYS));

      return {
        ...family,
        targetUnits: includeStrategic ? strategicFamilyTarget(family.price) : 0,
        kind: 'strategic-add' as const,
      };
    })
    .filter((family) => family.targetUnits > 0);

  return {
    families,
    unmatchedProducts,
  };
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

function aggregateLiveCandidates(rows: Array<Record<string, unknown>>) {
  const candidates = new Map<string, LiveCandidate>();

  for (const row of rows) {
    if (isNonProductInventory(row)) {
      continue;
    }

    const skuCode = readString(row, ['skuCode']);
    const productName = readString(row, ['skuDisplayName', 'skuName']) || skuCode || 'Unknown SKU';
    const price = matchPreferredPartnerPrice({
      productName,
      skuName: readString(row, ['skuName']),
      skuDisplayName: readString(row, ['skuDisplayName']),
      skuCode,
      unitDescription: readString(row, ['skuUnit']),
    });
    if (!price) {
      continue;
    }

    const priceKey = preferredPartnerPriceKey(price);
    const unitPrice = positiveNumber(readNumber(row, ['skuPricePerUnit'])) ?? 0;
    const casePackSize = positiveNumber(readNumber(row, ['skuCasePackSize'])) ?? 1;
    const availableUnits = totalAvailableUnits(row);
    if (unitPrice <= 0 || availableUnits <= 0) {
      continue;
    }

    const key = normalizeKey(skuCode) || normalizeKey(productName);
    const current = candidates.get(key);
    const sourceWarehouseIds = availableWarehouseCounts(row)
      .map(warehouseIdFromCount)
      .filter((value): value is string => Boolean(value));
    const latestInventoryAt = latestInventoryTimestamp(row);
    const batchCode = readString(row, ['batchCode']);
    const batchExpirationDate = readString(row, ['batchExpirationDate']);
    const batchLicenseNumber = readString(row, ['batchLicenseNumber']);

    if (current) {
      current.availableUnits += availableUnits;
      current.availableCases = Math.floor(current.availableUnits / current.casePackSize);
      current.sourceWarehouseIds = [...new Set([...current.sourceWarehouseIds, ...sourceWarehouseIds])];
      current.warehouseCount = current.sourceWarehouseIds.length;
      current.batchCount += 1;
      current.batchCode = current.batchCode ?? batchCode;
      current.batchExpirationDate = current.batchExpirationDate ?? batchExpirationDate;
      current.batchLicenseNumber = current.batchLicenseNumber ?? batchLicenseNumber;
      current.latestInventoryAt = maxIso(current.latestInventoryAt, latestInventoryAt);
      continue;
    }

    candidates.set(key, {
      skuCode,
      productName,
      brandName: readString(row, ['skuBrandName']) || inferBrandName(productName),
      unitDescription: readString(row, ['skuUnit']),
      inventoryClass: readString(row, ['skuInventoryClass']),
      inventoryCategory: readString(row, ['skuInventoryCategory']),
      casePackSize,
      unitPrice,
      availableUnits,
      availableCases: Math.floor(availableUnits / casePackSize),
      warehouseCount: sourceWarehouseIds.length,
      sourceWarehouseIds,
      batchCount: 1,
      batchCode,
      batchExpirationDate,
      batchLicenseNumber,
      latestInventoryAt,
      price,
      priceKey,
    });
  }

  return [...candidates.values()];
}

function scoreCandidate(candidate: LiveCandidate, family: FamilyDemand, history: FamilyHistory | null) {
  const sourceNames = [...family.rows, ...family.strategicRows].map((row) => row.productName);
  const bestNameScore = sourceNames.reduce((best, name) => Math.max(best, tokenOverlapScore(candidate.productName, name)), 0);
  const strategicBoost = family.strategicRows.some((row) => tokenOverlapScore(candidate.productName, row.productName) > 0.45) ? 0.35 : 0;
  const historicalBoost =
    history?.recentProductNames.some((name) => tokenOverlapScore(candidate.productName, name) > 0.45) ? 0.55 : 0;
  const availabilityBoost = Math.min(candidate.availableUnits / 500, 0.25);
  return bestNameScore + strategicBoost + historicalBoost + availabilityBoost;
}

function chooseCandidateCount(family: FamilyDemand, availableCount: number, history: FamilyHistory | null) {
  if (availableCount <= 1) {
    return availableCount;
  }
  const historicalCount = history?.lastLineTargets.length ?? 0;
  if (historicalCount > 0) {
    return Math.min(availableCount, Math.max(1, historicalCount));
  }
  if (family.price.size === '4-Pack' || family.price.size === '5-Pack') {
    return family.targetUnits > 10 ? 2 : 1;
  }
  if (family.targetUnits >= 100 || family.rows.length >= 2 || family.strategicRows.length >= 2) {
    return 2;
  }
  return 1;
}

function allocateWholeCaseUnits(totalUnits: number, casePackSizes: number[], availableUnits: number[]) {
  if (totalUnits <= 0 || casePackSizes.length === 0) {
    return [];
  }
  const allocations = new Array(casePackSizes.length).fill(0);
  const availableCases = casePackSizes.map((size, index) => Math.floor((availableUnits[index] ?? 0) / Math.max(1, size)));
  const totalAvailableUnits = availableCases.reduce((sum, cases, index) => sum + cases * Math.max(1, casePackSizes[index]), 0);
  let remainingUnits = Math.min(totalUnits, totalAvailableUnits);

  for (let index = 0; index < casePackSizes.length; index += 1) {
    const casePack = Math.max(1, casePackSizes[index]);
    if (availableCases[index] <= 0 || remainingUnits < casePack) {
      continue;
    }
    allocations[index] = casePack;
    remainingUnits -= casePack;
  }

  let wrote = true;
  while (wrote) {
    wrote = false;
    for (let index = 0; index < casePackSizes.length; index += 1) {
      const casePack = Math.max(1, casePackSizes[index]);
      if (remainingUnits < casePack) {
        continue;
      }
      const maxUnits = availableCases[index] * casePack;
      if (allocations[index] + casePack > maxUnits) {
        continue;
      }
      allocations[index] += casePack;
      remainingUnits -= casePack;
      wrote = true;
    }
  }

  return allocations;
}

function roundToWholeCases(quantity: number, casePackSize: number, availableUnits: number) {
  const casePack = Math.max(1, casePackSize);
  const capped = Math.min(quantity, availableUnits);
  if (capped < casePack) {
    return 0;
  }
  const rounded = Math.round(capped / casePack) * casePack;
  const safeRounded = Math.max(casePack, Math.min(rounded, Math.floor(availableUnits / casePack) * casePack));
  return safeRounded;
}

function historicalQuantityForCandidate(candidate: LiveCandidate, history: FamilyHistory | null) {
  if (!history || history.lastLineTargets.length === 0) {
    return null;
  }
  let bestScore = 0;
  let bestQuantity: number | null = null;
  for (const target of history.lastLineTargets) {
    const score = tokenOverlapScore(candidate.productName, target.productName);
    if (score > bestScore) {
      bestScore = score;
      bestQuantity = target.quantity;
    }
  }
  return bestScore >= 0.45 ? bestQuantity : null;
}

function allocateUnitsFromHistory(
  totalUnits: number,
  selected: LiveCandidate[],
  history: FamilyHistory | null,
) {
  const allocations = selected.map((candidate) => {
    const historicalQuantity = historicalQuantityForCandidate(candidate, history);
    if (historicalQuantity == null) {
      return 0;
    }
    return roundToWholeCases(historicalQuantity, candidate.casePackSize, candidate.availableUnits);
  });

  let allocated = allocations.reduce((sum, value) => sum + value, 0);
  if (allocated === 0) {
    return allocations;
  }

  if (allocated > totalUnits) {
    const sortedIndexes = allocations
      .map((value, index) => ({ index, value }))
      .sort((left, right) => right.value - left.value);
    for (const entry of sortedIndexes) {
      const casePack = selected[entry.index]?.casePackSize ?? 1;
      while (allocations[entry.index] > 0 && allocated > totalUnits) {
        allocations[entry.index] -= casePack;
        allocated -= casePack;
      }
      if (allocated <= totalUnits) {
        break;
      }
    }
  }

  let wrote = true;
  while (allocated < totalUnits && wrote) {
    wrote = false;
    for (let index = 0; index < selected.length; index += 1) {
      const candidate = selected[index];
      const casePack = candidate.casePackSize;
      if (allocated + casePack > totalUnits) {
        continue;
      }
      if (allocations[index] + casePack > candidate.availableUnits) {
        continue;
      }
      allocations[index] += casePack;
      allocated += casePack;
      wrote = true;
    }
  }

  return allocations;
}

export function calculatePreferredPartnerProposalDraft(input: {
  rows: PreferredPartnerProposalInputRow[];
  inventoryRows: Array<Record<string, unknown>>;
  restockIntervalDays?: number;
  historicalOrders?: HistoricalOrder[];
}) {
  const restockIntervalDays = input.restockIntervalDays ?? PPP_RESTOCK_INTERVAL_DAYS;
  const { families, unmatchedProducts } = buildProposalFamilies(input.rows, restockIntervalDays);
  const familyHistory = buildFamilyHistory(input.historicalOrders ?? []);
  const liveCandidates = aggregateLiveCandidates(input.inventoryRows);
  const candidatesByPriceKey = new Map<string, LiveCandidate[]>();
  for (const candidate of liveCandidates) {
    const current = candidatesByPriceKey.get(candidate.priceKey) ?? [];
    current.push(candidate);
    candidatesByPriceKey.set(candidate.priceKey, current);
  }

  const lines: PreferredPartnerProposalLine[] = [];
  const overviewRows: PreferredPartnerProposalOverviewRow[] = [];
  const omittedDemandFamilies: string[] = [];

  for (const family of families) {
    const history = familyHistory.get(family.priceKey) ?? null;
    const allocationHistory = history;
    const allocationTargetUnits = resolveFamilyTargetUnits(family, history);
    if (family.rows.length > 0) {
      for (const row of family.rows) {
        const avgUnitsPerDay = row.avgUnitsPerDay ?? 0;
        const orderAmount = roundMoney(demandQuantityForRow(row, restockIntervalDays));
        if (avgUnitsPerDay <= 0 || orderAmount <= 0) {
          continue;
        }
        const targetUnits = avgUnitsPerDay * restockIntervalDays;
        overviewRows.push({
          priceKey: family.priceKey,
          displayBrand: family.price.displayBrand,
          productName: row.productName,
          avgUnitsPerDay,
          unitsOnHandAtDelivery: roundMoney(Math.max(0, targetUnits - orderAmount)),
          orderAmount,
          totalUnitsSold: row.totalUnitsSold,
          potentialLostProfit: row.potentialLostProfit ?? 0,
        });
      }
    }

    const familyCandidates = [...(candidatesByPriceKey.get(family.priceKey) ?? [])]
      .map((candidate) => ({
        candidate,
        score: scoreCandidate(candidate, family, allocationHistory),
      }))
      .sort((left, right) => {
        if (right.score !== left.score) {
          return right.score - left.score;
        }
        if (right.candidate.availableUnits !== left.candidate.availableUnits) {
          return right.candidate.availableUnits - left.candidate.availableUnits;
        }
        return left.candidate.productName.localeCompare(right.candidate.productName);
      });

    if (familyCandidates.length === 0) {
      omittedDemandFamilies.push(family.price.displayBrand);
      continue;
    }

    const selectedCount = chooseCandidateCount(family, familyCandidates.length, allocationHistory);
    let selected = familyCandidates.slice(0, selectedCount).map((entry) => entry.candidate);
    while (
      selected.length > 1 &&
      selected.reduce((sum, candidate) => sum + candidate.casePackSize, 0) > allocationTargetUnits
    ) {
      selected = selected.slice(0, -1);
    }
    const historyAllocations = allocateUnitsFromHistory(allocationTargetUnits, selected, allocationHistory);
    const allocations =
      historyAllocations.some((value) => value > 0)
        ? historyAllocations
        : allocateWholeCaseUnits(
            allocationTargetUnits,
            selected.map((candidate) => candidate.casePackSize),
            selected.map((candidate) => candidate.availableUnits),
          );

    selected.forEach((candidate, index) => {
      const quantity = allocations[index] ?? 0;
      if (quantity <= 0) {
        return;
      }
      lines.push({
        skuCode: candidate.skuCode,
        productName: candidate.productName,
        brandName: candidate.brandName,
        unitDescription: candidate.unitDescription,
        inventoryClass: candidate.inventoryClass,
        inventoryCategory: candidate.inventoryCategory,
        quantity,
        unitPrice: candidate.unitPrice,
        lineTotal: roundMoney(candidate.unitPrice * quantity),
        availableUnits: candidate.availableUnits,
        availableCases: candidate.availableCases,
        casePackSize: candidate.casePackSize,
        warehouseCount: candidate.warehouseCount,
        sourceWarehouseIds: candidate.sourceWarehouseIds,
        batchCount: candidate.batchCount,
        batchCode: candidate.batchCode,
        batchExpirationDate: candidate.batchExpirationDate,
        batchLicenseNumber: candidate.batchLicenseNumber,
        latestInventoryAt: candidate.latestInventoryAt,
        priceKey: candidate.priceKey,
        price: candidate.price,
        sourceKind: family.kind,
        matchedHeadsetRows: [...family.rows, ...family.strategicRows].map((row) => row.productName),
      });
    });
  }

  lines.sort((left, right) => {
    const priceSort = left.price.displayBrand.localeCompare(right.price.displayBrand);
    return priceSort === 0 ? left.productName.localeCompare(right.productName) : priceSort;
  });

  const groupedBreakdown = new Map<string, PreferredPartnerProposalLine[]>();
  for (const line of lines) {
    const current = groupedBreakdown.get(line.priceKey) ?? [];
    current.push(line);
    groupedBreakdown.set(line.priceKey, current);
  }

  const breakdownRows = PREFERRED_PARTNER_PRICING
    .map((price): PreferredPartnerProposalBreakdownRow | null => {
      const priceKey = preferredPartnerPriceKey(price);
      const priceLines = groupedBreakdown.get(priceKey) ?? [];
      const quantity = priceLines.reduce((sum, line) => sum + line.quantity, 0);
      if (quantity <= 0) {
        return null;
      }
      const currentPromoTotal = roundMoney(priceLines.reduce((sum, line) => sum + line.lineTotal, 0));
      return {
        priceKey,
        brand: price.displayBrand,
        size: price.weight,
        quantity,
        standardWholesale: price.standardWholesale,
        currentPromoPrice: quantity > 0 ? roundMoney(currentPromoTotal / quantity) : null,
        pppPrice: price.preferredWholesale,
        standardWholesaleTotal: roundMoney(price.standardWholesale * quantity),
        currentPromoTotal,
        pppPricingTotal: roundMoney(price.preferredWholesale * quantity),
      };
    })
    .filter((row): row is PreferredPartnerProposalBreakdownRow => Boolean(row))
    .sort((left, right) => left.brand.localeCompare(right.brand));

  const currentPromoTotal = roundMoney(lines.reduce((sum, line) => sum + line.lineTotal, 0));
  const subtotal = roundMoney(currentPromoTotal / (1 + NY_WHOLESALE_EXCISE_TAX_RATE));
  const taxTotal = roundMoney(currentPromoTotal - subtotal);
  const preferredTotal = roundMoney(breakdownRows.reduce((sum, row) => sum + row.pppPricingTotal, 0));
  const standardWholesaleTotal = roundMoney(breakdownRows.reduce((sum, row) => sum + row.standardWholesaleTotal, 0));
  const creditMemo = roundMoney(Math.max(0, currentPromoTotal - preferredTotal));

  return {
    overviewRows: overviewRows.sort((left, right) => right.orderAmount - left.orderAmount),
    breakdownRows,
    lines,
    unmatchedProducts,
    omittedDemandFamilies,
    summary: {
      sourceRowCount: input.rows.length,
      proposedLineCount: lines.length,
      totalUnits: lines.reduce((sum, line) => sum + line.quantity, 0),
      subtotal,
      taxRate: NY_WHOLESALE_EXCISE_TAX_RATE,
      taxTotal,
      creditMemo,
      currentPromoTotal,
      preferredTotal,
      standardWholesaleTotal,
      totalBalanceDue: roundMoney(currentPromoTotal - creditMemo),
      inventoryUpdatedAt: lines.reduce<string | null>((latest, line) => maxIso(latest, line.latestInventoryAt), null),
      restockIntervalDays,
    },
    inputSummary: {
      rowCount: input.rows.length,
      matchedRowCount: input.rows.length - unmatchedProducts.length,
      demandRowCount: input.rows.filter((row) => row.priceKey && isDemandRow(row, restockIntervalDays)).length,
      strategicRowCount: input.rows.filter((row) => row.priceKey && !isDemandRow(row, restockIntervalDays) && row.totalQuantityOnHand > 0).length,
      unmatchedRowCount: unmatchedProducts.length,
      unmatchedProducts,
      omittedDemandFamilies,
    },
  };
}

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

function selectSourceWarehouse(lines: PreferredPartnerProposalLine[], warehouseRows: Array<Record<string, unknown>>) {
  const warehouses = warehouseRows.map(parseWarehouseRow).filter((row): row is WarehouseSummary => Boolean(row));
  const byId = new Map(warehouses.map((warehouse) => [warehouse.id, warehouse]));
  const counts = new Map<string, number>();

  for (const line of lines) {
    for (const warehouseId of line.sourceWarehouseIds) {
      counts.set(warehouseId, (counts.get(warehouseId) ?? 0) + line.quantity);
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

function firstTruthy(...values: Array<string | null | undefined>) {
  return values.find((value) => Boolean(value?.trim()))?.trim() ?? null;
}

export async function getPreferredPartnerProposal(input: {
  orgId: string;
  accountIdOrPageId: string;
  rawReport: string;
}) {
  const { format, rows: rawRows } = parseInputRows(input.rawReport);
  const parsedRows = normalizeHeadsetRows(rawRows);
  if (parsedRows.length === 0) {
    const error = new Error('Paste a Headset JSON array or CSV export before generating a PPP proposal.');
    (error as Error & { statusCode?: number }).statusCode = 400;
    throw error;
  }

  const resolved = await resolveAccountIdentity(input.accountIdOrPageId, input.orgId);
  if (!resolved?.notionPageId) {
    const error = new Error('Account not found.');
    (error as Error & { statusCode?: number }).statusCode = 404;
    throw error;
  }

  const [detail, inventoryResult, warehouseRows, daysOffRows, savingsHistory] = await Promise.all([
    loadTerritoryStoreDetail(resolved.notionPageId),
    loadNyInventoryRows(),
    loadNyWarehouseRows(),
    loadNabisDaysOffRows(),
    getPreferredPartnerSavings({
      orgId: input.orgId,
      accountIdOrPageId: input.accountIdOrPageId,
      year: new Date().getFullYear(),
    }).catch(() => null),
  ]);

  const generatedAt = new Date();
  const draft = calculatePreferredPartnerProposalDraft({
    rows: parsedRows,
    inventoryRows: inventoryResult.rows,
    historicalOrders: savingsHistory?.orders?.map((order) => ({
      orderDate: order.orderDate,
      breakdownRows: order.breakdownRows.map((row) => ({
        priceKey: row.priceKey,
        quantity: row.quantity,
      })),
      lines: order.lines.map((line) => ({
        productName: line.productName,
        quantity: line.quantity,
        priceKey: line.priceKey,
      })),
    })),
  });
  const primaryContactName = detail.crm.primaryContactName || detail.crm.primaryContactBuyer || detail.contacts[0]?.name || null;
  const salesRepName = firstTruthy(detail.crm.rep, detail.store.repNames[0]);
  const sourceWarehouse = selectSourceWarehouse(draft.lines, warehouseRows);
  const storeName = detail.store.name;
  const warningParts = [
    draft.lines.length === 0 ? 'No live Nabis inventory matched the pasted Headset report.' : null,
    draft.inputSummary.unmatchedRowCount > 0 ? `${draft.inputSummary.unmatchedRowCount} Headset row${draft.inputSummary.unmatchedRowCount === 1 ? '' : 's'} did not map to a PPP pricing family.` : null,
    draft.inputSummary.omittedDemandFamilies.length > 0 ? `No live Nabis inventory was found for ${draft.inputSummary.omittedDemandFamilies.join(', ')}.` : null,
  ].filter(Boolean);

  const order: ProposalOrder = {
    orderType: 'Delivery to retailer',
    sellerName: process.env.NABIS_SELLER_NAME?.trim() || NABIS_SELLER_NAME,
    poSoNumber: `PPP Proposal | ${storeName}`,
    salesRepName,
    sourceWarehouseId: sourceWarehouse?.id ?? null,
    sourceWarehouseName: sourceWarehouse?.name ?? null,
    sourceWarehouseRegion: sourceWarehouse?.region ?? null,
    sourceWarehouseLabel: sourceWarehouse?.label ?? null,
    earliestDeliveryDate: calculateEarliestDeliveryDate(generatedAt, daysOffRows),
    licenseNumber: detail.store.licenseNumber ?? null,
    intakeContactName: primaryContactName,
    paymentTerms: 'Net 30',
  };

  return {
    ok: true as const,
    accountId: resolved.accountId ?? null,
    storeName,
    storeAddress: detail.store.locationAddress ?? detail.store.locationLabel ?? null,
    primaryContactName,
    generatedAt: generatedAt.toISOString(),
    source: 'headset-report+nabis-api' as const,
    warning: warningParts.join(' '),
    inputSummary: {
      format,
      rowCount: rawRows.length,
      parsedRowCount: parsedRows.length,
      matchedRowCount: draft.inputSummary.matchedRowCount,
      demandRowCount: draft.inputSummary.demandRowCount,
      strategicRowCount: draft.inputSummary.strategicRowCount,
      unmatchedRowCount: draft.inputSummary.unmatchedRowCount,
      unmatchedProducts: draft.inputSummary.unmatchedProducts,
      omittedDemandFamilies: draft.inputSummary.omittedDemandFamilies,
    },
    order,
    summary: draft.summary,
    overviewRows: draft.overviewRows,
    breakdownRows: draft.breakdownRows,
    lines: draft.lines,
  } satisfies PreferredPartnerProposalResponse;
}
