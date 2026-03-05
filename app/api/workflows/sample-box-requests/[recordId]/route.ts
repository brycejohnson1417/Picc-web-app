import { NextResponse } from 'next/server';
import { ActivityType, WorkflowStatus } from '@prisma/client';
import { z } from 'zod';
import { guard } from '@/lib/auth/api-guard';
import { prisma } from '@/lib/db/prisma';
import { writeActivity } from '@/lib/activity-log/write';

const patchSchema = z
  .object({
    status: z.nativeEnum(WorkflowStatus).optional(),
    requestReason: z.string().min(3).optional(),
    shippingNotes: z.string().nullable().optional(),
    fulfilledAt: z.string().nullable().optional(),
    approvedBy: z.string().nullable().optional(),
    contactId: z.string().cuid().nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field is required',
  });

export async function PATCH(request: Request, context: { params: Promise<{ recordId: string }> }) {
  const ctx = await guard(['ADMIN', 'OPS_TEAM', 'SALES_REP', 'BRAND_AMBASSADOR']);
  if ('error' in ctx) return ctx.error;

  const { recordId } = await context.params;
  const existing = await prisma.sampleBoxRequest.findFirst({ where: { id: recordId, orgId: ctx.orgId } });
  if (!existing) return NextResponse.json({ error: 'Request not found' }, { status: 404 });

  try {
    const payload = patchSchema.parse(await request.json());

    const updated = await prisma.sampleBoxRequest.update({
      where: { id: recordId },
      data: {
        status: payload.status,
        requestReason: payload.requestReason,
        shippingNotes: payload.shippingNotes,
        fulfilledAt: payload.fulfilledAt !== undefined ? (payload.fulfilledAt ? new Date(payload.fulfilledAt) : null) : undefined,
        approvedBy: payload.approvedBy,
        contactId: payload.contactId,
      },
    });

    await writeActivity({
      orgId: ctx.orgId,
      accountId: updated.accountId,
      contactId: updated.contactId ?? undefined,
      actorClerkUserId: ctx.userId,
      type: ActivityType.ACCOUNT_UPDATED,
      title: payload.status ? `Sample box moved to ${payload.status}` : 'Sample box request updated',
      description: updated.requestReason,
    });

    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid sample box payload', details: error.issues }, { status: 400 });
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to update sample box request' }, { status: 500 });
  }
}
