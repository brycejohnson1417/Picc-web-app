import { NextResponse } from 'next/server';
import { ActivityType, WorkflowStatus } from '@prisma/client';
import { z } from 'zod';
import { guard } from '@/lib/auth/api-guard';
import { prisma } from '@/lib/db/prisma';
import { writeActivity } from '@/lib/activity-log/write';

const patchSchema = z
  .object({
    status: z.nativeEnum(WorkflowStatus).optional(),
    source: z.string().min(1).optional(),
    referredBy: z.string().min(1).optional(),
    orderNumber: z.string().nullable().optional(),
    orderTotal: z.number().nullable().optional(),
    opportunityId: z.string().cuid().nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field is required',
  });

export async function PATCH(request: Request, context: { params: Promise<{ recordId: string }> }) {
  const ctx = await guard(['ADMIN', 'OPS_TEAM', 'SALES_REP']);
  if ('error' in ctx) return ctx.error;

  const { recordId } = await context.params;
  const existing = await prisma.referralRecord.findFirst({ where: { id: recordId, orgId: ctx.orgId } });
  if (!existing) return NextResponse.json({ error: 'Referral not found' }, { status: 404 });

  try {
    const payload = patchSchema.parse(await request.json());
    const updated = await prisma.referralRecord.update({
      where: { id: recordId },
      data: {
        status: payload.status,
        source: payload.source,
        referredBy: payload.referredBy,
        orderNumber: payload.orderNumber,
        orderTotal: payload.orderTotal,
        opportunityId: payload.opportunityId,
      },
    });

    await writeActivity({
      orgId: ctx.orgId,
      accountId: updated.accountId,
      opportunityId: updated.opportunityId ?? undefined,
      actorClerkUserId: ctx.userId,
      type: ActivityType.ACCOUNT_UPDATED,
      title: payload.status ? `Referral moved to ${payload.status}` : 'Referral updated',
      description: `${updated.source} / ${updated.referredBy}`,
    });

    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid referral payload', details: error.issues }, { status: 400 });
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to update referral' }, { status: 500 });
  }
}
