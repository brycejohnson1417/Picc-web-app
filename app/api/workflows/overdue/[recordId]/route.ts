import { NextResponse } from 'next/server';
import { WorkflowStatus } from '@prisma/client';
import { z } from 'zod';
import { guard } from '@/lib/auth/api-guard';
import { prisma } from '@/lib/db/prisma';

const patchSchema = z
  .object({
    status: z.nativeEnum(WorkflowStatus).optional(),
    creditStatus: z.string().nullable().optional(),
    overdueOrders: z.number().int().optional(),
    daysOverdue1: z.number().int().optional(),
    daysOverdue2: z.number().int().optional(),
    daysOverdue3: z.number().int().optional(),
    amountOverdue: z.number().nullable().optional(),
    snapshotDate: z.string().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field is required',
  });

export async function PATCH(request: Request, context: { params: Promise<{ recordId: string }> }) {
  const ctx = await guard(['ADMIN', 'OPS_TEAM', 'FINANCE']);
  if ('error' in ctx) return ctx.error;

  const { recordId } = await context.params;
  const existing = await prisma.overdueSnapshot.findFirst({ where: { id: recordId, orgId: ctx.orgId } });
  if (!existing) return NextResponse.json({ error: 'Overdue snapshot not found' }, { status: 404 });

  try {
    const payload = patchSchema.parse(await request.json());
    const updated = await prisma.overdueSnapshot.update({
      where: { id: recordId },
      data: {
        creditStatus: payload.status ?? payload.creditStatus,
        overdueOrders: payload.overdueOrders,
        daysOverdue1: payload.daysOverdue1,
        daysOverdue2: payload.daysOverdue2,
        daysOverdue3: payload.daysOverdue3,
        amountOverdue: payload.amountOverdue,
        snapshotDate: payload.snapshotDate ? new Date(payload.snapshotDate) : undefined,
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid overdue payload', details: error.issues }, { status: 400 });
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to update snapshot' }, { status: 500 });
  }
}
