import { NextResponse } from 'next/server';
import { ActivityType } from '@prisma/client';
import { parseJsonBody, routeErrorResponse } from '@/lib/api/route-errors';
import { guard } from '@/lib/auth/api-guard';
import { prisma } from '@/lib/db/prisma';
import { contactSchema } from '@/lib/validation/schemas';
import { writeActivity } from '@/lib/activity-log/write';

export async function GET() {
  const ctx = await guard();
  if ('error' in ctx) return ctx.error;

  try {
    const contacts = await prisma.contact.findMany({ where: { orgId: ctx.orgId }, include: { account: true }, orderBy: { updatedAt: 'desc' } });
    return NextResponse.json(contacts);
  } catch (error) {
    return routeErrorResponse(error, { fallbackMessage: 'Failed to load contacts' });
  }
}

export async function POST(req: Request) {
  const ctx = await guard(['ADMIN', 'OPS_TEAM', 'SALES_REP', 'BRAND_AMBASSADOR']);
  if ('error' in ctx) return ctx.error;

  try {
    const payload = await parseJsonBody(req, contactSchema);
    const contact = await prisma.contact.create({ data: { orgId: ctx.orgId, ...payload } });

    await writeActivity({
      orgId: ctx.orgId,
      accountId: payload.accountId,
      contactId: contact.id,
      actorClerkUserId: ctx.userId,
      type: ActivityType.CONTACT_UPDATED,
      title: 'Contact added',
      description: `${contact.firstName} ${contact.lastName}`,
    });

    return NextResponse.json(contact, { status: 201 });
  } catch (error) {
    return routeErrorResponse(error, {
      fallbackMessage: 'Failed to create contact',
      zodMessage: 'Invalid contact payload',
    });
  }
}
