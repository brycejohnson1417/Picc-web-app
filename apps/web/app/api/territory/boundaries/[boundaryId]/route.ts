import { NextResponse } from 'next/server';
import { z } from 'zod';
import { guard } from '@/lib/auth/api-guard';
import { deleteTerritoryBoundary, updateTerritoryBoundary } from '@/lib/server/territory-boundaries';
import { parseJsonBody, routeErrorResponse } from '@/lib/api/route-errors';

export const dynamic = 'force-dynamic';

const coordinateSchema = z.tuple([z.number().finite(), z.number().finite()]);

const updateBoundarySchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().max(500).optional().nullable(),
  color: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/).optional().nullable(),
  borderWidth: z.number().int().min(1).max(12).optional().nullable(),
  isVisibleByDefault: z.boolean().optional(),
  coordinates: z.array(coordinateSchema).min(3).optional(),
});

type RouteContext = {
  params: Promise<{ boundaryId: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const ctx = await guard(['ADMIN']);
  if ('error' in ctx) return ctx.error;

  try {
    const payload = await parseJsonBody(request, updateBoundarySchema);
    const { boundaryId } = await context.params;
    const boundary = await updateTerritoryBoundary({
      orgId: ctx.orgId,
      boundaryId,
      actorEmail: ctx.email ?? null,
      ...payload,
    });

    return NextResponse.json({ boundary });
  } catch (error) {
    return routeErrorResponse(error, {
      fallbackMessage: 'Failed to update territory boundary',
      statusByMessage: {
        'Boundary not found': 404,
        'Boundary name is required': 400,
        'A territory boundary needs at least 3 points': 400,
        'A territory boundary needs at least 3 distinct points': 400,
      },
    });
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const ctx = await guard(['ADMIN']);
  if ('error' in ctx) return ctx.error;

  try {
    const { boundaryId } = await context.params;
    await deleteTerritoryBoundary({
      orgId: ctx.orgId,
      boundaryId,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return routeErrorResponse(error, {
      fallbackMessage: 'Failed to delete territory boundary',
      statusByMessage: {
        'Boundary not found': 404,
      },
    });
  }
}
