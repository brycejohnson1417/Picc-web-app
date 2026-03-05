import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireTerritoryApiAccess } from '@/lib/auth/territory-access';
import { loadTerritoryStoreDetail, updateTerritoryStoreFollowUpDate, updateTerritoryStoreNotes } from '@/lib/server/notion-territory';

const patchSchema = z.object({
  notes: z.string().max(4000).optional(),
  followUpDate: z.union([z.string().trim().min(1), z.null()]).optional(),
}).refine((value) => value.notes !== undefined || value.followUpDate !== undefined, {
  message: 'At least one writable field is required',
  path: ['notes'],
});

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, context: { params: Promise<{ storeId: string }> }) {
  const access = await requireTerritoryApiAccess();
  if ('error' in access) {
    return access.error;
  }

  const { storeId } = await context.params;

  try {
    const detail = await loadTerritoryStoreDetail(storeId, { orgId: access.orgId });
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
    const [notesResult, followUpResult] = await Promise.all([
      payload.notes !== undefined ? updateTerritoryStoreNotes(storeId, payload.notes, { orgId: access.orgId }) : Promise.resolve(null),
      payload.followUpDate !== undefined ? updateTerritoryStoreFollowUpDate(storeId, payload.followUpDate, { orgId: access.orgId }) : Promise.resolve(null),
    ]);

    return NextResponse.json({
      storeId,
      notes: notesResult?.notes ?? null,
      followUpDate: followUpResult?.followUpDate ?? null,
      updatedAt: followUpResult?.updatedAt ?? notesResult?.updatedAt ?? new Date().toISOString(),
    });
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
