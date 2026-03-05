import { NextResponse } from 'next/server';
import { ActivityType, WorkflowStatus } from '@prisma/client';
import { z } from 'zod';
import { guard } from '@/lib/auth/api-guard';
import { prisma } from '@/lib/db/prisma';
import { writeActivity } from '@/lib/activity-log/write';

const patchSchema = z
  .object({
    status: z.nativeEnum(WorkflowStatus).optional(),
    orderNumber: z.string().nullable().optional(),
    creditMemo: z.string().nullable().optional(),
    creditAmount: z.number().nullable().optional(),
    notes: z.string().nullable().optional(),
    vendorDayEventId: z.string().cuid().nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field is required',
  });

export async function PATCH(request: Request, context: { params: Promise<{ recordId: string }> }) {
  const ctx = await guard(['ADMIN', 'OPS_TEAM', 'FINANCE', 'BRAND_AMBASSADOR']);
  if ('error' in ctx) return ctx.error;

  const { recordId } = await context.params;
  const existing = await prisma.pennyBundleCreditSubmission.findFirst({ where: { id: recordId, orgId: ctx.orgId } });
  if (!existing) return NextResponse.json({ error: 'Submission not found' }, { status: 404 });

  try {
    const payload = patchSchema.parse(await request.json());
    const updated = await prisma.pennyBundleCreditSubmission.update({
      where: { id: recordId },
      data: {
        status: payload.status,
        orderNumber: payload.orderNumber,
        creditMemo: payload.creditMemo,
        creditAmount: payload.creditAmount,
        notes: payload.notes,
        vendorDayEventId: payload.vendorDayEventId,
      },
    });

    await writeActivity({
      orgId: ctx.orgId,
      accountId: updated.accountId,
      actorClerkUserId: ctx.userId,
      type: ActivityType.ACCOUNT_UPDATED,
      title: payload.status ? `Penny bundle moved to ${payload.status}` : 'Penny bundle updated',
      description: updated.orderNumber ?? updated.creditMemo ?? 'Penny bundle submission updated',
    });

    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid penny bundle payload', details: error.issues }, { status: 400 });
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to update submission' }, { status: 500 });
  }
}
