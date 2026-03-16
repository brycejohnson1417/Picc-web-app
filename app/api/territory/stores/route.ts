import { NextResponse } from 'next/server';
import { requireTerritoryApiAccess } from '@/lib/auth/territory-access';
import { loadTerritoryStores, processPendingTerritoryStoreSyncQueue } from '@/lib/server/notion-territory';

export const dynamic = 'force-dynamic';

function readMultiParam(searchParams: URLSearchParams, key: string) {
  return searchParams
    .getAll(key)
    .flatMap((value) => value.split(','))
    .map((value) => value.trim())
    .filter(Boolean);
}

export async function GET(request: Request) {
  const access = await requireTerritoryApiAccess();
  if ('error' in access) {
    return access.error;
  }

  const { searchParams } = new URL(request.url);
  const statuses = readMultiParam(searchParams, 'status');
  const reps = readMultiParam(searchParams, 'rep');
  const locationAvailabilityParam = (searchParams.get('locationStatus') ?? 'all').trim().toLowerCase();
  const locationAvailability =
    locationAvailabilityParam === 'available' || locationAvailabilityParam === 'unavailable'
      ? locationAvailabilityParam
      : 'all';
  const q = searchParams.get('q')?.trim() ?? '';
  const refresh = searchParams.get('refresh') === '1';

  try {
    await processPendingTerritoryStoreSyncQueue({
      limit: refresh ? 24 : 8,
      maxLiveGeocodeLookups: 0,
    }).catch(() => null);

    const payload = await loadTerritoryStores({
      statuses,
      reps,
      locationAvailability,
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

    return NextResponse.json(payload, {
      headers: {
        'X-Territory-Data-Source': payload.meta.sourceEngine ?? payload.meta.dataSource,
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
        },
      },
    );
  }
}
