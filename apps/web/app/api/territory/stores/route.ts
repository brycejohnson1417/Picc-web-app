import { NextResponse } from 'next/server';
import { requireTerritoryApiAccess } from '@/lib/auth/territory-access';
import { loadTerritoryStores, processPendingTerritoryStoreSyncQueue } from '@/lib/server/notion-territory';
import type { PreferredPartnerFilter } from '@/lib/territory/preferred-partner';
import type { TerritoryStoresResponse } from '@/lib/territory/types';

export const dynamic = 'force-dynamic';

const TERRITORY_RESPONSE_CACHE_TTL_MS = 1000 * 30;

type TerritoryCacheEntry = {
  expiresAt: number;
  payload: TerritoryStoresResponse;
};

const territoryStoresCache = new Map<string, TerritoryCacheEntry>();

function readMultiParam(searchParams: URLSearchParams, key: string) {
  return searchParams
    .getAll(key)
    .flatMap((value) => value.split(','))
    .map((value) => value.trim())
    .filter(Boolean);
}

function buildTerritoryCacheKey(input: {
  statuses: string[];
  reps: string[];
  pppStatuses: string[];
  headsetConnectionStatuses: string[];
  preferredPartnerFilter: PreferredPartnerFilter;
  referralSources: string[];
  includeNoReferralSource: boolean;
  vendorDayStatuses: string[];
  locationAvailability: string;
  hasSampleOrderDate: boolean;
  noLastSampleDeliveryDate: boolean;
  sampleAccountTypeFilter: string;
  lastOrderDateFilter: string;
  query: string;
}) {
  return JSON.stringify(input);
}

function readTerritoryCache(cacheKey: string) {
  const cached = territoryStoresCache.get(cacheKey);
  if (!cached) {
    return null;
  }

  if (cached.expiresAt <= Date.now()) {
    territoryStoresCache.delete(cacheKey);
    return null;
  }

  return cached.payload;
}

export async function GET(request: Request) {
  const access = await requireTerritoryApiAccess();
  if ('error' in access) {
    return access.error;
  }

  const { searchParams } = new URL(request.url);
  const statuses = readMultiParam(searchParams, 'status');
  const reps = readMultiParam(searchParams, 'rep');
  const pppStatuses = readMultiParam(searchParams, 'pppStatus');
  const headsetConnectionStatuses = readMultiParam(searchParams, 'headsetConnectionStatus');
  const preferredPartnerFilterParam = (searchParams.get('preferredPartner') ?? 'all').trim().toLowerCase();
  const preferredPartnerFilter: PreferredPartnerFilter =
    preferredPartnerFilterParam === 'preferred' || preferredPartnerFilterParam === 'not_preferred'
      ? preferredPartnerFilterParam
      : 'all';
  const referralSources = readMultiParam(searchParams, 'referralSource');
  const includeNoReferralSource = searchParams.get('noReferralSource') === '1';
  const vendorDayStatuses = readMultiParam(searchParams, 'vendorDayStatus');
  const locationAvailabilityParam = (searchParams.get('locationStatus') ?? 'all').trim().toLowerCase();
  const locationAvailability =
    locationAvailabilityParam === 'available' || locationAvailabilityParam === 'unavailable'
      ? locationAvailabilityParam
      : 'all';
  const hasSampleOrderDate = searchParams.get('hasSampleOrderDate') === '1';
  const noLastSampleDeliveryDate = searchParams.get('noLastSampleDeliveryDate') === '1';
  const sampleAccountTypeFilterParam = (searchParams.get('sampleAccountTypeFilter') ?? 'all').trim().toLowerCase();
  const sampleAccountTypeFilter =
    sampleAccountTypeFilterParam === 'customers' || sampleAccountTypeFilterParam === 'non_customers'
      ? sampleAccountTypeFilterParam
      : 'all';
  const lastOrderDateFilterParam = (searchParams.get('lastOrderDateFilter') ?? 'all').trim().toLowerCase();
  const lastOrderDateFilter =
    lastOrderDateFilterParam === 'last_month' ||
    lastOrderDateFilterParam === 'last_2_months' ||
    lastOrderDateFilterParam === 'three_plus_months'
      ? lastOrderDateFilterParam
      : 'all';
  const q = searchParams.get('q')?.trim() ?? '';
  const refresh = searchParams.get('refresh') === '1';
  const cacheKey = buildTerritoryCacheKey({
    statuses,
    reps,
    pppStatuses,
    headsetConnectionStatuses,
    preferredPartnerFilter,
    referralSources,
    includeNoReferralSource,
    vendorDayStatuses,
    locationAvailability,
    hasSampleOrderDate,
    noLastSampleDeliveryDate,
    sampleAccountTypeFilter,
    lastOrderDateFilter,
    query: q,
  });

  try {
    if (!refresh) {
      const cached = readTerritoryCache(cacheKey);
      if (cached) {
        return NextResponse.json(cached, {
          headers: {
            'X-Territory-Data-Source': cached.meta.sourceEngine ?? cached.meta.dataSource,
            'Cache-Control': 'private, max-age=30, stale-while-revalidate=120',
          },
        });
      }
    } else {
      await processPendingTerritoryStoreSyncQueue({
        limit: 48,
        maxLiveGeocodeLookups: 0,
      }).catch(() => null);
    }

    const payload = await loadTerritoryStores({
      statuses,
      reps,
      pppStatuses,
      headsetConnectionStatuses,
      preferredPartnerFilter,
      referralSources,
      includeNoReferralSource,
      vendorDayStatuses,
      locationAvailability,
      hasSampleOrderDate,
      noLastSampleDeliveryDate,
      sampleAccountTypeFilter,
      lastOrderDateFilter,
      query: q,
      refresh,
    });

    console.log('territory_stores_ok', {
      recordsRead: payload.meta.recordsRead,
      returned: payload.stores.length,
      unresolvedLocationCount: payload.meta.unresolvedLocationCount,
      geocodedThisRequest: payload.meta.geocodedThisRequest,
      syncedAt: payload.meta.syncedAt,
      stale: payload.meta.stale,
      syncing: payload.meta.syncing,
      refresh,
    });

    if (!refresh) {
      territoryStoresCache.set(cacheKey, {
        expiresAt: Date.now() + TERRITORY_RESPONSE_CACHE_TTL_MS,
        payload,
      });
    }

    return NextResponse.json(payload, {
      headers: {
        'X-Territory-Data-Source': payload.meta.sourceEngine ?? payload.meta.dataSource,
        'Cache-Control': refresh
          ? 'private, no-store, max-age=0, must-revalidate'
          : 'private, max-age=120, stale-while-revalidate=600',
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Territory store fetch failed';
    console.error('territory_stores_error', { message, refresh, statusesCount: statuses.length, repsCount: reps.length, hasQuery: Boolean(q) });
    return NextResponse.json(
      {
        error: message,
      },
      {
        status: 500,
        headers: {
          'X-Territory-Data-Source': 'postgis',
          'Cache-Control': 'private, max-age=30, stale-while-revalidate=120',
        },
      },
    );
  }
}
