import { NextResponse } from 'next/server';
import { ActivityType, WorkflowStatus } from '@prisma/client';
import { z } from 'zod';
import { guard } from '@/lib/auth/api-guard';
import { prisma } from '@/lib/db/prisma';
import { writeActivity } from '@/lib/activity-log/write';

const patchSchema = z
  .object({
    status: z.nativeEnum(WorkflowStatus).optional(),
    eventDate: z.string().optional(),
    repName: z.string().nullable().optional(),
    ambassadorName: z.string().nullable().optional(),
    vdContact: z.string().nullable().optional(),
    vdContactEmail: z.string().nullable().optional(),
    vdContactPhone: z.string().nullable().optional(),
    promoStatus: z.string().nullable().optional(),
    notes: z.string().nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field is required',
  });

export async function PATCH(request: Request, context: { params: Promise<{ recordId: string }> }) {
  const ctx = await guard(['ADMIN', 'OPS_TEAM', 'SALES_REP', 'BRAND_AMBASSADOR']);
  if ('error' in ctx) return ctx.error;

  const { recordId } = await context.params;
  const existing = await prisma.vendorDayEvent.findFirst({ where: { id: recordId, orgId: ctx.orgId } });
  if (!existing) return NextResponse.json({ error: 'Vendor day event not found' }, { status: 404 });

  try {
    const payload = patchSchema.parse(await request.json());

    const updated = await prisma.vendorDayEvent.update({
      where: { id: recordId },
      data: {
        status: payload.status,
        eventDate: payload.eventDate ? new Date(payload.eventDate) : undefined,
        repName: payload.repName,
        ambassadorName: payload.ambassadorName,
        vdContact: payload.vdContact,
        vdContactEmail: payload.vdContactEmail,
        vdContactPhone: payload.vdContactPhone,
        promoStatus: payload.promoStatus,
        notes: payload.notes,
      },
    });

    await writeActivity({
      orgId: ctx.orgId,
      accountId: updated.accountId,
      actorClerkUserId: ctx.userId,
      type: ActivityType.APPOINTMENT_UPDATED,
      title: payload.status ? `Vendor day moved to ${payload.status}` : 'Vendor day updated',
      description: updated.eventDate.toISOString(),
    });

    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid vendor day payload', details: error.issues }, { status: 400 });
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to update vendor day' }, { status: 500 });
  }
}
