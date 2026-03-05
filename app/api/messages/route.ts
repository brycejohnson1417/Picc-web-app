import { NextResponse } from 'next/server';
import { ActivityType } from '@prisma/client';
import { z } from 'zod';
import { guard } from '@/lib/auth/api-guard';
import { prisma } from '@/lib/db/prisma';
import { writeActivity } from '@/lib/activity-log/write';
import { enforceRateLimit, getClientIdentifier } from '@/lib/server/rate-limit';

const schema = z.object({
  conversationId: z.string().cuid(),
  body: z.string().min(1),
  direction: z.enum(['INBOUND', 'OUTBOUND']).default('OUTBOUND'),
});

export async function POST(req: Request) {
  const ctx = await guard(['ADMIN', 'OPS_TEAM', 'SALES_REP', 'BRAND_AMBASSADOR']);
  if ('error' in ctx) return ctx.error;

  const clientKey = getClientIdentifier(req, ctx.userId);
  const limit = enforceRateLimit({
    key: `messages:${ctx.orgId}:${clientKey}`,
    limit: 100,
    windowMs: 60_000,
  });
  if (!limit.ok) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } });
  }

  const body = await req.json();
  const payload = schema.parse(body);

  const conversation = await prisma.conversation.findFirst({
    where: { id: payload.conversationId, orgId: ctx.orgId },
  });

  if (!conversation) {
    return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
  }

  const message = await prisma.message.create({
    data: {
      orgId: ctx.orgId,
      conversationId: conversation.id,
      accountId: conversation.accountId,
      contactId: conversation.contactId,
      channel: conversation.channel,
      direction: payload.direction,
      body: payload.body,
      createdByUserId: ctx.userId,
      isMock: false,
    },
  });

  await prisma.conversation.update({
    where: { id: conversation.id },
    data: {
      lastMessageAt: message.sentAt,
      unreadCount: payload.direction === 'INBOUND' ? { increment: 1 } : undefined,
    },
  });

  await writeActivity({
    orgId: ctx.orgId,
    accountId: conversation.accountId,
    contactId: conversation.contactId ?? undefined,
    messageId: message.id,
    actorClerkUserId: ctx.userId,
    type: payload.direction === 'OUTBOUND' ? ActivityType.MESSAGE_SENT : ActivityType.MESSAGE_RECEIVED,
    title: payload.direction === 'OUTBOUND' ? 'Message sent' : 'Message received',
    description: payload.body,
    channel: conversation.channel,
  });

  return NextResponse.json(message, { status: 201 });
}
