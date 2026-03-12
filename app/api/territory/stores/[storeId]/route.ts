import { NextResponse } from 'next/server';
import { ActivityType } from '@prisma/client';
import { z } from 'zod';
import { requireTerritoryApiAccess } from '@/lib/auth/territory-access';
import { writeActivity } from '@/lib/activity-log/write';
import { prisma } from '@/lib/db/prisma';
import { loadTerritoryStoreDetail, updateTerritoryStoreFields } from '@/lib/server/notion-territory';

const patchSchema = z.object({
  notes: z.string().max(4000).optional(),
  followUpDate: z.union([z.string().min(1), z.null()]).optional(),
  followUpNeeded: z.union([z.boolean(), z.null()]).optional(),
  followUpReason: z.union([z.string().max(4000), z.null()]).optional(),
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
    const result = await updateTerritoryStoreFields(storeId, payload);

    if (access.orgId && access.userId) {
      const account = await prisma.account.findFirst({
        where: {
          orgId: access.orgId,
          notionPageId: result.notionPageId,
        },
        select: { id: true },
      });

      if (account) {
        await writeActivity({
          orgId: access.orgId,
          accountId: account.id,
          actorClerkUserId: access.userId,
          type: ActivityType.ACCOUNT_UPDATED,
          title: 'Territory account details updated',
          description: [payload.followUpDate ? `Follow-up ${payload.followUpDate}` : null, payload.followUpReason ? 'Follow-up reason updated' : null, payload.notes ? 'Notes updated' : null]
            .filter(Boolean)
            .join(' · ') || undefined,
        });
      }
    }

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
    const message = error instanceof Error ? error.message : 'Failed to update store fields';
    const status = message === 'Store not found' ? 404 : message.includes('No writable') ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
