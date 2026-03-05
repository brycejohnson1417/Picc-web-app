import { NextResponse } from 'next/server';
import { requireTerritoryApiAccess } from '@/lib/auth/territory-access';
import { prisma } from '@/lib/db/prisma';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, context: { params: Promise<{ storeId: string }> }) {
  const access = await requireTerritoryApiAccess();
  if ('error' in access) {
    return access.error;
  }

  const { storeId } = await context.params;
  const normalized = storeId.replace(/-/g, '').toLowerCase();

  const checkIns = await prisma.checkIn.findMany({
    where: {
      orgId: access.orgId,
      OR: [{ storeId }, { storeId: normalized }],
    },
    orderBy: { happenedAt: 'desc' },
    take: 100,
  });

  return NextResponse.json({
    checkIns: checkIns.map((checkIn) => ({
      id: checkIn.id,
      happenedAt: checkIn.happenedAt.toISOString(),
      noteText: checkIn.noteText,
      createdByEmail: checkIn.createdByEmail,
      mode: checkIn.mode,
      associatedContactName: checkIn.associatedContactName,
      associatedContactRole: checkIn.associatedContactRole,
      associatedContactEmail: checkIn.associatedContactEmail,
      associatedContactPhone: checkIn.associatedContactPhone,
      notionNoteUrl: checkIn.notionNoteUrl,
    })),
  });
}
