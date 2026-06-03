import { NextResponse } from 'next/server';
import { requireTerritoryApiAccess } from '@/lib/auth/territory-access';
import { territoryConnectionCheck } from '@/lib/server/notion-territory';

export const dynamic = 'force-dynamic';

export async function GET() {
  const access = await requireTerritoryApiAccess();
  if ('error' in access) {
    return access.error;
  }

  try {
    const payload = await territoryConnectionCheck();
    return NextResponse.json(payload, {
      headers: {
        'X-Territory-Data-Source': 'notion-live-cache',
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Connection check failed';
    return NextResponse.json(
      {
        ok: false,
        error: message,
        checkedAt: new Date().toISOString(),
      },
      {
        status: 500,
        headers: {
          'X-Territory-Data-Source': 'notion-live-cache',
        },
      },
    );
  }
}
