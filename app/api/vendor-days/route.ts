import { NextResponse } from 'next/server';
import { ActivityType, WorkflowStatus } from '@prisma/client';
import { z } from 'zod';
import { guard } from '@/lib/auth/api-guard';
import { writeActivity } from '@/lib/activity-log/write';
import { prisma } from '@/lib/db/prisma';
import { loadNotionVendorDayEvents } from '@/lib/server/notion-vendor-days';

export const dynamic = 'force-dynamic';

const createSchema = z.object({
  accountId: z.string().cuid(),
  eventDate: z.string(),
  repName: z.string().optional(),
  ambassadorName: z.string().optional(),
  vdContact: z.string().optional(),
  vdContactEmail: z.string().optional(),
  vdContactPhone: z.string().optional(),
  promoStatus: z.string().optional(),
  notes: z.string().optional(),
  status: z.nativeEnum(WorkflowStatus).default(WorkflowStatus.SUBMITTED),
});

const patchSchema = createSchema.partial().extend({
  id: z.string().min(1),
});

const deleteSchema = z.object({
  id: z.string().min(1),
});

export async function GET() {
  const ctx = await guard();
  if ('error' in ctx) return ctx.error;

  const [localRows, notionRows] = await Promise.all([
    prisma.vendorDayEvent.findMany({ where: { orgId: ctx.orgId }, include: { account: true }, orderBy: { eventDate: 'asc' } }),
    loadNotionVendorDayEvents().catch(() => []),
  ]);

  const localKeySet = new Set(localRows.map((row) => `${row.account?.name ?? ''}::${row.eventDate.toISOString().slice(0, 10)}`));
  const bridged = notionRows
    .filter((row) => !localKeySet.has(`${row.accountName}::${row.eventDate.slice(0, 10)}`))
    .map((row) => ({
      id: row.id,
      orgId: ctx.orgId,
      accountId: `notion-${row.id}`,
      eventDate: new Date(row.eventDate),
      repName: row.repName,
      ambassadorName: row.ambassadorName,
      notes: row.notes,
      status: WorkflowStatus.SUBMITTED,
      account: {
        id: `notion-account-${row.id}`,
        name: row.accountName,
      },
    }));

  return NextResponse.json(
    [...localRows, ...bridged].sort((a, b) => new Date(a.eventDate).getTime() - new Date(b.eventDate).getTime()),
  );
}

export async function POST(request: Request) {
  const ctx = await guard(['ADMIN', 'OPS_TEAM', 'SALES_REP', 'BRAND_AMBASSADOR']);
  if ('error' in ctx) return ctx.error;

  const payload = createSchema.parse(await request.json());
  const event = await prisma.vendorDayEvent.create({
    data: {
      orgId: ctx.orgId,
      accountId: payload.accountId,
      eventDate: new Date(payload.eventDate),
      status: payload.status,
      repName: payload.repName,
      ambassadorName: payload.ambassadorName,
      vdContact: payload.vdContact,
      vdContactEmail: payload.vdContactEmail,
      vdContactPhone: payload.vdContactPhone,
      promoStatus: payload.promoStatus,
      notes: payload.notes,
      createdBy: ctx.userId,
    },
  });

  await writeActivity({
    orgId: ctx.orgId,
    accountId: payload.accountId,
    actorClerkUserId: ctx.userId,
    type: ActivityType.APPOINTMENT_CREATED,
    title: 'Vendor day scheduled',
    description: payload.eventDate,
  });

  return NextResponse.json(event, { status: 201 });
}

export async function PATCH(request: Request) {
  const ctx = await guard(['ADMIN', 'OPS_TEAM', 'SALES_REP', 'BRAND_AMBASSADOR']);
  if ('error' in ctx) return ctx.error;

  const payload = patchSchema.parse(await request.json());
  const event = await prisma.vendorDayEvent.findFirst({
    where: { id: payload.id, orgId: ctx.orgId },
    select: { id: true, accountId: true },
  });
  if (!event) {
    return NextResponse.json({ error: 'Vendor day event not found' }, { status: 404 });
  }

  const updated = await prisma.vendorDayEvent.update({
    where: { id: event.id },
    data: {
      ...(payload.accountId ? { accountId: payload.accountId } : {}),
      ...(payload.eventDate ? { eventDate: new Date(payload.eventDate) } : {}),
      ...(payload.status ? { status: payload.status } : {}),
      ...(payload.repName !== undefined ? { repName: payload.repName } : {}),
      ...(payload.ambassadorName !== undefined ? { ambassadorName: payload.ambassadorName } : {}),
      ...(payload.vdContact !== undefined ? { vdContact: payload.vdContact } : {}),
      ...(payload.vdContactEmail !== undefined ? { vdContactEmail: payload.vdContactEmail } : {}),
      ...(payload.vdContactPhone !== undefined ? { vdContactPhone: payload.vdContactPhone } : {}),
      ...(payload.promoStatus !== undefined ? { promoStatus: payload.promoStatus } : {}),
      ...(payload.notes !== undefined ? { notes: payload.notes } : {}),
    },
  });

  return NextResponse.json(updated);
}

export async function DELETE(request: Request) {
  const ctx = await guard(['ADMIN', 'OPS_TEAM', 'SALES_REP', 'BRAND_AMBASSADOR']);
  if ('error' in ctx) return ctx.error;

  const payload = deleteSchema.parse(await request.json());
  const event = await prisma.vendorDayEvent.findFirst({
    where: { id: payload.id, orgId: ctx.orgId },
    select: { id: true },
  });
  if (!event) {
    return NextResponse.json({ error: 'Vendor day event not found' }, { status: 404 });
  }

  await prisma.vendorDayEvent.delete({ where: { id: event.id } });
  return NextResponse.json({ ok: true, id: event.id });
}
