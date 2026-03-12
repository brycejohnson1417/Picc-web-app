import { NextResponse } from 'next/server';
import { ActivityType } from '@prisma/client';
import { z } from 'zod';
import { requireTerritoryApiAccess } from '@/lib/auth/territory-access';
import { writeActivity } from '@/lib/activity-log/write';
import { prisma } from '@/lib/db/prisma';
import { createTerritoryStoreCheckInComment, recordTerritoryStoreCheckIn } from '@/lib/server/notion-territory';

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

      const note = await createTerritoryStoreCheckInComment(storeId, {
        mode: 'written',
        noteText: payload.noteText,
        actorEmail: access.email,
        associatedContact: payload.associatedContact,
      });

      let checkedInAt = new Date().toISOString();
      let syncWarning: string | null = null;

      try {
        const checkIn = await recordTerritoryStoreCheckIn(storeId, {
          contactId: payload.associatedContact?.id ?? null,
          noteText: payload.noteText?.trim() ?? null,
          createdByEmail: access.email,
          persistEvent: false,
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

      if (access.orgId && access.userId) {
        const account = await prisma.account.findFirst({
          where: {
            orgId: access.orgId,
            notionPageId: payload.store.notionPageId,
          },
          select: { id: true },
        });

        if (account) {
          await writeActivity({
            orgId: access.orgId,
            accountId: account.id,
            actorClerkUserId: access.userId,
            type: ActivityType.NOTE_ADDED,
            title: 'Territory check-in added',
            description: payload.noteText?.trim() || payload.associatedContact?.name || undefined,
          });
        }
      }

      return NextResponse.json({
        ok: true,
        id: note.id,
        url: note.url,
        storeId,
        checkedInAt,
        mode: 'written',
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
      const note = await createTerritoryStoreCheckInComment(legacyPayload.data.storeId, {
        actorEmail: access.email,
        mode: 'written',
      });
      let checkedInAt = new Date().toISOString();
      let syncWarning: string | null = null;

      try {
        const result = await recordTerritoryStoreCheckIn(legacyPayload.data.storeId, {
          createdByEmail: access.email,
          persistEvent: false,
        });
        checkedInAt = result.checkedInAt;
      } catch (syncError) {
        const message = syncError instanceof Error ? syncError.message : 'Failed to update store check-in timestamp';
        if (message.includes('No check-in date property') || message === 'Store not found') {
          syncWarning = message;
        } else {
          throw syncError;
        }
      }

      return NextResponse.json({
        storeId: legacyPayload.data.storeId,
        checkedInAt,
        ok: true,
        id: note.id,
        url: note.url,
        syncWarning,
      });
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
        : message.includes('missing a relation property')
          ? 400
        : message.includes('No check-in date property')
          ? 400
          : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
