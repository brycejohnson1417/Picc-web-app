import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { prewarmLiveCrmCaches } from '@/lib/server/notion-live-crm';
import { prewarmTerritoryGeocodeCache } from '@/lib/server/notion-territory';

export const dynamic = 'force-dynamic';

function isAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (secret) {
    const authHeader = request.headers.get('authorization') ?? '';
    const expected = `Bearer ${secret}`;
    const receivedBuffer = Buffer.from(authHeader);
    const expectedBuffer = Buffer.from(expected);
    if (receivedBuffer.length !== expectedBuffer.length) {
      return false;
    }
    return timingSafeEqual(receivedBuffer, expectedBuffer);
  }

  const cronHeader = request.headers.get('x-vercel-cron');
  return Boolean(cronHeader);
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const territory = await prewarmTerritoryGeocodeCache().then(
    (value) => ({ ok: true as const, value }),
    (error: unknown) => ({ ok: false as const, error }),
  );
  const crm = await prewarmLiveCrmCaches().then(
    (value) => ({ ok: true as const, value }),
    (error: unknown) => ({ ok: false as const, error }),
  );

  const body = {
    ok: territory.ok || crm.ok,
    territory: territory.ok ? territory.value : { error: territory.error instanceof Error ? territory.error.message : 'Territory sync failed' },
    crm: crm.ok ? crm.value : { error: crm.error instanceof Error ? crm.error.message : 'CRM sync failed' },
    syncedAt: new Date().toISOString(),
  };

  return NextResponse.json(body, {
    status: body.ok ? 200 : 500,
  });
}
