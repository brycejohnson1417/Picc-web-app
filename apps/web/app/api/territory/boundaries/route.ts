import { NextResponse } from 'next/server';
import { z } from 'zod';
import { guard } from '@/lib/auth/api-guard';
import { createTerritoryBoundary, listTerritoryBoundaries } from '@/lib/server/territory-boundaries';
import { parseJsonBody, routeErrorResponse } from '@/lib/api/route-errors';

export const dynamic = 'force-dynamic';

const coordinateSchema = z.tuple([z.number().finite(), z.number().finite()]);

const createBoundarySchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).optional().nullable(),
  color: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/).optional().nullable(),
  borderWidth: z.number().int().min(1).max(12).optional().nullable(),
  isVisibleByDefault: z.boolean().optional(),
  coordinates: z.array(coordinateSchema).min(3),
});

export async function GET() {
  const ctx = await guard();
  if ('error' in ctx) return ctx.error;

  try {
    const boundaries = await listTerritoryBoundaries(ctx.orgId);
    return NextResponse.json(
      { boundaries },
      {
        headers: {
          'Cache-Control': 'private, max-age=5, stale-while-revalidate=30',
        },
      },
    );
  } catch (error) {
    return routeErrorResponse(error, {
      fallbackMessage: 'Failed to load territory boundaries',
    });
  }
}

export async function POST(request: Request) {
  const ctx = await guard(['ADMIN']);
  if ('error' in ctx) return ctx.error;

  try {
    const payload = await parseJsonBody(request, createBoundarySchema);
    const boundary = await createTerritoryBoundary({
      orgId: ctx.orgId,
      actorEmail: ctx.email ?? null,
      ...payload,
    });

    return NextResponse.json({ boundary }, { status: 201 });
  } catch (error) {
    return routeErrorResponse(error, {
      fallbackMessage: 'Failed to create territory boundary',
      statusByMessage: {
        'Boundary name is required': 400,
        'Boundary coordinates are required': 400,
        'A territory boundary needs at least 3 points': 400,
        'A territory boundary needs at least 3 distinct points': 400,
      },
    });
  }
}
