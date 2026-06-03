import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireTerritoryApiAccess } from '@/lib/auth/territory-access';
import { prewarmTerritoryGeocodeCache } from '@/lib/server/notion-territory';

export const dynamic = 'force-dynamic';

const schema = z.object({
  action: z.enum(['sync_only', 'geocode_missing', 'full_rebuild']).default('geocode_missing'),
  maxLiveGeocodeLookups: z.number().int().min(0).max(5000).optional(),
});

export async function POST(request: Request) {
  const access = await requireTerritoryApiAccess({ requireAdmin: true });
  if ('error' in access) {
    return access.error;
  }

  try {
    const raw = await request.json().catch(() => ({}));
    const input = schema.parse(raw);
    const payload = await prewarmTerritoryGeocodeCache(input);
    return NextResponse.json(payload, {
      headers: {
        'X-Territory-Data-Source': 'postgis',
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: 'Invalid prewarm payload',
          details: error.issues,
        },
        { status: 400 },
      );
    }
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
