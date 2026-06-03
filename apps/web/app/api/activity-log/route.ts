import { NextResponse } from 'next/server';
import { guard } from '@/lib/auth/api-guard';
import { prisma } from '@/lib/db/prisma';

export async function GET(req: Request) {
  const ctx = await guard();
  if ('error' in ctx) return ctx.error;

  const url = new URL(req.url);
  const accountId = url.searchParams.get('accountId');

  const where = {
    orgId: ctx.orgId,
    ...(accountId ? { accountId } : {}),
  };

  const rows = await prisma.activityLog.findMany({ where, orderBy: { createdAt: 'desc' }, take: 500 });
  return NextResponse.json(rows);
}
