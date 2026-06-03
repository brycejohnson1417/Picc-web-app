import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireTerritoryApiAccess } from '@/lib/auth/territory-access';
import { createSavedRouteForUser, listSavedRoutesForUser } from '@/lib/server/territory-saved-routes';

export const dynamic = 'force-dynamic';

const createSavedRouteSchema = z.object({
  name: z.string().trim().min(1).max(120),
  mode: z.enum(['car', 'bike', 'transit']).default('car'),
  stopIds: z.array(z.string().min(1)).min(1).max(25),
  totalDistanceMeters: z.number().int().nonnegative().optional(),
  totalDurationSeconds: z.number().int().nonnegative().optional(),
});

export async function GET() {
  const access = await requireTerritoryApiAccess();
  if ('error' in access) {
    return access.error;
  }

  if (!access.orgId) {
    return NextResponse.json({ error: 'Workspace not found' }, { status: 400 });
  }

  const routes = await listSavedRoutesForUser({
    orgId: access.orgId,
    userId: access.userId,
    email: access.email,
  });

  return NextResponse.json({ routes });
}

export async function POST(request: Request) {
  const access = await requireTerritoryApiAccess();
  if ('error' in access) {
    return access.error;
  }

  if (!access.orgId) {
    return NextResponse.json({ error: 'Workspace not found' }, { status: 400 });
  }

  try {
    const payload = createSavedRouteSchema.parse(await request.json());
    const route = await createSavedRouteForUser({
      orgId: access.orgId,
      userId: access.userId,
      email: access.email,
      name: payload.name,
      mode: payload.mode,
      stopIds: payload.stopIds,
      totalDistanceMeters: payload.totalDistanceMeters,
      totalDurationSeconds: payload.totalDurationSeconds,
    });

    return NextResponse.json({ route }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: 'Invalid saved route payload',
          details: error.issues,
        },
        { status: 400 },
      );
    }

    const message = error instanceof Error ? error.message : 'Failed to save route';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
