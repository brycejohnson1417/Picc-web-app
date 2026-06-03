import { NextResponse } from 'next/server';
import { ActivityType } from '@prisma/client';
import { z } from 'zod';
import { guard } from '@/lib/auth/api-guard';
import { prisma } from '@/lib/db/prisma';
import { writeActivity } from '@/lib/activity-log/write';

const schema = z.object({
  accountId: z.string().cuid(),
  contactId: z.string().cuid().optional().nullable(),
  opportunityId: z.string().cuid().optional().nullable(),
  title: z.string().min(2),
  startsAt: z.string(),
  endsAt: z.string(),
  reminderMinutes: z.number().optional(),
  description: z.string().optional(),
});

export async function GET() {
  const ctx = await guard();
  if ('error' in ctx) return ctx.error;
  const rows = await prisma.appointment.findMany({ where: { orgId: ctx.orgId }, include: { account: true, contact: true, opportunity: true } });
  return NextResponse.json(rows);
}

export async function POST(req: Request) {
  const ctx = await guard(['ADMIN', 'OPS_TEAM', 'SALES_REP', 'BRAND_AMBASSADOR']);
  if ('error' in ctx) return ctx.error;

  const body = await req.json();
  const payload = schema.parse(body);

  const appointment = await prisma.appointment.create({
    data: {
      orgId: ctx.orgId,
      accountId: payload.accountId,
      contactId: payload.contactId,
      opportunityId: payload.opportunityId,
      title: payload.title,
      startsAt: new Date(payload.startsAt),
      endsAt: new Date(payload.endsAt),
      reminderMinutes: payload.reminderMinutes,
      description: payload.description,
      createdByUserId: ctx.userId,
    },
  });

  await writeActivity({
    orgId: ctx.orgId,
    accountId: payload.accountId,
    appointmentId: appointment.id,
    actorClerkUserId: ctx.userId,
    type: ActivityType.APPOINTMENT_CREATED,
    title: 'Appointment scheduled',
    description: payload.title,
  });

  return NextResponse.json(appointment, { status: 201 });
}
