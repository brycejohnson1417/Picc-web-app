import { NextResponse } from 'next/server';
import { ActivityType } from '@prisma/client';
import { guard } from '@/lib/auth/api-guard';
import { parseJsonBody, routeErrorResponse } from '@/lib/api/route-errors';
import { prisma } from '@/lib/db/prisma';
import { accountSchema } from '@/lib/validation/schemas';
import { writeActivity } from '@/lib/activity-log/write';

export async function GET() {
  const ctx = await guard();
  if ('error' in ctx) return ctx.error;

  try {
    const rows = await prisma.account.findMany({ where: { orgId: ctx.orgId }, orderBy: { updatedAt: 'desc' } });
    return NextResponse.json(rows);
  } catch (error) {
    return routeErrorResponse(error, { fallbackMessage: 'Failed to load accounts' });
  }
}

export async function POST(req: Request) {
  const ctx = await guard(['ADMIN', 'OPS_TEAM', 'SALES_REP']);
  if ('error' in ctx) return ctx.error;

  try {
    const payload = await parseJsonBody(req, accountSchema);
    const account = await prisma.account.create({ data: { orgId: ctx.orgId, ...payload } });

    await writeActivity({
      orgId: ctx.orgId,
      accountId: account.id,
      actorClerkUserId: ctx.userId,
      type: ActivityType.ACCOUNT_UPDATED,
      title: 'Account created via API',
      description: account.name,
    });

    return NextResponse.json(account, { status: 201 });
  } catch (error) {
    return routeErrorResponse(error, {
      fallbackMessage: 'Failed to create account',
      zodMessage: 'Invalid account payload',
    });
  }
}
