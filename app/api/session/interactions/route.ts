import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { guard } from '@/lib/auth/api-guard';
import { prisma } from '@/lib/db/prisma';

export const dynamic = 'force-dynamic';

const eventSchema = z.object({
  action: z.enum(['interaction.click', 'interaction.keydown', 'navigation.view']),
  happenedAt: z.string().datetime(),
  path: z.string().min(1).max(200),
  label: z.string().min(1).max(200),
  detail: z.string().max(240).nullish(),
  entityId: z.string().max(200).nullish(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const payloadSchema = z.object({
  events: z.array(eventSchema).min(1).max(100),
});

export async function POST(request: Request) {
  const ctx = await guard();
  if ('error' in ctx) return ctx.error;

  const payload = payloadSchema.parse(await request.json());

  await prisma.auditEvent.createMany({
    data: payload.events.map((event) => ({
      orgId: ctx.orgId,
      actorClerkUserId: ctx.userId,
      actorEmail: ctx.email,
      action: event.action,
      entityType: 'UI_INTERACTION',
      entityId: event.entityId ?? null,
      reason: event.label,
      metadata: {
        path: event.path,
        detail: event.detail ?? null,
        ...(event.metadata ?? {}),
      } as Prisma.InputJsonValue,
      createdAt: new Date(event.happenedAt),
    })),
  });

  return Response.json({ ok: true });
}
