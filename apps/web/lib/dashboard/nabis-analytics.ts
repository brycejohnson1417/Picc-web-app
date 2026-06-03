import type { DashboardDateRange } from '@/lib/dashboard/nabis-types';

const CANCELED_STATUSES = new Set(['CANCELED', 'CANCELLED', 'VOID', 'VOIDED', 'REJECTED', 'REFUNDED']);
const CUSTOMER_STATUS_KEYS = new Set(['customer', 'customer overdue']);
const HISTORICAL_VMI_NOTE = 'VMI counts use current territory status; historical VMI status changes are not cached.';
const REP_METRIC_LABELS = ['Ben', 'Donovan', 'Eric', 'Bryce J', 'Roxy', 'Matt M', 'Unassigned'];
const REP_METRIC_LABEL_SET = new Set(REP_METRIC_LABELS);

export type CacheCoverageStatus = 'empty' | 'covered' | 'partial-before-cache' | 'partial-after-cache' | 'partial-both';

export interface AnalyticsOrder {
  id: string;
  orderNumber: string;
  createdDate: string;
  status: string;
  customerName: string;
  total: number;
  salesRep: string;
  licensedLocationId: string | null;
  matchedAccountId?: string | null;
  matchedAccountName?: string | null;
  isInternalTransfer?: boolean | null;
}

export interface AnalyticsTerritoryStore {
  id: string;
  name: string;
  statusKey: string;
  repNames: string[];
  licenseNumber?: string | null;
  licensedLocationId?: string | null;
  nabisRetailerId?: string | null;
  isPreferredPartner?: boolean | null;
  lastSampleOrderDate?: string | null;
  lastSampleDeliveryDate?: string | null;
}

export interface MonthlyRevenueTrend {
  monthKey: string;
  name: string;
  revenue: number;
  orderCount: number;
}

export interface RepRevenueStat {
  name: string;
  revenue: number;
  orderCount: number;
}

export interface RepMonthlyMetric {
  repName: string;
  monthKey: string;
  monthLabel: string;
  salesInTerritory: number;
  orderCount: number;
  customerStoreCount: number;
  newStoreCount: number;
  vmiStoreCount: number;
  newVmiStoreCount: number;
  nonVmiStoreCount: number;
  nonVmiReorderCount: number;
  reorderPercent: number | null;
  nonClosedSampledStoreCount: number;
  dataNotes: string[];
}

export interface NabisDashboardAnalytics {
  totalRevenue: number;
  totalOrders: number;
  activeSalesReps: number;
  monthlyTrend: MonthlyRevenueTrend[];
  repStats: RepRevenueStat[];
  repMonthlyMetrics: RepMonthlyMetric[];
  dataNotes: string[];
}

export interface CacheCoverage {
  status: CacheCoverageStatus;
  fullyCovered: boolean;
  requestedStart: string;
  requestedEnd: string;
  earliestOrderCreatedAt: string | null;
  latestOrderCreatedAt: string | null;
  cachedOrderCount: number;
  cachedLineItemCount: number;
  message: string;
}

function toDateKey(value: string | Date | null | undefined) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function toMonthKey(value: string | Date | null | undefined) {
  return toDateKey(value)?.slice(0, 7) ?? null;
}

function monthLabel(monthKey: string) {
  return new Date(`${monthKey}-15T12:00:00`).toLocaleDateString('en-US', {
    month: 'short',
    year: 'numeric',
  });
}

function addMonths(date: Date, count: number) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + count, 1));
}

function monthKeysForRange(range: DashboardDateRange) {
  const start = new Date(`${range.start}T00:00:00.000Z`);
  const end = new Date(`${range.end}T00:00:00.000Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) {
    return [];
  }

  const months: string[] = [];
  let cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
  const last = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1));

  while (cursor <= last) {
    months.push(cursor.toISOString().slice(0, 7));
    cursor = addMonths(cursor, 1);
  }

  return months;
}

function normalizeKey(value: string | null | undefined) {
  return (value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

export function formatNabisSalesRep(value: string | null | undefined) {
  const normalized = (value ?? '').trim().replace(/\s+/g, ' ');
  const key = normalized.toLowerCase();
  const aliases = new Map<string, string>([
    ['b rosenthal', 'Ben'],
    ['benjamin rosenthal', 'Ben'],
    ['bryce', 'Bryce J'],
    ['bryce johnson', 'Bryce J'],
    ['donovan snyder', 'Donovan'],
    ['eric acosta', 'Eric'],
    ['matthew masi', 'Matt M'],
    ['matt masi', 'Matt M'],
    ['mm', 'Matt M'],
    ['roxy', 'Roxy'],
  ]);
  return aliases.get(key) ?? (normalized || 'Unassigned');
}

function repMetricLabel(value: string | null | undefined) {
  const label = formatNabisSalesRep(value);
  return REP_METRIC_LABEL_SET.has(label) ? label : 'Unassigned';
}

function repMetricLabelsForStore(store: AnalyticsTerritoryStore) {
  const labels = [...new Set((store.repNames ?? []).map(repMetricLabel).filter(Boolean))];
  return labels.length > 0 ? labels : ['Unassigned'];
}

function orderMatchingKeys(order: AnalyticsOrder) {
  return [order.licensedLocationId, order.matchedAccountName, order.customerName].map(normalizeKey).filter(Boolean);
}

function territoryStoreKey(store: AnalyticsTerritoryStore) {
  return `territory:${store.id}`;
}

function orderStoreKey(order: AnalyticsOrder, matchedStore?: AnalyticsTerritoryStore | null) {
  return (matchedStore ? territoryStoreKey(matchedStore) : null) ?? orderMatchingKeys(order)[0] ?? '';
}

function storeKeys(store: AnalyticsTerritoryStore) {
  return [
    store.id,
    store.licensedLocationId,
    store.licenseNumber,
    store.nabisRetailerId,
    store.name,
  ]
    .map(normalizeKey)
    .filter(Boolean);
}

function isCanceledStatus(status: string | null | undefined) {
  return CANCELED_STATUSES.has(String(status || '').toUpperCase());
}

function isValidPaidOrder(order: AnalyticsOrder) {
  return !order.isInternalTransfer && !isCanceledStatus(order.status) && order.total > 0;
}

function isCustomerStore(store: AnalyticsTerritoryStore) {
  return CUSTOMER_STATUS_KEYS.has(normalizeKey(store.statusKey));
}

function isInRange(order: AnalyticsOrder, range: DashboardDateRange) {
  return order.createdDate >= range.start && order.createdDate <= range.end;
}

export function buildCacheCoverage(input: {
  requestedRange: DashboardDateRange;
  earliestOrderCreatedAt: string | null;
  latestOrderCreatedAt: string | null;
  cachedOrderCount: number;
  cachedLineItemCount: number;
}): CacheCoverage {
  const earliest = toDateKey(input.earliestOrderCreatedAt);
  const latest = toDateKey(input.latestOrderCreatedAt);

  if (!earliest || !latest || input.cachedOrderCount === 0) {
    return {
      status: 'empty',
      fullyCovered: false,
      requestedStart: input.requestedRange.start,
      requestedEnd: input.requestedRange.end,
      earliestOrderCreatedAt: input.earliestOrderCreatedAt,
      latestOrderCreatedAt: input.latestOrderCreatedAt,
      cachedOrderCount: input.cachedOrderCount,
      cachedLineItemCount: input.cachedLineItemCount,
      message: 'No cached Nabis orders are available yet.',
    };
  }

  const startsBeforeCache = input.requestedRange.start < earliest;
  const endsAfterCache = input.requestedRange.end > latest;
  const status: CacheCoverageStatus =
    startsBeforeCache && endsAfterCache
      ? 'partial-both'
      : startsBeforeCache
        ? 'partial-before-cache'
        : endsAfterCache
          ? 'partial-after-cache'
          : 'covered';

  const message =
    status === 'covered'
      ? `Cache covers the selected range from ${earliest} through ${latest}.`
      : status === 'partial-before-cache'
        ? `Selected range starts before the earliest cached Nabis order (${earliest}); revenue before that date is not included.`
        : status === 'partial-after-cache'
          ? `Selected range ends after the latest cached Nabis order (${latest}); newer revenue is not included yet.`
          : `Selected range extends outside cached Nabis coverage (${earliest} through ${latest}).`;

  return {
    status,
    fullyCovered: status === 'covered',
    requestedStart: input.requestedRange.start,
    requestedEnd: input.requestedRange.end,
    earliestOrderCreatedAt: input.earliestOrderCreatedAt,
    latestOrderCreatedAt: input.latestOrderCreatedAt,
    cachedOrderCount: input.cachedOrderCount,
    cachedLineItemCount: input.cachedLineItemCount,
    message,
  };
}

export function summarizeNabisDashboardAnalytics(input: {
  orders: AnalyticsOrder[];
  territoryStores: AnalyticsTerritoryStore[];
  range: DashboardDateRange;
}): NabisDashboardAnalytics {
  const validOrders = input.orders.filter(isValidPaidOrder);
  const rangeOrders = validOrders.filter((order) => isInRange(order, input.range));
  const months = monthKeysForRange(input.range);

  const storesByKey = new Map<string, AnalyticsTerritoryStore>();
  for (const store of input.territoryStores) {
    for (const key of storeKeys(store)) {
      if (!storesByKey.has(key)) {
        storesByKey.set(key, store);
      }
    }
  }

  const firstPaidOrderMonthByStore = new Map<string, string>();
  for (const order of validOrders) {
    const monthKey = toMonthKey(order.createdDate);
    if (!monthKey) continue;
    const matchedStore = orderMatchingKeys(order).map((key) => storesByKey.get(key)).find(Boolean) ?? null;
    const storeKey = orderStoreKey(order, matchedStore);
    const current = firstPaidOrderMonthByStore.get(storeKey);
    if (!current || monthKey < current) {
      firstPaidOrderMonthByStore.set(storeKey, monthKey);
    }
  }

  const monthlyBuckets = new Map<string, MonthlyRevenueTrend>();
  for (const monthKey of months) {
    monthlyBuckets.set(monthKey, {
      monthKey,
      name: monthLabel(monthKey),
      revenue: 0,
      orderCount: 0,
    });
  }

  const repBuckets = new Map<string, RepRevenueStat>();
  const repMonthSales = new Map<string, { revenue: number; orderCount: number }>();
  const newStoresByRepMonth = new Map<string, Set<string>>();
  const newVmiStoresByRepMonth = new Map<string, Set<string>>();
  const nonVmiReordersByRepMonth = new Map<string, Set<string>>();

  for (const order of rangeOrders) {
    const monthKey = toMonthKey(order.createdDate);
    if (!monthKey) continue;
    const repName = formatNabisSalesRep(order.salesRep);
    const matchedStore = orderMatchingKeys(order).map((key) => storesByKey.get(key)).find(Boolean) ?? null;
    const storeKey = orderStoreKey(order, matchedStore);
    const monthBucket = monthlyBuckets.get(monthKey);
    if (monthBucket) {
      monthBucket.revenue += order.total;
      monthBucket.orderCount += 1;
    }

    const repBucket = repBuckets.get(repName) ?? { name: repName, revenue: 0, orderCount: 0 };
    repBucket.revenue += order.total;
    repBucket.orderCount += 1;
    repBuckets.set(repName, repBucket);

    const territoryRepLabels = matchedStore ? repMetricLabelsForStore(matchedStore) : [repMetricLabel(repName)];

    for (const territoryRepLabel of territoryRepLabels) {
      const repMonthKey = `${territoryRepLabel}::${monthKey}`;
      const currentRepMonth = repMonthSales.get(repMonthKey) ?? { revenue: 0, orderCount: 0 };
      currentRepMonth.revenue += order.total;
      currentRepMonth.orderCount += 1;
      repMonthSales.set(repMonthKey, currentRepMonth);

      const firstMonth = storeKey ? firstPaidOrderMonthByStore.get(storeKey) : null;
      if (storeKey && firstMonth === monthKey) {
        const current = newStoresByRepMonth.get(repMonthKey) ?? new Set<string>();
        current.add(storeKey);
        newStoresByRepMonth.set(repMonthKey, current);
        if (matchedStore?.isPreferredPartner) {
          const currentVmi = newVmiStoresByRepMonth.get(repMonthKey) ?? new Set<string>();
          currentVmi.add(storeKey);
          newVmiStoresByRepMonth.set(repMonthKey, currentVmi);
        }
      }

      if (storeKey && firstMonth && firstMonth < monthKey && matchedStore && !matchedStore.isPreferredPartner) {
        const current = nonVmiReordersByRepMonth.get(repMonthKey) ?? new Set<string>();
        current.add(storeKey);
        nonVmiReordersByRepMonth.set(repMonthKey, current);
      }
    }
  }

  const customerStoresByRep = new Map<string, Set<string>>();
  const vmiStoresByRep = new Map<string, Set<string>>();
  const nonVmiStoresByRep = new Map<string, Set<string>>();
  const sampledLeadStoresByRep = new Map<string, Set<string>>();

  for (const store of input.territoryStores) {
    const storeKey = territoryStoreKey(store);
    const labels = repMetricLabelsForStore(store);
    const customer = isCustomerStore(store);
    const preferred = Boolean(store.isPreferredPartner);
    const hasSampleDelivery = Boolean(store.lastSampleDeliveryDate);
    const hasPaidOrder = firstPaidOrderMonthByStore.has(storeKey);

    for (const label of labels) {
      if (customer) {
        const customerSet = customerStoresByRep.get(label) ?? new Set<string>();
        customerSet.add(storeKey);
        customerStoresByRep.set(label, customerSet);

        const target = preferred ? vmiStoresByRep : nonVmiStoresByRep;
        const current = target.get(label) ?? new Set<string>();
        current.add(storeKey);
        target.set(label, current);
      }

      if (!customer && hasSampleDelivery && !hasPaidOrder) {
        const sampledSet = sampledLeadStoresByRep.get(label) ?? new Set<string>();
        sampledSet.add(storeKey);
        sampledLeadStoresByRep.set(label, sampledSet);
      }
    }
  }

  const repMonthlyMetrics: RepMonthlyMetric[] = [];
  for (const monthKey of months) {
    for (const repName of REP_METRIC_LABELS) {
      const repMonthKey = `${repName}::${monthKey}`;
      const sales = repMonthSales.get(repMonthKey) ?? { revenue: 0, orderCount: 0 };
      const nonVmiStoreCount = nonVmiStoresByRep.get(repName)?.size ?? 0;
      const nonVmiReorderCount = nonVmiReordersByRepMonth.get(repMonthKey)?.size ?? 0;

      repMonthlyMetrics.push({
        repName,
        monthKey,
        monthLabel: monthLabel(monthKey),
        salesInTerritory: Number(sales.revenue.toFixed(2)),
        orderCount: sales.orderCount,
        customerStoreCount: customerStoresByRep.get(repName)?.size ?? 0,
        newStoreCount: newStoresByRepMonth.get(repMonthKey)?.size ?? 0,
        vmiStoreCount: vmiStoresByRep.get(repName)?.size ?? 0,
        newVmiStoreCount: newVmiStoresByRepMonth.get(repMonthKey)?.size ?? 0,
        nonVmiStoreCount,
        nonVmiReorderCount,
        reorderPercent: nonVmiStoreCount > 0 ? Number(((nonVmiReorderCount / nonVmiStoreCount) * 100).toFixed(2)) : null,
        nonClosedSampledStoreCount: sampledLeadStoresByRep.get(repName)?.size ?? 0,
        dataNotes: [HISTORICAL_VMI_NOTE],
      });
    }
  }

  const totalRevenue = rangeOrders.reduce((sum, order) => sum + order.total, 0);

  return {
    totalRevenue: Number(totalRevenue.toFixed(2)),
    totalOrders: rangeOrders.length,
    activeSalesReps: repBuckets.size,
    monthlyTrend: [...monthlyBuckets.values()].map((row) => ({
      ...row,
      revenue: Number(row.revenue.toFixed(2)),
    })),
    repStats: [...repBuckets.values()]
      .map((row) => ({ ...row, revenue: Number(row.revenue.toFixed(2)) }))
      .sort((left, right) => right.revenue - left.revenue || left.name.localeCompare(right.name)),
    repMonthlyMetrics,
    dataNotes: input.territoryStores.length > 0 ? [HISTORICAL_VMI_NOTE] : ['Territory status cache is unavailable, so VMI/customer/sample store counts are not available.'],
  };
}
