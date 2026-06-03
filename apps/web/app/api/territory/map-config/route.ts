import { NextResponse } from 'next/server';
import { requireTerritoryApiAccess } from '@/lib/auth/territory-access';

export const dynamic = 'force-dynamic';

export async function GET() {
  const access = await requireTerritoryApiAccess();
  if ('error' in access) {
    return access.error;
  }

  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim() || '';
  const hasServerOnlyKey = !apiKey && Boolean(process.env.GOOGLE_MAPS_SERVER_API_KEY?.trim());
  const mapId =
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID?.trim() ||
    process.env.GOOGLE_MAPS_MAP_ID?.trim() ||
    '';

  return NextResponse.json({
    apiKey: apiKey || null,
    mapId: mapId || null,
    configured: Boolean(apiKey),
    error: apiKey
      ? null
      : hasServerOnlyKey
      ? 'NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is required for browser map rendering.'
      : 'NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is not configured.',
  });
}
