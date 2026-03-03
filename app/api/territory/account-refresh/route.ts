import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireTerritoryApiAccess } from '@/lib/auth/territory-access';
import { loadTerritoryStores } from '@/lib/server/notion-territory';

export const dynamic = 'force-dynamic';

const requestSchema = z.object({
  storePageId: z.string().min(1),
});

export async function POST(request: Request) {
  const access = await requireTerritoryApiAccess();
  if ('error' in access) {
    return access.error;
  }

  try {
    const payload = requestSchema.parse(await request.json());
    const normalizedPageId = payload.storePageId.replace(/-/g, '').toLowerCase();
    const refreshed = await loadTerritoryStores({ refresh: true });
    const store = refreshed.stores.find((entry) => entry.notionPageId.replace(/-/g, '').toLowerCase() === normalizedPageId);

    if (!store) {
      return NextResponse.json({ error: 'Store not found' }, { status: 404 });
    }

    return NextResponse.json({
      ok: true,
      store,
      geocodedThisRequest: refreshed.meta.geocodedThisRequest,
      syncedAt: refreshed.meta.syncedAt,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: 'Invalid refresh payload',
          details: error.issues,
        },
        { status: 400 },
      );
    }

    const message = error instanceof Error ? error.message : 'Account refresh failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
