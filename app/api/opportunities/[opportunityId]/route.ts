import { NextResponse } from 'next/server';
import { ActivityType, OpportunityStatus } from '@prisma/client';
import { z } from 'zod';
import { guard } from '@/lib/auth/api-guard';
import { prisma } from '@/lib/db/prisma';
import { writeActivity } from '@/lib/activity-log/write';

const patchSchema = z
  .object({
    stageId: z.string().cuid().optional(),
    status: z.nativeEnum(OpportunityStatus).optional(),
    value: z.number().nonnegative().optional(),
    probability: z.number().min(0).max(100).optional(),
    expectedCloseDate: z.string().nullable().optional(),
    notes: z.string().nullable().optional(),
    name: z.string().min(2).optional(),
    contactId: z.string().cuid().nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field is required',
  });

export async function PATCH(request: Request, context: { params: Promise<{ opportunityId: string }> }) {
  const ctx = await guard(['ADMIN', 'OPS_TEAM', 'SALES_REP']);
  if ('error' in ctx) return ctx.error;

  const { opportunityId } = await context.params;

  const existing = await prisma.opportunity.findFirst({
    where: { id: opportunityId, orgId: ctx.orgId },
    include: { stage: true },
  });

  if (!existing) {
    return NextResponse.json({ error: 'Opportunity not found' }, { status: 404 });
  }

  try {
    const payload = patchSchema.parse(await request.json());

    if (payload.stageId) {
      const stageExists = await prisma.stage.findFirst({ where: { id: payload.stageId, orgId: ctx.orgId } });
      if (!stageExists) {
        return NextResponse.json({ error: 'Stage not found' }, { status: 404 });
      }
    }

    const updated = await prisma.opportunity.update({
      where: { id: opportunityId },
      data: {
        stageId: payload.stageId,
        status: payload.status,
        value: payload.value,
        probability: payload.probability,
        expectedCloseDate:
          payload.expectedCloseDate !== undefined
            ? payload.expectedCloseDate
              ? new Date(payload.expectedCloseDate)
              : null
            : undefined,
        notes: payload.notes,
        name: payload.name,
        contactId: payload.contactId,
      },
      include: { stage: true },
    });

    const stageChanged = payload.stageId && payload.stageId !== existing.stageId;
    const statusChanged = payload.status && payload.status !== existing.status;

    await writeActivity({
      orgId: ctx.orgId,
      accountId: updated.accountId,
      contactId: updated.contactId ?? undefined,
      opportunityId: updated.id,
      actorClerkUserId: ctx.userId,
      type: stageChanged ? ActivityType.STAGE_CHANGED : ActivityType.OPPORTUNITY_UPDATED,
      title: stageChanged
        ? `Opportunity moved to ${updated.stage.name}`
        : statusChanged
          ? `Opportunity marked ${updated.status}`
          : 'Opportunity updated',
      description: updated.name,
    });

    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid opportunity payload', details: error.issues }, { status: 400 });
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to update opportunity' }, { status: 500 });
  }
}
