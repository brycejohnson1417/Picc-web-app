import { NextResponse } from 'next/server';
import { getSharedWorkspaceId } from '@/lib/auth/access-policy';
import { syncNabisRetailersAndOrders } from '@/lib/server/nabis-sync';

export const dynamic = 'force-dynamic';

function isAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (secret) {
    const authHeader = request.headers.get('authorization') ?? '';
    return authHeader === `Bearer ${secret}`;
  }

  return Boolean(request.headers.get('x-vercel-cron'));
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const orgId = getSharedWorkspaceId();

  const result = await syncNabisRetailersAndOrders(
    orgId,
    {
      email: 'vercel-cron@piccplatform.com',
    },
    {
      syncCrm: false,
    },
  ).then(
    (value) => ({ ok: true as const, value }),
    (error: unknown) => ({ ok: false as const, error }),
  );

  return NextResponse.json(
    {
      ok: result.ok,
      result: result.ok ? result.value : null,
      error: result.ok ? null : result.error instanceof Error ? result.error.message : 'Nabis cron sync failed',
      syncedAt: new Date().toISOString(),
    },
    {
      status: result.ok ? 200 : 500,
    },
  );
}
