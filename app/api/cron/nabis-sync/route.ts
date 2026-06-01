import { NextResponse } from 'next/server';
import { getSharedWorkspaceId } from '@/lib/auth/access-policy';
import { isCronRequestAuthorized } from '@/lib/server/cron-auth';
import { nabisCronSyncOptions } from '@/lib/server/nabis-sync-options';
import { NabisSyncLeaseError, syncNabisRetailersAndOrders } from '@/lib/server/nabis-sync';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  if (!isCronRequestAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const orgId = getSharedWorkspaceId();

  const result = await syncNabisRetailersAndOrders(
    orgId,
    {
      email: 'vercel-cron@piccplatform.com',
    },
    nabisCronSyncOptions(),
  ).then(
    (value) => ({ ok: true as const, value }),
    (error: unknown) => ({ ok: false as const, error }),
  );

  return NextResponse.json(
    {
      ok: result.ok,
      result: result.ok ? result.value : null,
      error: result.ok ? null : result.error instanceof Error ? result.error.message : 'Nabis cron sync failed',
      active: !result.ok && result.error instanceof NabisSyncLeaseError ? result.error.decision : null,
      syncedAt: new Date().toISOString(),
    },
    {
      status: result.ok ? 200 : result.error instanceof NabisSyncLeaseError ? 409 : 500,
    },
  );
}
