import { NextResponse } from 'next/server';
import { ActivityType, WorkflowStatus } from '@prisma/client';
import { z } from 'zod';
import { guard } from '@/lib/auth/api-guard';
import { prisma } from '@/lib/db/prisma';
import { writeActivity } from '@/lib/activity-log/write';
import { loadNotionVendorDayEvents } from '@/lib/server/notion-vendor-days';

const schema = z.object({
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

export async function GET() {
  const ctx = await guard();
  if ('error' in ctx) return ctx.error;
  const [rows, notionRows] = await Promise.all([
    prisma.vendorDayEvent.findMany({ where: { orgId: ctx.orgId }, include: { account: true }, orderBy: { eventDate: 'asc' } }),
    loadNotionVendorDayEvents().catch(() => []),
  ]);

  const normalizedLocalKey = new Set(rows.map((row) => `${row.account?.name ?? ''}::${row.eventDate.toISOString().slice(0, 10)}`));
  const bridged = notionRows
    .filter((row) => !normalizedLocalKey.has(`${row.accountName}::${row.eventDate.slice(0, 10)}`))
    .map((row) => ({
      id: row.id,
      orgId: ctx.orgId,
      accountId: `notion-${row.id}`,
      eventDate: new Date(row.eventDate),
      repName: row.repName,
      ambassadorName: row.ambassadorName,
      notes: row.notes,
      account: {
        id: `notion-account-${row.id}`,
        name: row.accountName,
      },
    }));

  return NextResponse.json(
    [...rows, ...bridged].sort((a, b) => new Date(a.eventDate).getTime() - new Date(b.eventDate).getTime()),
  );
}

export async function POST(req: Request) {
  const ctx = await guard(['ADMIN', 'OPS_TEAM', 'SALES_REP', 'BRAND_AMBASSADOR']);
  if ('error' in ctx) return ctx.error;
  const payload = schema.parse(await req.json());

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
