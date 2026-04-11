import { NextResponse } from 'next/server';
import { getSharedWorkspaceId } from '@/lib/auth/access-policy';
import { prewarmLiveCrmCaches } from '@/lib/server/notion-live-crm';
import { prewarmTerritoryGeocodeCache, processPendingTerritoryStoreSyncQueue } from '@/lib/server/notion-territory';
import { syncPendingVendorDayArchiveRequests } from '@/lib/server/notion-vendor-days';
import { runVendorDayMaintenance } from '@/lib/server/vendor-day-ops';

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
  const vendorDays = await syncPendingVendorDayArchiveRequests({ limitPerOrg: 50 }).then(
    (value) => ({ ok: true as const, value }),
    (error: unknown) => ({ ok: false as const, error }),
  );
  const workspaceOrgId = getSharedWorkspaceId();
  const vendorDayMaintenance = await runVendorDayMaintenance(workspaceOrgId).then(
    (value) => ({ ok: true as const, value }),
    (error: unknown) => ({ ok: false as const, error }),
  );

  const body = {
    ok: territory.ok || crm.ok || queued.ok || vendorDays.ok || vendorDayMaintenance.ok,
    queued: queued.ok ? queued.value : { error: queued.error instanceof Error ? queued.error.message : 'Territory queue sync failed' },
    territory: territory.ok ? territory.value : { error: territory.error instanceof Error ? territory.error.message : 'Territory sync failed' },
    crm: crm.ok ? crm.value : { error: crm.error instanceof Error ? crm.error.message : 'CRM sync failed' },
    vendorDays: vendorDays.ok ? vendorDays.value : { error: vendorDays.error instanceof Error ? vendorDays.error.message : 'Vendor day archive sync failed' },
    vendorDayMaintenance: vendorDayMaintenance.ok
      ? vendorDayMaintenance.value
      : { error: vendorDayMaintenance.error instanceof Error ? vendorDayMaintenance.error.message : 'Vendor day maintenance failed' },
    syncedAt: new Date().toISOString(),
  };

  return NextResponse.json(body, {
    status: body.ok ? 200 : 500,
  });
}
