import { NextResponse } from 'next/server';
import { z } from 'zod';
import { parseJsonBody, routeErrorResponse } from '@/lib/api/route-errors';
import { requireTerritoryApiAccess } from '@/lib/auth/territory-access';
import { deleteTerritoryMarker, updateTerritoryMarker } from '@/lib/server/territory-markers';

export const dynamic = 'force-dynamic';

const updateMarkerSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().max(500).optional().nullable(),
  address: z.string().trim().max(240).optional().nullable(),
  lat: z.number().finite().optional(),
  lng: z.number().finite().optional(),
  color: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/).optional().nullable(),
  isVisibleByDefault: z.boolean().optional(),
});

type RouteContext = { params: Promise<{ markerId: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  const access = await requireTerritoryApiAccess({ requireAdmin: true });
  if ('error' in access) return access.error;
  if (!access.orgId) {
    return NextResponse.json({ error: 'Workspace is unavailable' }, { status: 500 });
  }

  try {
    const payload = await parseJsonBody(request, updateMarkerSchema);
    const { markerId } = await context.params;
    const marker = await updateTerritoryMarker({
      orgId: access.orgId,
      markerId,
      actorEmail: access.email,
      ...payload,
    });
    return NextResponse.json({ marker });
  } catch (error) {
    return routeErrorResponse(error, {
      fallbackMessage: 'Failed to update territory marker',
      statusByMessage: {
        'Marker not found': 404,
        'Marker name is required': 400,
      },
    });
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const access = await requireTerritoryApiAccess({ requireAdmin: true });
  if ('error' in access) return access.error;
  if (!access.orgId) {
    return NextResponse.json({ error: 'Workspace is unavailable' }, { status: 500 });
  }

  try {
    const { markerId } = await context.params;
    await deleteTerritoryMarker({
      orgId: access.orgId,
      markerId,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return routeErrorResponse(error, {
      fallbackMessage: 'Failed to delete territory marker',
      statusByMessage: {
        'Marker not found': 404,
      },
    });
  }
}
