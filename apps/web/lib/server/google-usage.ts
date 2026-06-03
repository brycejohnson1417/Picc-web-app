import 'server-only';

import { prisma } from '@/lib/db/prisma';
import { readNotionCacheSnapshot, writeNotionCacheSnapshot } from '@/lib/server/notion-cache-store';

export type GoogleUsageSku = 'geocoding' | 'routes_compute' | 'routes_optimize';

export type GoogleUsageCounts = Record<GoogleUsageSku, number>;

export type GoogleUsageSummary = {
  generatedAt: string;
  month: string;
  today: string;
  budgetUsd: number;
  remainingBudgetUsd: number;
  estimatedMonthToDateUsd: number;
  projectedMonthlyUsd: number;
  capReached: boolean;
  pricingUsdPerThousand: Record<GoogleUsageSku, number>;
  todayCounts: GoogleUsageCounts;
  monthToDateCounts: GoogleUsageCounts;
  daysElapsed: number;
  daysInMonth: number;
};

type GoogleUsageSnapshotPayload = {
  version: 1;
  day: string;
  counts: GoogleUsageCounts;
};

const GOOGLE_USAGE_KEY_PREFIX = 'google-usage-v1:';
const MONTHLY_SUMMARY_CACHE_TTL_MS = 30_000;
const DEFAULT_MONTHLY_BUDGET_USD = 100;

const DEFAULT_PRICING_USD_PER_THOUSAND: Record<GoogleUsageSku, number> = {
  geocoding: 5,
  routes_compute: 5,
  routes_optimize: 10,
};

let monthSummaryCache:
  | {
      month: string;
      computedAtMs: number;
      summary: GoogleUsageSummary;
    }
  | null = null;

function roundUsd(value: number) {
  if (!Number.isFinite(value) || value <= 0) {
    return 0;
  }
  return Math.round(value * 10_000) / 10_000;
}

function parseUsdEnv(value: string | undefined, fallback: number) {
  const parsed = value ? Number.parseFloat(value) : Number.NaN;
  if (!Number.isFinite(parsed) || parsed < 0) {
    return fallback;
  }
  return parsed;
}

function getGooglePricingUsdPerThousand() {
  return {
    geocoding: parseUsdEnv(
      process.env.TERRITORY_GOOGLE_GEOCODING_USD_PER_1000,
      DEFAULT_PRICING_USD_PER_THOUSAND.geocoding,
    ),
    routes_compute: parseUsdEnv(
      process.env.TERRITORY_GOOGLE_ROUTES_COMPUTE_USD_PER_1000,
      DEFAULT_PRICING_USD_PER_THOUSAND.routes_compute,
    ),
    routes_optimize: parseUsdEnv(
      process.env.TERRITORY_GOOGLE_ROUTE_OPTIMIZE_USD_PER_1000,
      DEFAULT_PRICING_USD_PER_THOUSAND.routes_optimize,
    ),
  };
}

function getMonthlyBudgetUsd() {
  return parseUsdEnv(process.env.TERRITORY_GOOGLE_MONTHLY_BUDGET_USD, DEFAULT_MONTHLY_BUDGET_USD);
}

function emptyCounts(): GoogleUsageCounts {
  return {
    geocoding: 0,
    routes_compute: 0,
    routes_optimize: 0,
  };
}

function sumCounts(counts: GoogleUsageCounts) {
  return counts.geocoding + counts.routes_compute + counts.routes_optimize;
}

function toDayKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function toMonthKey(date = new Date()) {
  return date.toISOString().slice(0, 7);
}

function usageKeyForDay(day: string) {
  return `${GOOGLE_USAGE_KEY_PREFIX}${day}`;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function asNonNegativeInt(value: unknown) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.trunc(value));
}

function normalizePayload(payload: unknown, day: string): GoogleUsageSnapshotPayload {
  if (!isObject(payload)) {
    return { version: 1, day, counts: emptyCounts() };
  }

  const countsRaw = isObject(payload.counts) ? payload.counts : {};
  return {
    version: 1,
    day: typeof payload.day === 'string' ? payload.day : day,
    counts: {
      geocoding: asNonNegativeInt(countsRaw.geocoding),
      routes_compute: asNonNegativeInt(countsRaw.routes_compute),
      routes_optimize: asNonNegativeInt(countsRaw.routes_optimize),
    },
  };
}

function estimateCostUsdFromCounts(
  counts: GoogleUsageCounts,
  pricingUsdPerThousand: Record<GoogleUsageSku, number>,
) {
  const geocoding = (counts.geocoding / 1000) * pricingUsdPerThousand.geocoding;
  const routesCompute = (counts.routes_compute / 1000) * pricingUsdPerThousand.routes_compute;
  const routesOptimize = (counts.routes_optimize / 1000) * pricingUsdPerThousand.routes_optimize;
  return roundUsd(geocoding + routesCompute + routesOptimize);
}

function mergeCounts(base: GoogleUsageCounts, next: GoogleUsageCounts): GoogleUsageCounts {
  return {
    geocoding: base.geocoding + next.geocoding,
    routes_compute: base.routes_compute + next.routes_compute,
    routes_optimize: base.routes_optimize + next.routes_optimize,
  };
}

function getDaysInMonth(date = new Date()) {
  const year = date.getUTCFullYear();
  const monthIndex = date.getUTCMonth();
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

function invalidateSummaryCache() {
  monthSummaryCache = null;
}

export function estimateGoogleUsageCostUsd(sku: GoogleUsageSku, count = 1) {
  const normalizedCount = Math.max(0, Math.trunc(count));
  if (normalizedCount === 0) {
    return 0;
  }
  const pricing = getGooglePricingUsdPerThousand();
  return roundUsd((normalizedCount / 1000) * pricing[sku]);
}

export async function recordGoogleUsage(sku: GoogleUsageSku, count = 1) {
  const normalizedCount = Math.max(0, Math.trunc(count));
  if (normalizedCount === 0) {
    return;
  }

  const day = toDayKey();
  const key = usageKeyForDay(day);
  const snapshot = await readNotionCacheSnapshot<GoogleUsageSnapshotPayload>(key);
  const payload = normalizePayload(snapshot?.payload, day);
  payload.counts[sku] += normalizedCount;

  await writeNotionCacheSnapshot({
    key,
    payload,
    recordsRead: sumCounts(payload.counts),
    unresolvedLocationCount: 0,
    lastEditedMax: null,
  });

  invalidateSummaryCache();
}

export async function getGoogleUsageSummary(options?: { forceFresh?: boolean }) {
  const now = new Date();
  const month = toMonthKey(now);
  const today = toDayKey(now);

  if (
    !options?.forceFresh &&
    monthSummaryCache &&
    monthSummaryCache.month === month &&
    Date.now() - monthSummaryCache.computedAtMs < MONTHLY_SUMMARY_CACHE_TTL_MS
  ) {
    return monthSummaryCache.summary;
  }

  const prefix = `${GOOGLE_USAGE_KEY_PREFIX}${month}`;
  const rows = await prisma.notionCacheSnapshot.findMany({
    where: {
      key: {
        startsWith: prefix,
      },
    },
    select: {
      key: true,
      payload: true,
    },
  });

  let monthToDateCounts = emptyCounts();
  let todayCounts = emptyCounts();

  for (const row of rows) {
    const day = row.key.slice(GOOGLE_USAGE_KEY_PREFIX.length);
    const payload = normalizePayload(row.payload, day);
    monthToDateCounts = mergeCounts(monthToDateCounts, payload.counts);
    if (payload.day === today) {
      todayCounts = payload.counts;
    }
  }

  const pricingUsdPerThousand = getGooglePricingUsdPerThousand();
  const estimatedMonthToDateUsd = estimateCostUsdFromCounts(monthToDateCounts, pricingUsdPerThousand);
  const budgetUsd = getMonthlyBudgetUsd();
  const daysElapsed = Math.max(1, now.getUTCDate());
  const daysInMonth = getDaysInMonth(now);
  const projectedMonthlyUsd = roundUsd((estimatedMonthToDateUsd / daysElapsed) * daysInMonth);
  const remainingBudgetUsd = roundUsd(Math.max(0, budgetUsd - estimatedMonthToDateUsd));
  const capReached = estimatedMonthToDateUsd >= budgetUsd;

  const summary: GoogleUsageSummary = {
    generatedAt: now.toISOString(),
    month,
    today,
    budgetUsd: roundUsd(budgetUsd),
    remainingBudgetUsd,
    estimatedMonthToDateUsd,
    projectedMonthlyUsd,
    capReached,
    pricingUsdPerThousand,
    todayCounts,
    monthToDateCounts,
    daysElapsed,
    daysInMonth,
  };

  monthSummaryCache = {
    month,
    computedAtMs: Date.now(),
    summary,
  };

  return summary;
}

export async function checkGoogleBudgetCap(pendingCostUsd = 0) {
  const summary = await getGoogleUsageSummary();
  const pending = Math.max(0, pendingCostUsd);
  const wouldBeTotal = roundUsd(summary.estimatedMonthToDateUsd + pending);
  return {
    allowed: wouldBeTotal <= summary.budgetUsd,
    wouldBeTotalUsd: wouldBeTotal,
    summary,
  };
}
