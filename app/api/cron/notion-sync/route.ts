import { NextResponse } from 'next/server';
import { prewarmLiveCrmCaches } from '@/lib/server/notion-live-crm';
import { prewarmTerritoryGeocodeCache, processPendingTerritoryStoreSyncQueue } from '@/lib/server/notion-territory';

export const dynamic = 'force-dynamic';

function isAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (secret) {
    const authHeader = request.headers.get('authorization') ?? '';
    return authHeader === `Bearer ${secret}`;
  }

  const cronHeader = request.headers.get('x-vercel-cron');
  return Boolean(cronHeader);
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const queued = await processPendingTerritoryStoreSyncQueue({
    limit: 50,
    maxLiveGeocodeLookups: 0,
  }).then(
    (value) => ({ ok: true as const, value }),
    (error: unknown) => ({ ok: false as const, error }),
  );
  const territory = await prewarmTerritoryGeocodeCache().then(
    (value) => ({ ok: true as const, value }),
    (error: unknown) => ({ ok: false as const, error }),
  );
  const crm = await prewarmLiveCrmCaches().then(
    (value) => ({ ok: true as const, value }),
    (error: unknown) => ({ ok: false as const, error }),
  );

  const body = {
    ok: territory.ok || crm.ok || queued.ok,
    queued: queued.ok ? queued.value : { error: queued.error instanceof Error ? queued.error.message : 'Territory queue sync failed' },
    territory: territory.ok ? territory.value : { error: territory.error instanceof Error ? territory.error.message : 'Territory sync failed' },
    crm: crm.ok ? crm.value : { error: crm.error instanceof Error ? crm.error.message : 'CRM sync failed' },
    syncedAt: new Date().toISOString(),
  };

  return NextResponse.json(body, {
    status: body.ok ? 200 : 500,
  });
}
