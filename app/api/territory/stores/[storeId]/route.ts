import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireTerritoryApiAccess } from '@/lib/auth/territory-access';
import { loadTerritoryStoreDetail, updateTerritoryStoreNotes } from '@/lib/server/notion-territory';

const patchSchema = z.object({
  notes: z.string().max(4000),
});

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, context: { params: Promise<{ storeId: string }> }) {
  const access = await requireTerritoryApiAccess();
  if ('error' in access) {
    return access.error;
  }

  const { storeId } = await context.params;

  try {
    const detail = await loadTerritoryStoreDetail(storeId);
    return NextResponse.json(detail);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load store detail';
    return NextResponse.json({ error: message }, { status: message === 'Store not found' ? 404 : 500 });
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ storeId: string }> }) {
  const access = await requireTerritoryApiAccess();
  if ('error' in access) {
    return access.error;
  }

  const { storeId } = await context.params;

  try {
    const payload = patchSchema.parse(await request.json());
    const result = await updateTerritoryStoreNotes(storeId, payload.notes);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: 'Invalid notes payload',
          details: error.issues,
        },
        { status: 400 },
      );
    }
    const message = error instanceof Error ? error.message : 'Failed to update notes';
    const status = message === 'Store not found' ? 404 : message.includes('No writable Notes property') ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
