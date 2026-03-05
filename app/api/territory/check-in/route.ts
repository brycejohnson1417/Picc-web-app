import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireTerritoryApiAccess } from '@/lib/auth/territory-access';
import { createMeetingCheckIn } from '@/lib/server/notion-meeting-notes';
import { recordTerritoryStoreCheckIn } from '@/lib/server/notion-territory';

const legacyRequestSchema = z.object({
  storeId: z.string().min(1),
});

const meetingNoteRequestSchema = z.object({
  store: z.object({
    id: z.string().min(1).optional(),
    name: z.string().min(1),
    notionPageId: z.string().min(1),
    lat: z.number().finite().optional(),
    lng: z.number().finite().optional(),
    address: z.string().optional(),
    repName: z.string().nullable().optional(),
  }),
  mode: z.enum(['written', 'voice']).default('written'),
  noteText: z.string().max(5000).optional(),
  associatedContact: z
    .object({
      id: z.string().min(1).optional(),
      name: z.string().min(1),
      roleTitle: z.string().optional(),
      email: z.string().optional(),
      phone: z.string().optional(),
    })
    .optional(),
});

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const access = await requireTerritoryApiAccess();
  if ('error' in access) {
    return access.error;
  }

  try {
    const body = await request.json();

    const meetingPayload = meetingNoteRequestSchema.safeParse(body);
    if (meetingPayload.success) {
      const payload = meetingPayload.data;
      const storeId = payload.store.id?.trim() || payload.store.notionPageId;

      const note = await createMeetingCheckIn({
        store: payload.store,
        mode: payload.mode,
        noteText: payload.noteText,
        actorEmail: access.email,
        associatedContact: payload.associatedContact,
      });

      let checkedInAt = new Date().toISOString();
      let syncWarning: string | null = null;

      try {
        const checkIn = await recordTerritoryStoreCheckIn(storeId, {
          noteText: payload.noteText ?? null,
          mode: payload.mode,
          createdByEmail: access.email,
          orgId: access.orgId,
          associatedContact: payload.associatedContact
            ? {
                name: payload.associatedContact.name,
                roleTitle: payload.associatedContact.roleTitle ?? null,
                email: payload.associatedContact.email ?? null,
                phone: payload.associatedContact.phone ?? null,
              }
            : null,
          notionNoteUrl: note.url ?? null,
        });
        checkedInAt = checkIn.checkedInAt;
      } catch (syncError) {
        const message = syncError instanceof Error ? syncError.message : 'Failed to update store check-in timestamp';
        if (message.includes('No check-in date property') || message === 'Store not found') {
          syncWarning = message;
        } else {
          throw syncError;
        }
      }

      return NextResponse.json({
        ok: true,
        id: note.id,
        url: note.url,
        storeId,
        checkedInAt,
        mode: payload.mode,
        syncWarning,
        associatedContact: payload.associatedContact
          ? {
              id: payload.associatedContact.id ?? null,
              name: payload.associatedContact.name,
            }
          : null,
      });
    }

    const legacyPayload = legacyRequestSchema.safeParse(body);
    if (legacyPayload.success) {
      const result = await recordTerritoryStoreCheckIn(legacyPayload.data.storeId, { orgId: access.orgId });
      return NextResponse.json(result);
    }

    return NextResponse.json(
      {
        error: 'Invalid check-in payload',
        details: [...meetingPayload.error.issues, ...legacyPayload.error.issues],
      },
      { status: 400 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Check-in failed';
    const status =
      message === 'Store not found'
        ? 404
        : message.includes('No check-in date property')
          ? 400
          : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
