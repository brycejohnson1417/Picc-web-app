import { NextResponse } from 'next/server';
import { ActivityType } from '@prisma/client';
import { z } from 'zod';
import { guard } from '@/lib/auth/api-guard';
import { prisma } from '@/lib/db/prisma';
import { writeActivity } from '@/lib/activity-log/write';

const patchSchema = z
  .object({
    title: z.string().min(2).optional(),
    description: z.string().nullable().optional(),
    startsAt: z.string().optional(),
    endsAt: z.string().optional(),
    reminderMinutes: z.number().int().nullable().optional(),
    contactId: z.string().cuid().nullable().optional(),
    opportunityId: z.string().cuid().nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field is required',
  });

export async function PATCH(request: Request, context: { params: Promise<{ appointmentId: string }> }) {
  const ctx = await guard(['ADMIN', 'OPS_TEAM', 'SALES_REP', 'BRAND_AMBASSADOR']);
  if ('error' in ctx) return ctx.error;

  const { appointmentId } = await context.params;

  const existing = await prisma.appointment.findFirst({
    where: { id: appointmentId, orgId: ctx.orgId },
  });

  if (!existing) {
    return NextResponse.json({ error: 'Appointment not found' }, { status: 404 });
  }

  try {
    const payload = patchSchema.parse(await request.json());
    const startsAt = payload.startsAt ? new Date(payload.startsAt) : existing.startsAt;
    const endsAt = payload.endsAt ? new Date(payload.endsAt) : existing.endsAt;

    if (endsAt <= startsAt) {
      return NextResponse.json({ error: 'End time must be after start time' }, { status: 400 });
    }

    const updated = await prisma.appointment.update({
      where: { id: appointmentId },
      data: {
        title: payload.title,
        description: payload.description,
        startsAt: payload.startsAt ? new Date(payload.startsAt) : undefined,
        endsAt: payload.endsAt ? new Date(payload.endsAt) : undefined,
        reminderMinutes: payload.reminderMinutes,
        contactId: payload.contactId,
        opportunityId: payload.opportunityId,
      },
    });

    await writeActivity({
      orgId: ctx.orgId,
      accountId: updated.accountId,
      contactId: updated.contactId ?? undefined,
      appointmentId: updated.id,
      actorClerkUserId: ctx.userId,
      type: ActivityType.APPOINTMENT_UPDATED,
      title: 'Appointment updated',
      description: updated.title,
    });

    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid appointment payload', details: error.issues }, { status: 400 });
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to update appointment' }, { status: 500 });
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ appointmentId: string }> }) {
  const ctx = await guard(['ADMIN', 'OPS_TEAM', 'SALES_REP']);
  if ('error' in ctx) return ctx.error;

  const { appointmentId } = await context.params;

  const appointment = await prisma.appointment.findFirst({ where: { id: appointmentId, orgId: ctx.orgId } });
  if (!appointment) {
    return NextResponse.json({ error: 'Appointment not found' }, { status: 404 });
  }

  await prisma.appointment.delete({ where: { id: appointmentId } });

  await writeActivity({
    orgId: ctx.orgId,
    accountId: appointment.accountId,
    contactId: appointment.contactId ?? undefined,
    actorClerkUserId: ctx.userId,
    type: ActivityType.APPOINTMENT_UPDATED,
    title: 'Appointment deleted',
    description: appointment.title,
  });

  return NextResponse.json({ ok: true });
}
