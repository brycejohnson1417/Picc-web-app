import { NextResponse } from 'next/server';
import { z } from 'zod';
import { guard } from '@/lib/auth/api-guard';
import { prisma } from '@/lib/db/prisma';

const patchSchema = z
  .object({
    markRead: z.literal(true).optional(),
    subject: z.string().nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field is required',
  });

export async function PATCH(request: Request, context: { params: Promise<{ conversationId: string }> }) {
  const ctx = await guard(['ADMIN', 'OPS_TEAM', 'SALES_REP', 'BRAND_AMBASSADOR']);
  if ('error' in ctx) return ctx.error;

  const { conversationId } = await context.params;

  const existing = await prisma.conversation.findFirst({
    where: { id: conversationId, orgId: ctx.orgId },
    select: { id: true },
  });

  if (!existing) {
    return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
  }

  try {
    const payload = patchSchema.parse(await request.json());
    const updated = await prisma.conversation.update({
      where: { id: conversationId },
      data: {
        ...(payload.subject !== undefined ? { subject: payload.subject } : {}),
        ...(payload.markRead ? { unreadCount: 0 } : {}),
      },
      select: {
        id: true,
        subject: true,
        unreadCount: true,
        updatedAt: true,
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid conversation payload', details: error.issues }, { status: 400 });
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to update conversation' }, { status: 500 });
  }
}
