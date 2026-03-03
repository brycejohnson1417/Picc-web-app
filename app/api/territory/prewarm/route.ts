import { NextResponse } from 'next/server';
import { requireTerritoryApiAccess } from '@/lib/auth/territory-access';
import { prewarmTerritoryGeocodeCache } from '@/lib/server/notion-territory';

export const dynamic = 'force-dynamic';

export async function POST() {
  const access = await requireTerritoryApiAccess({ requireAdmin: true });
  if ('error' in access) {
    return access.error;
  }

  try {
    const payload = await prewarmTerritoryGeocodeCache();
    return NextResponse.json(payload, {
      headers: {
        'X-Territory-Data-Source': 'postgis',
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Prewarm failed';
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
