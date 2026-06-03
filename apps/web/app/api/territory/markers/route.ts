import { NextResponse } from 'next/server';
import { z } from 'zod';
import { parseJsonBody, routeErrorResponse } from '@/lib/api/route-errors';
import { requireTerritoryApiAccess } from '@/lib/auth/territory-access';
import { createTerritoryMarker, listTerritoryMarkers } from '@/lib/server/territory-markers';

export const dynamic = 'force-dynamic';

const createMarkerSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).optional().nullable(),
  address: z.string().trim().max(240).optional().nullable(),
  lat: z.number().finite(),
  lng: z.number().finite(),
  color: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/).optional().nullable(),
  isVisibleByDefault: z.boolean().optional(),
});

export async function GET() {
  const access = await requireTerritoryApiAccess();
  if ('error' in access) return access.error;
  if (!access.orgId) {
    return NextResponse.json({ error: 'Workspace is unavailable' }, { status: 500 });
  }

  try {
    const markers = await listTerritoryMarkers(access.orgId);
    return NextResponse.json(
      { markers },
      {
        headers: {
          'Cache-Control': 'private, max-age=5, stale-while-revalidate=30',
        },
      },
    );
  } catch (error) {
    return routeErrorResponse(error, {
      fallbackMessage: 'Failed to load territory markers',
    });
  }
}

export async function POST(request: Request) {
  const access = await requireTerritoryApiAccess({ requireAdmin: true });
  if ('error' in access) return access.error;
  if (!access.orgId) {
    return NextResponse.json({ error: 'Workspace is unavailable' }, { status: 500 });
  }

  try {
    const payload = await parseJsonBody(request, createMarkerSchema);
    const marker = await createTerritoryMarker({
      orgId: access.orgId,
      actorEmail: access.email,
      ...payload,
    });
    return NextResponse.json({ marker }, { status: 201 });
  } catch (error) {
    return routeErrorResponse(error, {
      fallbackMessage: 'Failed to create territory marker',
      statusByMessage: {
        'Marker name is required': 400,
        'Marker coordinates are required': 400,
      },
    });
  }
}
