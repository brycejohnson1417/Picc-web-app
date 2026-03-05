import { NextResponse } from 'next/server';
import { z } from 'zod';
import { guard } from '@/lib/auth/api-guard';
import { prisma } from '@/lib/db/prisma';

const patchSchema = z
  .object({
    enabled: z.boolean().optional(),
    status: z.enum(['IDLE', 'RUNNING', 'SUCCESS', 'ERROR']).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field is required',
  });

export async function PATCH(request: Request, context: { params: Promise<{ integrationId: string }> }) {
  const ctx = await guard(['ADMIN', 'OPS_TEAM']);
  if ('error' in ctx) return ctx.error;

  const { integrationId } = await context.params;
  const existing = await prisma.integrationConnection.findFirst({ where: { id: integrationId, orgId: ctx.orgId } });

  if (!existing) {
    return NextResponse.json({ error: 'Integration not found' }, { status: 404 });
  }

  try {
    const payload = patchSchema.parse(await request.json());
    const updated = await prisma.integrationConnection.update({
      where: { id: integrationId },
      data: {
        enabled: payload.enabled,
        status: payload.status,
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid integration payload', details: error.issues }, { status: 400 });
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to update integration' }, { status: 500 });
  }
}
