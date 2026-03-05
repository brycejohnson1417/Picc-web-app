import { NextResponse } from 'next/server';
import { ActivityType, Prisma, WorkflowStatus } from '@prisma/client';
import { z } from 'zod';
import { guard } from '@/lib/auth/api-guard';
import { prisma } from '@/lib/db/prisma';
import { writeActivity } from '@/lib/activity-log/write';

const patchSchema = z
  .object({
    status: z.nativeEnum(WorkflowStatus).optional(),
    reason: z.string().max(1000).nullable().optional(),
    patch: z.record(z.string(), z.unknown()).optional(),
    contactId: z.string().cuid().nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field is required',
  });

export async function PATCH(request: Request, context: { params: Promise<{ recordId: string }> }) {
  const ctx = await guard(['ADMIN', 'OPS_TEAM', 'SALES_REP']);
  if ('error' in ctx) return ctx.error;

  const { recordId } = await context.params;
  const existing = await prisma.editSuggestion.findFirst({ where: { id: recordId, orgId: ctx.orgId } });
  if (!existing) return NextResponse.json({ error: 'Edit suggestion not found' }, { status: 404 });

  try {
    const payload = patchSchema.parse(await request.json());
    const updated = await prisma.editSuggestion.update({
      where: { id: recordId },
      data: {
        status: payload.status,
        reason: payload.reason,
        patch: payload.patch as Prisma.InputJsonValue | undefined,
        contactId: payload.contactId,
        approvedBy: payload.status ? ctx.userId : undefined,
      },
    });

    await writeActivity({
      orgId: ctx.orgId,
      accountId: updated.accountId,
      contactId: updated.contactId ?? undefined,
      actorClerkUserId: ctx.userId,
      type: ActivityType.ACCOUNT_UPDATED,
      title: payload.status ? `Edit suggestion moved to ${payload.status}` : 'Edit suggestion updated',
      description: updated.reason ?? 'No reason provided',
    });

    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid edit suggestion payload', details: error.issues }, { status: 400 });
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to update edit suggestion' }, { status: 500 });
  }
}
