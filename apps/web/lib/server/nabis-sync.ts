import 'server-only';

import { randomUUID } from 'node:crypto';
import { IntegrationProvider, IntegrationSyncStatus, Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { ensureAccountIdentityMappings, resolveCanonicalAccountByIdentifiers } from '@/lib/server/account-identity';
import { appendAuditEvent } from '@/lib/server/audit-log';
import { ensureDispensaryCrmPageFromRetailer } from '@/lib/server/notion-crm-sync';
import { ensureActivePolicySnapshot } from '@/lib/server/policy-snapshots';
import { excludedInternalTransferRetailers, isExcludedInternalTransferRetailerName } from '@/lib/nabis/internal-transfers';

const DEFAULT_API_BASE_URL = 'https://platform-api.nabis.pro';
const PAGE_SIZE = 500;
const MAX_RETAILER_PAGES = 40;
const MAX_ORDER_PAGES = 220;
const RECENT_ORDER_SYNC_DAYS = 120;
const RECONCILIATION_ORDER_SYNC_DAYS = 400;
const HISTORICAL_ORDER_BACKFILL_START_DATE = '2025-01-01T00:00:00.000Z';
const HISTORICAL_ORDER_BACKFILL_BATCH_PAGES = 20;
const ORDER_UPSERT_BATCH_SIZE = 50;
const NABIS_SYNC_LEASE_MODULE = 'nabis_global_sync_lease';
const NABIS_SYNC_LEASE_REFRESH_MS = 30_000;
const NABIS_SYNC_LEASE_STALE_MS = NABIS_SYNC_LEASE_REFRESH_MS * 2;

type SyncActor = {
  clerkUserId?: string | null;
  email?: string | null;
};

type NabisRetailerApiRow = {
  id?: string | number | null;
  retailerId?: string | number | null;
  licensedLocationId?: string | number | null;
  name?: string | null;
  doingBusinessAs?: string | null;
  address1?: string | null;
  address2?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  zipcode?: string | null;
  siteLicenseNumber?: string | null;
  lat?: string | number | null;
  lng?: string | number | null;
  latitude?: string | number | null;
  longitude?: string | number | null;
};

type NabisOrderApiRow = {
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
  orderDiscount?: string | number | null;
  lineItemDiscount?: string | number | null;
  lineItemSubtotalAfterDiscount?: string | number | null;
  lineItemSubtotal?: string | number | null;
  orderAction?: string | null;
  orderName?: string | null;
  notes?: string | null;
  licensedLocationId?: string | null;
  retailerId?: string | null;
  siteLicenseNumber?: string | null;
  deliveryDate?: string | null;
  skuName?: string | null;
  skuDisplayName?: string | null;
  productName?: string | null;
  lineItemProductName?: string | null;
  skuCode?: string | null;
  unitDescription?: string | null;
  units?: string | number | null;
  quantity?: string | number | null;
  lineItemQuantity?: string | number | null;
  skuPricePerUnit?: string | number | null;
  lineItemPricePerUnitAfterDiscount?: string | number | null;
  pricePerUnit?: string | number | null;
  unitPrice?: string | number | null;
  lineItemPricePerUnit?: string | number | null;
  sample?: boolean | string | number | null;
  isSample?: boolean | string | number | null;
  lineItemIsSample?: boolean | string | number | null;
  itemStrain?: string | null;
  itemCategory?: string | null;
  itemClass?: string | null;
};

type NabisPagedResponse<T> = {
  data?: T[];
  nextPage?: number | null;
  totalCount?: number;
  totalNumPages?: number;
};

type ParsedRetailer = {
  licensedLocationId: string;
  externalRetailerId: string | null;
  licenseNumber: string | null;
  name: string;
  doingBusinessAs: string | null;
  address1: string | null;
  address2: string | null;
  city: string | null;
  state: string | null;
  zipcode: string | null;
  geoLat: number | null;
  geoLng: number | null;
};

type ParsedOrder = {
  externalOrderId: string;
  orderNumber: string | null;
  licensedLocationId: string | null;
  nabisRetailerId: string | null;
  licensedLocationName: string | null;
  orderCreatedDate: Date | null;
  deliveryDate: Date | null;
  status: string | null;
  isInternalTransfer: boolean;
  salesRep: string | null;
  orderTotal: number;
  paymentStatus: string | null;
  licenseNumber: string | null;
  line: ParsedOrderLine | null;
};

type ParsedOrderLine = {
  externalOrderId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  isSample: boolean;
  itemStrain: string | null;
  itemCategory: string | null;
  itemClass: string | null;
};

type OrderSyncOptions = {
  reconciliation?: boolean;
  historicalBackfill?: boolean;
  historicalStartDate?: string;
  resetHistoricalBackfill?: boolean;
  startPage?: number;
  maxPagesPerRun?: number;
};

type LoadedOrdersFromNabis = {
  rows: ParsedOrder[];
  metadata: {
    cutoffDate: string;
    historicalBackfill: boolean;
    reconciliation: boolean;
    pagesScanned: number;
    recordsRead: number;
    cutoffReached: boolean;
    startPage: number;
    nextPage: number | null;
    hasMore: boolean;
    earliestOrderCreatedAt: string | null;
    latestOrderCreatedAt: string | null;
  };
};

type NabisSyncLeaseMetadata = {
  holderId: string;
  module: string;
  acquiredAt: string;
  refreshedAt: string;
  expiresAt: string;
  requestedBy: string | null;
};

type NabisLeaseDecision = {
  canAcquire: boolean;
  reason: 'available' | 'same-holder' | 'stale' | 'held';
  activeHolderId: string | null;
  activeModule: string | null;
  activeRefreshedAt: string | null;
  activeExpiresAt: string | null;
};

function syncModuleActionLabel(module: string | null) {
  if (module === 'orders') return 'order sync';
  if (module === 'retailers') return 'retailer sync';
  if (module === 'orders_reconcile') return 'historical reconciliation';
  if (module === 'orders_historical_backfill') return 'historical backfill';
  return 'sync';
}

export function formatNabisSyncLeaseConflictMessage(decision: NabisLeaseDecision) {
  const syncLabel = syncModuleActionLabel(decision.activeModule);
  return `Nabis ${syncLabel} is already running. Showing saved data while it finishes; refresh status in a minute.`;
}

export class NabisSyncLeaseError extends Error {
  readonly statusCode = 409;

  constructor(public readonly decision: NabisLeaseDecision) {
    super(formatNabisSyncLeaseConflictMessage(decision));
    this.name = 'NabisSyncLeaseError';
  }
}

class NabisRateLimitError extends Error {
  constructor(
    public readonly path: string,
    public readonly retryAfterMs: number,
  ) {
    super(`Nabis rate limit exhausted for ${path}; retry after ${Math.ceil(retryAfterMs / 1000)} seconds`);
    this.name = 'NabisRateLimitError';
  }
}

function requiredApiKey() {
  const apiKey = process.env.NABIS_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('NABIS_API_KEY is required');
  }
  return apiKey;
}

function getApiBaseUrl() {
  return process.env.NABIS_API_BASE_URL?.trim() || DEFAULT_API_BASE_URL;
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function chunkArray<T>(items: T[], chunkSize: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += chunkSize) {
    chunks.push(items.slice(index, index + chunkSize));
  }
  return chunks;
}

function toJsonObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function isoFromUnknown(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function dateFromUnknown(value: unknown) {
  const iso = isoFromUnknown(value);
  if (!iso) return null;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

function buildLeaseMetadata(input: {
  holderId: string;
  module: string;
  now: Date;
  requestedBy?: string | null;
  staleAfterMs?: number;
}): NabisSyncLeaseMetadata {
  const staleAfterMs = input.staleAfterMs ?? NABIS_SYNC_LEASE_STALE_MS;
  const refreshedAt = input.now.toISOString();
  const expiresAt = new Date(input.now.getTime() + staleAfterMs).toISOString();
  return {
    holderId: input.holderId,
    module: input.module,
    acquiredAt: refreshedAt,
    refreshedAt,
    expiresAt,
    requestedBy: input.requestedBy ?? null,
  };
}

export function evaluateNabisSyncLease(input: {
  existingStatus?: IntegrationSyncStatus | null;
  existingMetadata?: unknown;
  existingUpdatedAt?: Date | null;
  holderId: string;
  now: Date;
  staleAfterMs?: number;
}): NabisLeaseDecision {
  const metadata = toJsonObject(input.existingMetadata);
  const activeHolderId = isoFromUnknown(metadata?.holderId);
  const activeModule = isoFromUnknown(metadata?.module);
  const activeRefreshedAt = isoFromUnknown(metadata?.refreshedAt) ?? input.existingUpdatedAt?.toISOString() ?? null;
  const activeExpiresAt = isoFromUnknown(metadata?.expiresAt);
  const refreshedAt = dateFromUnknown(metadata?.refreshedAt) ?? input.existingUpdatedAt ?? null;
  const staleAfterMs = input.staleAfterMs ?? NABIS_SYNC_LEASE_STALE_MS;
  const isStale = !refreshedAt || input.now.getTime() - refreshedAt.getTime() > staleAfterMs;

  if (input.existingStatus !== IntegrationSyncStatus.RUNNING) {
    return { canAcquire: true, reason: 'available', activeHolderId, activeModule, activeRefreshedAt, activeExpiresAt };
  }

  if (activeHolderId === input.holderId) {
    return { canAcquire: true, reason: 'same-holder', activeHolderId, activeModule, activeRefreshedAt, activeExpiresAt };
  }

  if (isStale) {
    return { canAcquire: true, reason: 'stale', activeHolderId, activeModule, activeRefreshedAt, activeExpiresAt };
  }

  return { canAcquire: false, reason: 'held', activeHolderId, activeModule, activeRefreshedAt, activeExpiresAt };
}

export function activeNabisSyncFromLease(input: {
  status?: IntegrationSyncStatus | null;
  metadata?: unknown;
  updatedAt?: Date | null;
  now?: Date;
}) {
  if (input.status !== IntegrationSyncStatus.RUNNING) {
    return null;
  }

  const metadata = toJsonObject(input.metadata);
  const refreshedAt = isoFromUnknown(metadata?.refreshedAt) ?? input.updatedAt?.toISOString() ?? null;
  const expiresAt = isoFromUnknown(metadata?.expiresAt);
  const expiresAtDate = dateFromUnknown(metadata?.expiresAt);
  if (expiresAtDate && expiresAtDate.getTime() <= (input.now ?? new Date()).getTime()) {
    return null;
  }

  return {
    module: isoFromUnknown(metadata?.module),
    refreshedAt,
    expiresAt,
  };
}

function compactString(value: unknown) {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  return null;
}

function normalizeIdentity(value: string | null | undefined) {
  return value?.trim().toUpperCase() || null;
}

function parseCurrency(value: unknown) {
  const numeric = Number.parseFloat(String(value ?? '0').replace(/[^0-9.-]/g, ''));
  return Number.isFinite(numeric) ? numeric : 0;
}

function parseNumber(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const numeric = Number.parseFloat(value.replace(/[^0-9.-]/g, ''));
    return Number.isFinite(numeric) ? numeric : null;
  }
  return null;
}

function parseBoolean(value: unknown) {
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

export function getRetryDelayMs(response: Pick<Response, 'headers'>, attempt: number) {
  const retryAfterHeader = response.headers.get('retry-after');
  const retryAfterSeconds = Number.parseInt(retryAfterHeader || '', 10);
  if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
    return retryAfterSeconds * 1000;
  }
  const retryAfterDate = retryAfterHeader ? new Date(retryAfterHeader) : null;
  if (retryAfterDate && !Number.isNaN(retryAfterDate.getTime())) {
    const dateDelayMs = retryAfterDate.getTime() - Date.now();
    if (dateDelayMs > 0) {
      return dateDelayMs;
    }
  }
  return Math.min(1000 * 2 ** attempt, 10000);
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
    return null;
  }

  const normalized = soldBy.trim();
  if (!normalized) {
    return null;
  }

  const candidate = normalized.includes('@') ? normalized.split('@')[0] : normalized;
  return titleCase(candidate.replace(/[._-]+/g, ' '));
}

function getNetSales(row: NabisOrderApiRow) {
  const orderTotal = parseCurrency(row.orderTotal);
  const orderSubtotal = parseCurrency(row.orderSubtotal);
  const wholesaleValue = parseCurrency(row.wholesaleValue);
  const creditMemo = parseCurrency(row.creditMemo);
  const orderDiscount = parseCurrency(row.orderDiscount);

  if (orderTotal > 0) {
    return Math.max(0, orderTotal - creditMemo - orderDiscount);
  }

  if (orderSubtotal > 0) {
    return Math.max(0, orderSubtotal - creditMemo - orderDiscount);
  }

  if (wholesaleValue > 0) {
    return Math.max(0, wholesaleValue - creditMemo - orderDiscount);
  }

  return Math.max(0, parseCurrency(row.lineItemSubtotalAfterDiscount || row.lineItemSubtotal));
}

function parseRetailerRow(row: NabisRetailerApiRow): ParsedRetailer | null {
  const licensedLocationId = compactString(row.licensedLocationId ?? row.retailerId ?? row.id);
  const name = compactString(row.name);

  if (!licensedLocationId || !name) {
    return null;
  }

  if (isExcludedInternalTransferRetailerName(name)) {
    return null;
  }

  return {
    licensedLocationId,
    externalRetailerId: compactString(row.retailerId ?? row.id),
    licenseNumber: compactString(row.siteLicenseNumber),
    name,
    doingBusinessAs: compactString(row.doingBusinessAs),
    address1: compactString(row.address1),
    address2: compactString(row.address2),
    city: compactString(row.city),
    state: compactString(row.state),
    zipcode: compactString(row.zip ?? row.zipcode),
    geoLat: parseNumber(row.lat ?? row.latitude),
    geoLng: parseNumber(row.lng ?? row.longitude),
  };
}

export function staleNabisRetailerIdsMissingFromFeed(existingLicensedLocationIds: readonly string[], currentLicensedLocationIds: readonly string[]) {
  const currentIds = new Set(
    currentLicensedLocationIds.map((licensedLocationId) => normalizeIdentity(licensedLocationId)).filter((value): value is string => Boolean(value)),
  );
  if (currentIds.size === 0) {
    return [];
  }

  return existingLicensedLocationIds.filter((licensedLocationId) => {
    const normalized = normalizeIdentity(licensedLocationId);
    return Boolean(normalized && !currentIds.has(normalized));
  });
}

export function parseNabisOrderForCache(row: NabisOrderApiRow): ParsedOrder | null {
  const externalOrderId = compactString(row.id ?? row.order);
  if (!externalOrderId) {
    return null;
  }

  const licensedLocationName = compactString(row.retailer);
  if (isExcludedInternalTransferRetailerName(licensedLocationName)) {
    return null;
  }

  const createdDate = parseDate(row.createdTimestamp ?? row.createdDate ?? null);
  const deliveryDate = parseDate(row.deliveryDate ?? null);

  return {
    externalOrderId,
    orderNumber: compactString(row.order),
    licensedLocationId: compactString(row.licensedLocationId ?? row.retailerId),
    nabisRetailerId: compactString(row.retailerId ?? row.licensedLocationId),
    licensedLocationName,
    orderCreatedDate: createdDate,
    deliveryDate,
    status: compactString(row.status)?.toUpperCase() ?? null,
    isInternalTransfer: isInternalTransferRow(row),
    salesRep: normalizeRepName(row.soldBy),
    orderTotal: getNetSales(row),
    paymentStatus: compactString(row.status),
    licenseNumber: compactString(row.siteLicenseNumber),
    line: parseNabisOrderLineForCache(row),
  };
}

export function parseNabisOrderLineForCache(row: NabisOrderApiRow): ParsedOrderLine | null {
  const externalOrderId = compactString(row.id ?? row.order);
  const productName = compactString(row.skuName ?? row.skuDisplayName ?? row.productName ?? row.lineItemProductName ?? row.skuCode ?? row.unitDescription);
  const quantity = parseNumber(row.units ?? row.quantity ?? row.lineItemQuantity);
  const rawSubtotalAfterDiscount = row.lineItemSubtotalAfterDiscount;
  const hasExplicitSubtotal =
    (rawSubtotalAfterDiscount !== null && rawSubtotalAfterDiscount !== undefined && rawSubtotalAfterDiscount !== '') ||
    (row.lineItemSubtotal !== null && row.lineItemSubtotal !== undefined && row.lineItemSubtotal !== '');
  const subtotal =
    rawSubtotalAfterDiscount !== null && rawSubtotalAfterDiscount !== undefined && rawSubtotalAfterDiscount !== ''
      ? parseCurrency(rawSubtotalAfterDiscount)
      : Math.max(0, parseCurrency(row.lineItemSubtotal) - parseCurrency(row.lineItemDiscount));
  const fallbackUnitPrice = parseNumber(row.skuPricePerUnit ?? row.lineItemPricePerUnitAfterDiscount ?? row.pricePerUnit ?? row.unitPrice ?? row.lineItemPricePerUnit);
  const unitPrice = quantity && quantity > 0 && hasExplicitSubtotal ? subtotal / quantity : fallbackUnitPrice;

  if (!externalOrderId || !productName || !quantity || quantity <= 0 || unitPrice == null || unitPrice < 0) {
    return null;
  }

  return {
    externalOrderId,
    productName,
    quantity,
    unitPrice,
    isSample: parseBoolean(row.sample ?? row.isSample ?? row.lineItemIsSample),
    itemStrain: compactString(row.itemStrain),
    itemCategory: compactString(row.itemCategory),
    itemClass: compactString(row.itemClass),
  };
}

const INTERNAL_TRANSFER_ACTIONS = new Set(['PICKUP_FROM_NABIS', 'DROPOFF_TO_NABIS', 'INTERNAL_TRANSFER', 'TRANSFER']);
const INTERNAL_TRANSFER_PATTERNS = [/\binternal transfer\b/i, /\btransfer to nabis\b/i, /\btransfer from nabis\b/i];

function isInternalTransferRow(row: NabisOrderApiRow) {
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

async function fetchNabisPage<T>(path: string, page: number) {
  const apiKey = requiredApiKey();
  const url = new URL(path, getApiBaseUrl());
  url.searchParams.set('page', String(page));
  url.searchParams.set('limit', String(PAGE_SIZE));

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);

    try {
      const response = await fetch(url, {
        headers: {
          'x-nabis-access-token': apiKey,
        },
        signal: controller.signal,
        cache: 'no-store',
      });

      clearTimeout(timeout);

      if (response.status === 429) {
        const retryDelayMs = getRetryDelayMs(response, attempt);
        if (attempt < 5) {
          await wait(retryDelayMs);
          continue;
        }
        throw new NabisRateLimitError(path, retryDelayMs);
      }

      if (!response.ok) {
        const body = await response.text();
        throw new Error(`Nabis request failed (${response.status}) ${path}: ${body}`);
      }

      return (await response.json()) as NabisPagedResponse<T>;
    } catch (error) {
      clearTimeout(timeout);
      const message = error instanceof Error ? error.message : String(error);
      if (attempt < 5 && (((error as Error)?.name ?? '') === 'AbortError' || /fetch failed/i.test(message))) {
        await wait(500 * (attempt + 1));
        continue;
      }
      throw error;
    }
  }

  throw new Error(`Nabis request exhausted retries for ${path}`);
}

async function getNabisLeaseDecision(input: { integrationId: string; holderId: string; now: Date }) {
  const checkpoint = await prisma.syncCheckpoint.findUnique({
    where: {
      integrationId_module: {
        integrationId: input.integrationId,
        module: NABIS_SYNC_LEASE_MODULE,
      },
    },
    select: {
      status: true,
      metadata: true,
      updatedAt: true,
    },
  });

  return evaluateNabisSyncLease({
    existingStatus: checkpoint?.status,
    existingMetadata: checkpoint?.metadata,
    existingUpdatedAt: checkpoint?.updatedAt,
    holderId: input.holderId,
    now: input.now,
  });
}

async function acquireNabisSyncLease(input: { orgId: string; integrationId: string; module: string; actor?: SyncActor }) {
  const holderId = randomUUID();
  const now = new Date();
  const staleCutoff = new Date(now.getTime() - NABIS_SYNC_LEASE_STALE_MS);
  const metadata = buildLeaseMetadata({
    holderId,
    module: input.module,
    now,
    requestedBy: input.actor?.email ?? null,
  });
  const metadataJson = JSON.stringify(metadata);
  const leaseId = `nabis-lease-${input.orgId}`;

  const rows = await prisma.$queryRaw<Array<{ id: string }>>`
    INSERT INTO "SyncCheckpoint" ("id", "orgId", "integrationId", "module", "status", "metadata", "updatedAt")
    VALUES (
      ${leaseId},
      ${input.orgId},
      ${input.integrationId},
      ${NABIS_SYNC_LEASE_MODULE},
      ${IntegrationSyncStatus.RUNNING}::"IntegrationSyncStatus",
      ${metadataJson}::jsonb,
      ${now}
    )
    ON CONFLICT ("integrationId", "module")
    DO UPDATE SET
      "status" = EXCLUDED."status",
      "metadata" = EXCLUDED."metadata",
      "updatedAt" = EXCLUDED."updatedAt"
    WHERE
      "SyncCheckpoint"."status" <> ${IntegrationSyncStatus.RUNNING}::"IntegrationSyncStatus"
      OR "SyncCheckpoint"."updatedAt" < ${staleCutoff}
      OR "SyncCheckpoint"."metadata"->>'holderId' = ${holderId}
    RETURNING "id"
  `;

  if (rows.length > 0) {
    return { holderId, metadata };
  }

  const decision = await getNabisLeaseDecision({ integrationId: input.integrationId, holderId, now: new Date() });
  throw new NabisSyncLeaseError(decision);
}

async function refreshNabisSyncLease(input: { integrationId: string; holderId: string }) {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + NABIS_SYNC_LEASE_STALE_MS).toISOString();
  await prisma.$executeRaw`
    UPDATE "SyncCheckpoint"
    SET
      "metadata" = jsonb_set(
        jsonb_set(
          COALESCE("metadata", '{}'::jsonb),
          '{refreshedAt}',
          to_jsonb(${now.toISOString()}::text),
          true
        ),
        '{expiresAt}',
        to_jsonb(${expiresAt}::text),
        true
      ),
      "updatedAt" = ${now}
    WHERE
      "integrationId" = ${input.integrationId}
      AND "module" = ${NABIS_SYNC_LEASE_MODULE}
      AND "status" = ${IntegrationSyncStatus.RUNNING}::"IntegrationSyncStatus"
      AND "metadata"->>'holderId' = ${input.holderId}
  `;
}

async function releaseNabisSyncLease(input: { integrationId: string; holderId: string; status: IntegrationSyncStatus }) {
  const now = new Date();
  await prisma.$executeRaw`
    UPDATE "SyncCheckpoint"
    SET
      "status" = ${input.status}::"IntegrationSyncStatus",
      "metadata" = jsonb_set(
        COALESCE("metadata", '{}'::jsonb),
        '{releasedAt}',
        to_jsonb(${now.toISOString()}::text),
        true
      ),
      "updatedAt" = ${now}
    WHERE
      "integrationId" = ${input.integrationId}
      AND "module" = ${NABIS_SYNC_LEASE_MODULE}
      AND "metadata"->>'holderId' = ${input.holderId}
  `;
}

async function withNabisSyncLease<T>(
  input: { orgId: string; integrationId: string; module: string; actor?: SyncActor },
  fn: () => Promise<T>,
) {
  const lease = await acquireNabisSyncLease(input);
  let releaseStatus: IntegrationSyncStatus = IntegrationSyncStatus.SUCCESS;
  const heartbeat = setInterval(() => {
    refreshNabisSyncLease({
      integrationId: input.integrationId,
      holderId: lease.holderId,
    }).catch(() => undefined);
  }, NABIS_SYNC_LEASE_REFRESH_MS);

  try {
    return await fn();
  } catch (error) {
    releaseStatus = IntegrationSyncStatus.ERROR;
    throw error;
  } finally {
    clearInterval(heartbeat);
    await releaseNabisSyncLease({
      integrationId: input.integrationId,
      holderId: lease.holderId,
      status: releaseStatus,
    });
  }
}

async function loadRetailersFromNabis() {
  const rows: ParsedRetailer[] = [];
  const feedLicensedLocationIds = new Set<string>();
  let page = 0;

  while (page < MAX_RETAILER_PAGES) {
    if (page > 0) {
      await wait(150);
    }

    const payload = await fetchNabisPage<NabisRetailerApiRow>('/v2/ny/retailer', page);
    const rawRows = payload.data ?? [];
    for (const rawRow of rawRows) {
      const rawLicensedLocationId = compactString(rawRow.licensedLocationId ?? rawRow.retailerId ?? rawRow.id);
      if (rawLicensedLocationId) {
        feedLicensedLocationIds.add(rawLicensedLocationId);
      }
    }
    const pageRows = rawRows.map(parseRetailerRow).filter((row): row is ParsedRetailer => Boolean(row));
    rows.push(...pageRows);

    if (!rawRows.length || payload.nextPage == null || payload.nextPage <= page) {
      break;
    }

    page = payload.nextPage;
  }

  return {
    rows,
    feedLicensedLocationIds: [...feedLicensedLocationIds],
  };
}

export function pageIsOlderThanCutoff(rows: NabisOrderApiRow[], cutoff: Date) {
  const validDates = rows
    .map((row) => parseDate(row.createdTimestamp ?? row.createdDate ?? null))
    .filter((date): date is Date => Boolean(date))
    .sort((left, right) => left.getTime() - right.getTime());

  if (validDates.length === 0) {
    return false;
  }

  return validDates[validDates.length - 1].getTime() < cutoff.getTime();
}

export function filterOrderRowsOnOrAfterCutoff(rows: NabisOrderApiRow[], cutoff: Date) {
  return rows.filter((row) => {
    const createdAt = parseDate(row.createdTimestamp ?? row.createdDate ?? null);
    return !createdAt || createdAt.getTime() >= cutoff.getTime();
  });
}

function resolveOrderSyncCutoff(options?: OrderSyncOptions) {
  if (options?.historicalBackfill) {
    const requested = options.historicalStartDate ? new Date(options.historicalStartDate) : new Date(HISTORICAL_ORDER_BACKFILL_START_DATE);
    if (Number.isNaN(requested.getTime())) {
      throw new Error(`Invalid historical Nabis backfill start date: ${options.historicalStartDate}`);
    }
    return requested;
  }

  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - (options?.reconciliation ? RECONCILIATION_ORDER_SYNC_DAYS : RECENT_ORDER_SYNC_DAYS));
  return cutoff;
}

function orderCreatedTimestamp(order: ParsedOrder) {
  return order.orderCreatedDate?.toISOString() ?? null;
}

function orderDateCoverage(rows: ParsedOrder[]) {
  const timestamps = rows
    .map(orderCreatedTimestamp)
    .filter((value): value is string => Boolean(value))
    .sort();

  return {
    earliestOrderCreatedAt: timestamps[0] ?? null,
    latestOrderCreatedAt: timestamps[timestamps.length - 1] ?? null,
  };
}

function orderSyncModule(options?: OrderSyncOptions) {
  if (options?.historicalBackfill) return 'orders_historical_backfill';
  if (options?.reconciliation) return 'orders_reconcile';
  return 'orders';
}

export function nabisOrderLineFingerprint(line: {
  externalOrderId: string;
  productName: string;
  quantity: number | Prisma.Decimal | null;
  unitPrice: number | Prisma.Decimal | null;
  isSample: boolean;
  itemStrain: string | null;
  itemCategory: string | null;
  itemClass: string | null;
}) {
  return [
    line.externalOrderId,
    line.productName,
    line.quantity == null ? '' : Number(line.quantity).toFixed(4),
    line.unitPrice == null ? '' : Number(line.unitPrice).toFixed(4),
    line.isSample ? 'sample' : 'standard',
    line.itemStrain ?? '',
    line.itemCategory ?? '',
    line.itemClass ?? '',
  ].join('|');
}

function numberFromMetadata(metadata: unknown, key: string) {
  const value = toJsonObject(metadata)?.[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function booleanFromMetadata(metadata: unknown, key: string) {
  return toJsonObject(metadata)?.[key] === true;
}

async function loadOrdersFromNabis(
  options?: OrderSyncOptions & {
    onProgress?: (metadata: LoadedOrdersFromNabis['metadata']) => Promise<void>;
  },
): Promise<LoadedOrdersFromNabis> {
  const rows: ParsedOrder[] = [];
  const cutoff = resolveOrderSyncCutoff(options);
  const cutoffDate = cutoff.toISOString();
  const startPage = options?.historicalBackfill ? Math.max(0, options.startPage ?? 0) : 0;
  const maxPagesPerRun = options?.historicalBackfill ? (options.maxPagesPerRun ?? HISTORICAL_ORDER_BACKFILL_BATCH_PAGES) : MAX_ORDER_PAGES;
  let page = startPage;
  let pagesScanned = 0;
  let recordsRead = 0;
  let cutoffReached = false;
  let nextPage: number | null = null;
  let hasMore = false;

  while (page < MAX_ORDER_PAGES && pagesScanned < maxPagesPerRun) {
    if (pagesScanned > 0 || page > startPage) {
      await wait(175);
    }

    const payload = await fetchNabisPage<NabisOrderApiRow>('/v2/ny/order', page);
    const pageRows = payload.data ?? [];
    const rowsToParse = options?.historicalBackfill ? filterOrderRowsOnOrAfterCutoff(pageRows, cutoff) : pageRows;
    const parsedRows = rowsToParse.map(parseNabisOrderForCache).filter((row): row is ParsedOrder => Boolean(row));
    rows.push(...parsedRows);
    pagesScanned += 1;
    recordsRead += pageRows.length;

    const payloadNextPage = payload.nextPage != null && payload.nextPage > page ? payload.nextPage : null;
    cutoffReached = pageIsOlderThanCutoff(pageRows, cutoff);
    const exhausted = !pageRows.length || payloadNextPage == null || cutoffReached;
    const hitPageBudget = pagesScanned >= maxPagesPerRun;
    nextPage = exhausted ? null : payloadNextPage;
    hasMore = Boolean(nextPage != null && (hitPageBudget || !exhausted));

    await options?.onProgress?.({
      cutoffDate,
      historicalBackfill: Boolean(options?.historicalBackfill),
      reconciliation: Boolean(options?.reconciliation),
      pagesScanned,
      recordsRead,
      cutoffReached,
      startPage,
      nextPage,
      hasMore,
      ...orderDateCoverage(rows),
    });

    if (exhausted || hitPageBudget || nextPage == null) {
      break;
    }

    page = nextPage;
  }

  return {
    rows,
    metadata: {
      cutoffDate,
      historicalBackfill: Boolean(options?.historicalBackfill),
      reconciliation: Boolean(options?.reconciliation),
      pagesScanned,
      recordsRead,
      cutoffReached,
      startPage,
      nextPage,
      hasMore,
      ...orderDateCoverage(rows),
    },
  };
}

async function ensureNabisIntegration(orgId: string) {
  return prisma.integrationConnection.upsert({
    where: {
      id: `nabis-${orgId}`,
    },
    update: {
      enabled: true,
      provider: IntegrationProvider.NABIS,
      name: 'Nabis',
      config: {},
    },
    create: {
      id: `nabis-${orgId}`,
      orgId,
      provider: IntegrationProvider.NABIS,
      name: 'Nabis',
      config: {},
      enabled: true,
    },
  });
}

async function markSyncCheckpoint(input: {
  orgId: string;
  integrationId: string;
  module: string;
  status: IntegrationSyncStatus;
  metadata?: Record<string, unknown>;
}) {
  const metadata = input.metadata as Prisma.InputJsonValue | undefined;

  await prisma.syncCheckpoint.upsert({
    where: {
      integrationId_module: {
        integrationId: input.integrationId,
        module: input.module,
      },
    },
    update: {
      status: input.status,
      metadata,
      cursor: null,
      checksum: null,
      updatedAt: new Date(),
    },
    create: {
      orgId: input.orgId,
      integrationId: input.integrationId,
      module: input.module,
      status: input.status,
      metadata,
    },
  });
}

async function withSyncRun<T>(
  input: { orgId: string; integrationId: string; module: string; actor?: SyncActor },
  fn: (runId: string) => Promise<{ result: T; recordsIn: number; recordsUpserted: number; metadata?: Record<string, unknown> }>,
) {
  const run = await prisma.syncRun.create({
    data: {
      orgId: input.orgId,
      integrationId: input.integrationId,
      module: input.module,
      status: IntegrationSyncStatus.RUNNING,
      metadata: (input.actor?.email ? { requestedBy: input.actor.email } : undefined) as Prisma.InputJsonValue | undefined,
    },
  });

  try {
    const outcome = await fn(run.id);
    await prisma.syncRun.update({
      where: { id: run.id },
      data: {
        status: IntegrationSyncStatus.SUCCESS,
        finishedAt: new Date(),
        recordsIn: outcome.recordsIn,
        recordsUpserted: outcome.recordsUpserted,
        metadata: outcome.metadata as Prisma.InputJsonValue | undefined,
      },
    });
    await prisma.integrationConnection.update({
      where: { id: input.integrationId },
      data: {
        status: IntegrationSyncStatus.SUCCESS,
        lastSyncedAt: new Date(),
      },
    });
    await markSyncCheckpoint({
      orgId: input.orgId,
      integrationId: input.integrationId,
      module: input.module,
      status: IntegrationSyncStatus.SUCCESS,
      metadata: {
        ...outcome.metadata,
        lastSuccessfulSyncAt: new Date().toISOString(),
      },
    });

    return outcome.result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const errorMetadata =
      error instanceof NabisRateLimitError
        ? {
            error: message,
            rateLimited: true,
            retryAfterMs: error.retryAfterMs,
            path: error.path,
          }
        : error instanceof NabisSyncLeaseError
          ? {
              error: message,
              leaseRefused: true,
              activeHolderId: error.decision.activeHolderId,
              activeModule: error.decision.activeModule,
              activeRefreshedAt: error.decision.activeRefreshedAt,
              activeExpiresAt: error.decision.activeExpiresAt,
            }
          : {
              error: message,
            };
    await prisma.syncRun.update({
      where: { id: run.id },
      data: {
        status: IntegrationSyncStatus.ERROR,
        finishedAt: new Date(),
        error: message,
        metadata: errorMetadata as Prisma.InputJsonValue,
      },
    });
    await prisma.integrationConnection.update({
      where: { id: input.integrationId },
      data: {
        status: IntegrationSyncStatus.ERROR,
      },
    });
    await markSyncCheckpoint({
      orgId: input.orgId,
      integrationId: input.integrationId,
      module: input.module,
      status: IntegrationSyncStatus.ERROR,
      metadata: errorMetadata,
    });
    await appendAuditEvent({
      orgId: input.orgId,
      action: 'NABIS_SYNC_FAILED',
      entityType: 'SyncRun',
      entityId: run.id,
      actorClerkUserId: input.actor?.clerkUserId ?? null,
      actorEmail: input.actor?.email ?? null,
      reason: message,
      metadata: {
        module: input.module,
      },
    });
    throw error;
  }
}

function retailerSystemFieldsChanged(
  account: {
    name: string;
    licensedLocationId: string | null;
    nabisRetailerId: string | null;
    licenseNumber: string;
    address1: string;
    address2: string | null;
    city: string;
    state: string;
    zipcode: string;
    geoLat: number | null;
    geoLng: number | null;
    notionPageId: string | null;
  } | null,
  retailer: ParsedRetailer,
) {
  if (!account) {
    return true;
  }

  return (
    account.name !== retailer.name ||
    normalizeIdentity(account.licensedLocationId) !== normalizeIdentity(retailer.licensedLocationId) ||
    normalizeIdentity(account.nabisRetailerId) !== normalizeIdentity(retailer.externalRetailerId) ||
    normalizeIdentity(account.licenseNumber) !== normalizeIdentity(retailer.licenseNumber ?? retailer.licensedLocationId) ||
    account.address1 !== (retailer.address1 ?? '') ||
    (account.address2 ?? '') !== (retailer.address2 ?? '') ||
    account.city !== (retailer.city ?? '') ||
    account.state !== (retailer.state ?? '') ||
    account.zipcode !== (retailer.zipcode ?? '') ||
    account.geoLat !== retailer.geoLat ||
    account.geoLng !== retailer.geoLng
  );
}

async function upsertLocalAccountFromRetailer(
  orgId: string,
  retailer: ParsedRetailer,
  hasOrders: boolean,
  actor?: SyncActor,
  options?: { syncCrm?: boolean },
) {
  const resolved =
    (await resolveCanonicalAccountByIdentifiers({
      orgId,
      licensedLocationId: retailer.licensedLocationId,
      nabisRetailerId: retailer.externalRetailerId,
      licenseNumber: retailer.licenseNumber,
      alias: retailer.name,
    })) ??
    (await prisma.account.findFirst({
      where: {
        orgId,
        OR: [
          { licensedLocationId: retailer.licensedLocationId },
          ...(retailer.externalRetailerId ? [{ nabisRetailerId: retailer.externalRetailerId }] : []),
          ...(retailer.licenseNumber ? [{ licenseNumber: retailer.licenseNumber }] : []),
          { name: retailer.name },
        ],
      },
    }));

  const existingAccount = resolved
    ? await prisma.account.findUnique({
        where: { id: resolved.id },
      })
    : null;

  const defaultLicenseNumber = retailer.licenseNumber ?? retailer.licensedLocationId;
  const changed = retailerSystemFieldsChanged(existingAccount, retailer);

  const account = existingAccount
    ? await prisma.account.update({
        where: { id: existingAccount.id },
        data: {
          name: retailer.name,
          licensedLocationId: retailer.licensedLocationId,
          nabisRetailerId: retailer.externalRetailerId,
          licenseNumber: defaultLicenseNumber,
          address1: retailer.address1 ?? '',
          address2: retailer.address2 ?? null,
          city: retailer.city ?? '',
          state: retailer.state ?? '',
          zipcode: retailer.zipcode ?? '',
          geoLat: retailer.geoLat,
          geoLng: retailer.geoLng,
        },
      })
    : await prisma.account.create({
        data: {
          orgId,
          name: retailer.name,
          notionPageId: null,
          licensedLocationId: retailer.licensedLocationId,
          nabisRetailerId: retailer.externalRetailerId,
          licenseNumber: defaultLicenseNumber,
          address1: retailer.address1 ?? '',
          address2: retailer.address2 ?? null,
          city: retailer.city ?? '',
          state: retailer.state ?? '',
          zipcode: retailer.zipcode ?? '',
          phone: null,
          geoLat: retailer.geoLat,
          geoLng: retailer.geoLng,
        },
      });

  let notionPageId = account.notionPageId;
  const shouldSyncCrm = options?.syncCrm === true;

  if (shouldSyncCrm && (changed || !account.notionPageId)) {
    const notion = await ensureDispensaryCrmPageFromRetailer({
      licensedLocationId: retailer.licensedLocationId,
      nabisRetailerId: retailer.externalRetailerId,
      licenseNumber: retailer.licenseNumber,
      name: retailer.name,
      doingBusinessAs: retailer.doingBusinessAs,
      address1: retailer.address1,
      address2: retailer.address2,
      city: retailer.city,
      state: retailer.state,
      zipcode: retailer.zipcode,
      hasOrders,
      notionPageId: account.notionPageId,
    });
    notionPageId = notion.pageId;

    await prisma.account.update({
      where: { id: account.id },
      data: {
        notionPageId,
      },
    });

    await appendAuditEvent({
      orgId,
      action: notion.created ? 'CRM_ACCOUNT_CREATED_FROM_NABIS' : 'CRM_ACCOUNT_LINKED_FROM_NABIS',
      entityType: 'Account',
      entityId: account.id,
      actorClerkUserId: actor?.clerkUserId ?? null,
      actorEmail: actor?.email ?? null,
      metadata: {
        licensedLocationId: retailer.licensedLocationId,
        notionPageId,
      },
    });
  }

  await ensureAccountIdentityMappings({
    orgId,
    accountId: account.id,
    notionPageId,
    licensedLocationId: retailer.licensedLocationId,
    nabisRetailerId: retailer.externalRetailerId,
    licenseNumber: retailer.licenseNumber ?? defaultLicenseNumber,
    aliases: [retailer.name, retailer.doingBusinessAs].filter((value): value is string => Boolean(value)),
    source: 'NABIS_SYNC',
    actorClerkUserId: actor?.clerkUserId ?? null,
    actorEmail: actor?.email ?? null,
  });

  return { ...account, notionPageId };
}

async function rebuildDailyMetrics(orgId: string, licensedLocationIds: string[]) {
  const uniqueIds = [...new Set(licensedLocationIds.filter(Boolean))];
  if (uniqueIds.length === 0) {
    return 0;
  }

  const rows = await prisma.nabisOrder.findMany({
    where: {
      orgId,
      licensedLocationId: {
        in: uniqueIds,
      },
    },
    select: {
      licensedLocationId: true,
      accountId: true,
      orderCreatedDate: true,
      deliveryDate: true,
      orderTotal: true,
    },
  });

  const metrics = new Map<
    string,
    {
      orgId: string;
      accountId: string | null;
      licensedLocationId: string;
      metricDate: Date;
      orderCount: number;
      revenue: Prisma.Decimal;
      firstOrderAt: Date | null;
      lastOrderAt: Date | null;
      lastSyncedAt: Date;
    }
  >();

  for (const row of rows) {
    if (!row.licensedLocationId) continue;
    const effectiveDate = row.deliveryDate ?? row.orderCreatedDate;
    if (!effectiveDate) continue;

    const metricDate = new Date(Date.UTC(effectiveDate.getUTCFullYear(), effectiveDate.getUTCMonth(), effectiveDate.getUTCDate()));
    const key = `${row.licensedLocationId}:${metricDate.toISOString()}`;
    const current = metrics.get(key) ?? {
      orgId,
      accountId: row.accountId ?? null,
      licensedLocationId: row.licensedLocationId,
      metricDate,
      orderCount: 0,
      revenue: new Prisma.Decimal(0),
      firstOrderAt: null,
      lastOrderAt: null,
      lastSyncedAt: new Date(),
    };

    current.orderCount += 1;
    current.revenue = current.revenue.plus(row.orderTotal ?? 0);
    current.firstOrderAt =
      !current.firstOrderAt || effectiveDate.getTime() < current.firstOrderAt.getTime() ? effectiveDate : current.firstOrderAt;
    current.lastOrderAt =
      !current.lastOrderAt || effectiveDate.getTime() > current.lastOrderAt.getTime() ? effectiveDate : current.lastOrderAt;
    if (row.accountId) {
      current.accountId = row.accountId;
    }

    metrics.set(key, current);
  }

  await prisma.$transaction([
    prisma.nabisStoreMetricDaily.deleteMany({
      where: {
        orgId,
        licensedLocationId: {
          in: uniqueIds,
        },
      },
    }),
    prisma.nabisStoreMetricDaily.createMany({
      data: [...metrics.values()].map((row) => ({
        orgId: row.orgId,
        accountId: row.accountId,
        licensedLocationId: row.licensedLocationId,
        metricDate: row.metricDate,
        orderCount: row.orderCount,
        revenue: row.revenue,
        firstOrderAt: row.firstOrderAt,
        lastOrderAt: row.lastOrderAt,
        lastSyncedAt: row.lastSyncedAt,
      })),
    }),
  ]);

  return metrics.size;
}

async function refreshRetailerRollups(orgId: string, licensedLocationIds: string[]) {
  const uniqueIds = [...new Set(licensedLocationIds.filter(Boolean))];
  if (uniqueIds.length === 0) {
    return;
  }

  const rows = await prisma.nabisOrder.findMany({
    where: {
      orgId,
      licensedLocationId: {
        in: uniqueIds,
      },
    },
    select: {
      licensedLocationId: true,
      orderCreatedDate: true,
      deliveryDate: true,
      orderTotal: true,
    },
  });

  const aggregates = new Map<
    string,
    {
      orderCount: number;
      lifetimeRevenue: Prisma.Decimal;
      firstOrderAt: Date | null;
      lastOrderAt: Date | null;
    }
  >();

  for (const row of rows) {
    if (!row.licensedLocationId) continue;
    const effectiveDate = row.deliveryDate ?? row.orderCreatedDate;
    const current = aggregates.get(row.licensedLocationId) ?? {
      orderCount: 0,
      lifetimeRevenue: new Prisma.Decimal(0),
      firstOrderAt: null,
      lastOrderAt: null,
    };

    current.orderCount += 1;
    current.lifetimeRevenue = current.lifetimeRevenue.plus(row.orderTotal ?? 0);
    if (effectiveDate) {
      current.firstOrderAt =
        !current.firstOrderAt || effectiveDate.getTime() < current.firstOrderAt.getTime() ? effectiveDate : current.firstOrderAt;
      current.lastOrderAt =
        !current.lastOrderAt || effectiveDate.getTime() > current.lastOrderAt.getTime() ? effectiveDate : current.lastOrderAt;
    }

    aggregates.set(row.licensedLocationId, current);
  }

  await Promise.all(
    uniqueIds.map((licensedLocationId) => {
      const aggregate = aggregates.get(licensedLocationId);
      return prisma.nabisRetailer.updateMany({
        where: {
          orgId,
          licensedLocationId,
        },
        data: {
          orderCount: aggregate?.orderCount ?? 0,
          lifetimeRevenue: aggregate?.lifetimeRevenue ?? new Prisma.Decimal(0),
          firstOrderAt: aggregate?.firstOrderAt ?? null,
          lastOrderAt: aggregate?.lastOrderAt ?? null,
          lastSyncedAt: new Date(),
        },
      });
    }),
  );
}

export async function syncNabisRetailers(orgId: string, actor?: SyncActor) {
  return syncNabisRetailersWithOptions(orgId, actor, { syncCrm: true });
}

export async function syncNabisRetailersWithOptions(orgId: string, actor?: SyncActor, options?: { syncCrm?: boolean }) {
  await ensureActivePolicySnapshot(orgId, actor);
  const integration = await ensureNabisIntegration(orgId);

  return withNabisSyncLease({ orgId, integrationId: integration.id, module: 'retailers', actor }, () =>
    syncNabisRetailersCore(orgId, integration.id, actor, options),
  );
}

async function syncNabisRetailersCore(orgId: string, integrationId: string, actor?: SyncActor, options?: { syncCrm?: boolean }) {
  const existingOrderIds = await prisma.nabisOrder.findMany({
    where: { orgId },
    select: { licensedLocationId: true },
  });
  const orderBackedStores = new Set(existingOrderIds.map((row) => row.licensedLocationId).filter((value): value is string => Boolean(value)));

  return withSyncRun({ orgId, integrationId, module: 'retailers', actor }, async () => {
    const loadedRetailers = await loadRetailersFromNabis();
    const retailers = loadedRetailers.rows;
    const existingRetailers = await prisma.nabisRetailer.findMany({
      where: { orgId },
      select: { licensedLocationId: true },
    });
    const staleLicensedLocationIds = staleNabisRetailerIdsMissingFromFeed(
      existingRetailers.map((retailer) => retailer.licensedLocationId),
      loadedRetailers.feedLicensedLocationIds,
    );
    const staleRetailersRetained = staleLicensedLocationIds.length;

    await prisma.nabisRetailer.deleteMany({
      where: {
        orgId,
        OR: excludedInternalTransferRetailers.map((value) => ({
          name: {
            equals: value,
            mode: 'insensitive' as const,
          },
        })),
      },
    });
    let upserted = 0;

    for (const retailer of retailers) {
      const account = await upsertLocalAccountFromRetailer(
        orgId,
        retailer,
        orderBackedStores.has(retailer.licensedLocationId),
        actor,
        { syncCrm: options?.syncCrm === true },
      );

      const matchingCacheRows = await prisma.nabisRetailer.findMany({
        where: {
          orgId,
          OR: [
            { licensedLocationId: retailer.licensedLocationId },
            ...(retailer.externalRetailerId ? [{ externalRetailerId: retailer.externalRetailerId }] : []),
          ],
        },
        select: { id: true, licensedLocationId: true, externalRetailerId: true },
      });
      const existingCacheRow =
        matchingCacheRows.find((row) => normalizeIdentity(row.licensedLocationId) === normalizeIdentity(retailer.licensedLocationId)) ??
        matchingCacheRows.find((row) => normalizeIdentity(row.externalRetailerId) === normalizeIdentity(retailer.externalRetailerId)) ??
        matchingCacheRows[0] ??
        null;
      const retailerCacheData = {
        accountId: account.id,
        notionPageId: account.notionPageId,
        licensedLocationId: retailer.licensedLocationId,
        externalRetailerId: retailer.externalRetailerId,
        licenseNumber: retailer.licenseNumber,
        name: retailer.name,
        doingBusinessAs: retailer.doingBusinessAs,
        address1: retailer.address1,
        address2: retailer.address2,
        city: retailer.city,
        state: retailer.state,
        zipcode: retailer.zipcode,
        geoLat: retailer.geoLat,
        geoLng: retailer.geoLng,
        lastSyncedAt: new Date(),
      };

      if (existingCacheRow) {
        const duplicateCacheRowIds = matchingCacheRows.map((row) => row.id).filter((id) => id !== existingCacheRow.id);
        if (duplicateCacheRowIds.length > 0) {
          await prisma.nabisRetailer.deleteMany({
            where: {
              orgId,
              id: {
                in: duplicateCacheRowIds,
              },
            },
          });
        }

        await prisma.nabisRetailer.update({
          where: { id: existingCacheRow.id },
          data: retailerCacheData,
        });
      } else {
        await prisma.nabisRetailer.create({
          data: {
            orgId,
            ...retailerCacheData,
          },
        });
      }
      upserted += 1;
    }

    return {
      result: {
        retailers: retailers.length,
        upserted,
        pruned: 0,
        staleRetailersRetained,
      },
      recordsIn: retailers.length,
      recordsUpserted: upserted,
      metadata: {
        retailers: retailers.length,
        prunedRetailers: 0,
        staleRetailersRetained,
        crmMirrored: options?.syncCrm === true,
      },
    };
  });
}

export async function syncNabisOrders(orgId: string, actor?: SyncActor, options?: OrderSyncOptions) {
  await ensureActivePolicySnapshot(orgId, actor);
  const integration = await ensureNabisIntegration(orgId);
  const syncModuleName = orderSyncModule(options);

  return withNabisSyncLease({ orgId, integrationId: integration.id, module: syncModuleName, actor }, () =>
    syncNabisOrdersCore(orgId, integration.id, actor, options),
  );
}

async function syncNabisOrdersCore(orgId: string, integrationId: string, actor?: SyncActor, options?: OrderSyncOptions) {
  const syncModuleName = orderSyncModule(options);
  return withSyncRun({ orgId, integrationId, module: syncModuleName, actor }, async () => {
    const previousCheckpoint = options?.historicalBackfill
      ? await prisma.syncCheckpoint.findUnique({
          where: {
            integrationId_module: {
              integrationId,
              module: syncModuleName,
            },
          },
          select: {
            metadata: true,
            status: true,
          },
        })
      : null;
    const previousMetadata = previousCheckpoint?.metadata;
    const previousProgressCommitted = previousCheckpoint?.status === IntegrationSyncStatus.SUCCESS;
    const previousCutoffReached = booleanFromMetadata(previousMetadata, 'cutoffReached');
    const previousHistoricalBackfill = booleanFromMetadata(previousMetadata, 'historicalBackfill');
    const previousHasMore = booleanFromMetadata(previousMetadata, 'hasMore');
    const previousNextPage = numberFromMetadata(previousMetadata, 'nextPage');
    const previousBackfillComplete =
      previousProgressCommitted && previousHistoricalBackfill && (previousCutoffReached || (!previousHasMore && previousNextPage == null));
    const resumeStartPage =
      options?.historicalBackfill && !options.resetHistoricalBackfill && previousProgressCommitted && previousNextPage != null && !previousBackfillComplete
        ? previousNextPage
        : undefined;

    if (options?.historicalBackfill && previousBackfillComplete && !options.resetHistoricalBackfill) {
      const metadata = {
        ...(toJsonObject(previousMetadata) ?? {}),
        historicalBackfill: true,
        skipped: true,
        skipReason: 'Historical Nabis backfill is already complete. Pass resetHistoricalBackfill to restart.',
      };
      return {
        result: {
          orders: 0,
          upserted: 0,
          lineItems: 0,
          metricRows: 0,
        },
        recordsIn: 0,
        recordsUpserted: 0,
        metadata,
      };
    }

    const loadedOrders = await loadOrdersFromNabis({
      ...options,
      startPage: resumeStartPage ?? options?.startPage,
      onProgress: async (metadata) => {
        await markSyncCheckpoint({
          orgId,
          integrationId,
          module: syncModuleName,
          status: IntegrationSyncStatus.RUNNING,
          metadata,
        });
      },
    });
    const orders = loadedOrders.rows;
    await prisma.nabisOrder.deleteMany({
      where: {
        orgId,
        OR: [
          { isInternalTransfer: true },
          ...excludedInternalTransferRetailers.map((value) => ({
            licensedLocationName: {
              equals: value,
              mode: 'insensitive' as const,
            },
          })),
        ],
      },
    });
    const accounts = await prisma.account.findMany({
      where: { orgId },
      select: {
        id: true,
        licensedLocationId: true,
        nabisRetailerId: true,
        licenseNumber: true,
      },
    });

    const accountByLicensedLocationId = new Map(accounts.map((account) => [normalizeIdentity(account.licensedLocationId) ?? '', account]));
    const accountByNabisRetailerId = new Map(accounts.map((account) => [normalizeIdentity(account.nabisRetailerId) ?? '', account]));
    const accountByLicenseNumber = new Map(accounts.map((account) => [normalizeIdentity(account.licenseNumber) ?? '', account]));

    let upserted = 0;
    let upsertedLines = 0;
    const touchedLicensedLocationIds = new Set<string>();
    const lineRows = orders.map((order) => order.line).filter((line): line is ParsedOrderLine => Boolean(line));
    const orderRows: Array<{
      externalOrderId: string;
      data: {
        accountId: string | null;
        externalOrderId: string;
        orderNumber: string | null;
        licensedLocationId: string | null;
        nabisRetailerId: string | null;
        licensedLocationName: string | null;
        orderCreatedDate: Date | null;
        status: string | null;
        isInternalTransfer: boolean;
        orderTotal: Prisma.Decimal;
        paymentStatus: string | null;
        deliveryDate: Date | null;
        salesRep: string | null;
        poSoNumber: string | null;
      };
    }> = [];

    for (const order of orders) {
      const matchedAccount =
        (order.licensedLocationId ? accountByLicensedLocationId.get(normalizeIdentity(order.licensedLocationId) ?? '') : null) ||
        (order.nabisRetailerId ? accountByNabisRetailerId.get(normalizeIdentity(order.nabisRetailerId) ?? '') : null) ||
        (order.licenseNumber ? accountByLicenseNumber.get(normalizeIdentity(order.licenseNumber) ?? '') : null) ||
        (await resolveCanonicalAccountByIdentifiers({
          orgId,
          licensedLocationId: order.licensedLocationId,
          nabisRetailerId: order.nabisRetailerId,
          licenseNumber: order.licenseNumber,
          alias: order.licensedLocationName,
        }));

      const orderData = {
        accountId: matchedAccount?.id ?? null,
        externalOrderId: order.externalOrderId,
        orderNumber: order.orderNumber,
        licensedLocationId: order.licensedLocationId,
        nabisRetailerId: order.nabisRetailerId,
        licensedLocationName: order.licensedLocationName,
        orderCreatedDate: order.orderCreatedDate,
        status: order.status,
        isInternalTransfer: order.isInternalTransfer,
        orderTotal: new Prisma.Decimal(order.orderTotal),
        paymentStatus: order.paymentStatus,
        deliveryDate: order.deliveryDate,
        salesRep: order.salesRep,
        poSoNumber: null,
      };
      orderRows.push({
        externalOrderId: order.externalOrderId,
        data: orderData,
      });

      if (order.licensedLocationId) {
        touchedLicensedLocationIds.add(order.licensedLocationId);
      }
    }

    const uniqueOrderRows = [...new Map(orderRows.map((row) => [row.externalOrderId, row])).values()];
    for (const batch of chunkArray(uniqueOrderRows, ORDER_UPSERT_BATCH_SIZE)) {
      await Promise.all(
        batch.map((row) =>
          prisma.nabisOrder.upsert({
            where: {
              orgId_externalOrderId: {
                orgId,
                externalOrderId: row.externalOrderId,
              },
            },
            update: row.data,
            create: {
              orgId,
              ...row.data,
            },
          }),
        ),
      );
      upserted += batch.length;
    }

    const lineExternalOrderIds = [...new Set(lineRows.map((line) => line.externalOrderId))];
    if (lineExternalOrderIds.length > 0) {
      const persistedOrders = await prisma.nabisOrder.findMany({
        where: {
          orgId,
          externalOrderId: {
            in: lineExternalOrderIds,
          },
        },
        select: {
          id: true,
          externalOrderId: true,
        },
      });
      const orderIdByExternalId = new Map(persistedOrders.map((order) => [order.externalOrderId, order.id]));
      const existingHistoricalLineFingerprints = options?.historicalBackfill
        ? new Set(
            (
              await prisma.nabisOrderLine.findMany({
                where: {
                  orgId,
                  externalOrderId: {
                    in: lineExternalOrderIds,
                  },
                },
                select: {
                  externalOrderId: true,
                  productName: true,
                  quantity: true,
                  unitPrice: true,
                  isSample: true,
                  itemStrain: true,
                  itemCategory: true,
                  itemClass: true,
                },
              })
            ).map(nabisOrderLineFingerprint),
          )
        : null;

      if (!options?.historicalBackfill) {
        await prisma.nabisOrderLine.deleteMany({
          where: {
            orgId,
            externalOrderId: {
              in: lineExternalOrderIds,
            },
          },
        });
      }

      const linesToCreate = lineRows
        .map((line) => {
          const nabisOrderId = orderIdByExternalId.get(line.externalOrderId);
          if (!nabisOrderId) {
            return null;
          }

          return {
            orgId,
            nabisOrderId,
            externalOrderId: line.externalOrderId,
            productName: line.productName,
            quantity: new Prisma.Decimal(line.quantity),
            unitPrice: new Prisma.Decimal(line.unitPrice),
            isSample: line.isSample,
            itemStrain: line.itemStrain,
            itemCategory: line.itemCategory,
            itemClass: line.itemClass,
          };
        })
        .filter((line): line is NonNullable<typeof line> => {
          if (!line) {
            return false;
          }
          return !existingHistoricalLineFingerprints?.has(nabisOrderLineFingerprint(line));
        });

      for (const batch of chunkArray(linesToCreate, ORDER_UPSERT_BATCH_SIZE)) {
        await prisma.nabisOrderLine.createMany({
          data: batch,
        });
        upsertedLines += batch.length;
      }
    }

    const metricRows = await rebuildDailyMetrics(orgId, [...touchedLicensedLocationIds]);
    await refreshRetailerRollups(orgId, [...touchedLicensedLocationIds]);

    await prisma.nabisRetailer.updateMany({
      where: {
        orgId,
        licensedLocationId: {
          in: [...touchedLicensedLocationIds],
        },
      },
      data: {
        lastSyncedAt: new Date(),
      },
    });

    return {
      result: {
        orders: orders.length,
        upserted,
        lineItems: upsertedLines,
        metricRows,
      },
      recordsIn: orders.length,
      recordsUpserted: upserted,
      metadata: {
        ...loadedOrders.metadata,
        orders: orders.length,
        uniqueOrders: upserted,
        lineItems: upsertedLines,
        metricRows,
      },
    };
  });
}

export async function syncNabisRetailersAndOrders(orgId: string, actor?: SyncActor, options?: OrderSyncOptions & { syncCrm?: boolean }) {
  await ensureActivePolicySnapshot(orgId, actor);
  const integration = await ensureNabisIntegration(orgId);

  return withNabisSyncLease(
    { orgId, integrationId: integration.id, module: options?.historicalBackfill ? 'retailers_and_orders_historical_backfill' : options?.reconciliation ? 'retailers_and_orders_reconcile' : 'retailers_and_orders', actor },
    async () => {
      const retailerResult = await syncNabisRetailersCore(orgId, integration.id, actor, { syncCrm: options?.syncCrm === true });
      const orderResult = await syncNabisOrdersCore(orgId, integration.id, actor, options);

      return {
        retailers: retailerResult,
        orders: orderResult,
      };
    },
  );
}

export async function getNabisSyncFreshness(orgId: string) {
  const integration = await prisma.integrationConnection.findFirst({
    where: {
      orgId,
      provider: IntegrationProvider.NABIS,
    },
    select: {
      lastSyncedAt: true,
      status: true,
      checkpoints: {
        where: {
          module: {
            in: ['retailers', 'orders', 'orders_reconcile', NABIS_SYNC_LEASE_MODULE],
          },
        },
        select: {
          module: true,
          status: true,
          metadata: true,
          updatedAt: true,
        },
      },
    },
  });

  const byModule = new Map((integration?.checkpoints ?? []).map((checkpoint) => [checkpoint.module, checkpoint]));

  const retailerCheckpoint = byModule.get('retailers');
  const orderCheckpoint = byModule.get('orders');
  const reconcileCheckpoint = byModule.get('orders_reconcile');
  const leaseCheckpoint = byModule.get(NABIS_SYNC_LEASE_MODULE);

  const orderSyncAt =
    ((orderCheckpoint?.metadata as Record<string, unknown> | null)?.lastSuccessfulSyncAt as string | undefined) ??
    orderCheckpoint?.updatedAt.toISOString() ??
    null;
  const retailerSyncAt =
    ((retailerCheckpoint?.metadata as Record<string, unknown> | null)?.lastSuccessfulSyncAt as string | undefined) ??
    retailerCheckpoint?.updatedAt.toISOString() ??
    null;

  return {
    integrationStatus: integration?.status ?? IntegrationSyncStatus.IDLE,
    lastSyncAt: integration?.lastSyncedAt?.toISOString() ?? null,
    lastOrderSyncAt: orderSyncAt,
    lastRetailerSyncAt: retailerSyncAt,
    lastReconciliationAt:
      ((reconcileCheckpoint?.metadata as Record<string, unknown> | null)?.lastSuccessfulSyncAt as string | undefined) ??
      reconcileCheckpoint?.updatedAt.toISOString() ??
      null,
    activeSync: activeNabisSyncFromLease({
      status: leaseCheckpoint?.status,
      metadata: leaseCheckpoint?.metadata,
      updatedAt: leaseCheckpoint?.updatedAt,
    }),
  };
}
