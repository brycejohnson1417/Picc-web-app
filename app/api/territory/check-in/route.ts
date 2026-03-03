import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireTerritoryApiAccess } from '@/lib/auth/territory-access';
import { createMeetingCheckIn, listMeetingCheckInsForStore } from '@/lib/server/notion-meeting-notes';

export const dynamic = 'force-dynamic';

const requestSchema = z.object({
  store: z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    notionPageId: z.string().min(1),
    lat: z.number().finite(),
    lng: z.number().finite(),
    address: z.string().optional(),
    repName: z.string().nullable().optional(),
  }),
  mode: z.enum(['written', 'voice']).default('written'),
  noteText: z.string().max(5000).optional(),
});

export async function GET(request: Request) {
  const access = await requireTerritoryApiAccess();
  if ('error' in access) {
    return access.error;
  }

  const { searchParams } = new URL(request.url);
  const storePageId = searchParams.get('storePageId')?.trim();
  const storeName = searchParams.get('storeName')?.trim() ?? undefined;
  const limitParam = searchParams.get('limit');
  const limit = limitParam ? Number.parseInt(limitParam, 10) : undefined;

  if (!storePageId) {
    return NextResponse.json({ error: 'storePageId is required' }, { status: 400 });
  }

  try {
    const history = await listMeetingCheckInsForStore({
      storePageId,
      storeName,
      limit: Number.isFinite(limit) ? limit : undefined,
    });
    return NextResponse.json({ history });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load check-in history';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const access = await requireTerritoryApiAccess();
  if ('error' in access) {
    return access.error;
  }

  try {
    const body = await request.json();
    const payload = requestSchema.parse(body);

    const note = await createMeetingCheckIn({
      store: payload.store,
      mode: payload.mode,
      noteText: payload.noteText,
      actorEmail: access.email,
    });

    return NextResponse.json({
      ok: true,
      id: note.id,
      url: note.url,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: 'Invalid check-in payload',
          details: error.issues,
        },
        { status: 400 },
      );
    }

    const message = error instanceof Error ? error.message : 'Failed to create check-in note';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
