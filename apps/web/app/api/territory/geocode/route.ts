import { NextResponse } from 'next/server';
import { requireTerritoryApiAccess } from '@/lib/auth/territory-access';
import { geocodeAddress } from '@/lib/server/google-geocode';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const access = await requireTerritoryApiAccess({ requireAdmin: true });
  if ('error' in access) return access.error;

  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q')?.trim() || '';
  if (!query) {
    return NextResponse.json({ error: 'Address is required' }, { status: 400 });
  }

  try {
    const result = await geocodeAddress({ address: query });
    return NextResponse.json(result, {
      headers: {
        'Cache-Control': 'private, max-age=60, stale-while-revalidate=300',
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Address search failed',
      },
      {
        status: 400,
      },
    );
  }
}
