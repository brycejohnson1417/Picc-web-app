import { requireNotionAccountOwnership, INVALID_CRM_REFERENCE } from '@/lib/server/crm-reference-ownership';
import { NextResponse } from 'next/server';
import { parseJsonBody, routeErrorResponse } from '@/lib/api/route-errors';
import { guard } from '@/lib/auth/api-guard';
import { prisma } from '@/lib/db/prisma';
import { notionContactCreateSchema } from '@/lib/validation/schemas';
import { createVerifiedContact } from '@/lib/server/contact-creation';
import { createNotionContactCreationAdapter } from '@/lib/server/notion-contact-creation';

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
    const payload = await parseJsonBody(req, notionContactCreateSchema);
    await requireNotionAccountOwnership(ctx.orgId, payload.accountPageId);
    const result = await createVerifiedContact(payload, createNotionContactCreationAdapter());
    const status = result.status === 'role_collision' ? 409 : result.status === 'partial_relation' ? 202 : result.status === 'created_verified' ? 201 : 200;
    return NextResponse.json(result, { status });
  } catch (error) {
    return routeErrorResponse(error, {
      fallbackMessage: 'Failed to create contact',
      zodMessage: 'Invalid contact payload',
      statusByMessage: { 'Contact account not found': 404, [INVALID_CRM_REFERENCE]: 404 },
    });
  }
}
