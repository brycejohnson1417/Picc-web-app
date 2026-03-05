import { NextResponse } from 'next/server';
import { Channel } from '@prisma/client';
import { z } from 'zod';
import { guard } from '@/lib/auth/api-guard';
import { prisma } from '@/lib/db/prisma';
import { enforceRateLimit, getClientIdentifier } from '@/lib/server/rate-limit';

const createSchema = z.object({
  accountId: z.string().cuid(),
  contactId: z.string().cuid().optional().nullable(),
  channel: z.nativeEnum(Channel),
  subject: z.string().optional().nullable(),
});

export async function GET(req: Request) {
  const ctx = await guard();
  if ('error' in ctx) return ctx.error;

  const url = new URL(req.url);
  const channel = url.searchParams.get('channel') as Channel | null;

  const rows = await prisma.conversation.findMany({
    where: {
      orgId: ctx.orgId,
      ...(channel ? { channel } : {}),
    },
    include: {
      account: true,
      contact: true,
      messages: { orderBy: { sentAt: 'desc' }, take: 20 },
    },
    orderBy: { lastMessageAt: 'desc' },
  });

  return NextResponse.json(rows);
}

export async function POST(req: Request) {
  const ctx = await guard(['ADMIN', 'OPS_TEAM', 'SALES_REP', 'BRAND_AMBASSADOR']);
  if ('error' in ctx) return ctx.error;

  const clientKey = getClientIdentifier(req, ctx.userId);
  const limit = enforceRateLimit({
    key: `conversations:${ctx.orgId}:${clientKey}`,
    limit: 60,
    windowMs: 60_000,
  });
  if (!limit.ok) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } });
  }

  const body = await req.json();
  const payload = createSchema.parse(body);

  const conversation = await prisma.conversation.create({
    data: {
      orgId: ctx.orgId,
      accountId: payload.accountId,
      contactId: payload.contactId,
      channel: payload.channel,
      subject: payload.subject,
      assignedToUserId: ctx.userId,
      isMock: false,
    },
  });

  return NextResponse.json(conversation, { status: 201 });
}
