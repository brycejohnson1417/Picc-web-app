import { NextResponse } from 'next/server';
import { PayrollLineStatus } from '@prisma/client';
import { z } from 'zod';
import { guard } from '@/lib/auth/api-guard';
import { parseJsonBody, routeErrorResponse } from '@/lib/api/route-errors';
import { getPayrollOverview, markPayrollBatchExported, syncPayrollForCompletedAssignments, updatePayrollLineStatus } from '@/lib/server/payroll';

export const dynamic = 'force-dynamic';

const patchSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('sync'),
  }),
  z.object({
    action: z.literal('export_batch'),
    batchId: z.string().cuid(),
  }),
  z.object({
    action: z.literal('update_line_status'),
    lineItemId: z.string().cuid(),
    status: z.nativeEnum(PayrollLineStatus),
    disputedReason: z.string().trim().max(500).optional().nullable(),
  }),
]);

export async function GET() {
  const ctx = await guard(['ADMIN', 'OPS_TEAM', 'FINANCE', 'BRAND_AMBASSADOR']);
  if ('error' in ctx) return ctx.error;

  try {
    const payload = await getPayrollOverview(ctx.orgId);
    return NextResponse.json(payload);
  } catch (error) {
    return routeErrorResponse(error, { fallbackMessage: 'Failed to load payroll overview' });
  }
}

export async function PATCH(request: Request) {
  const ctx = await guard(['ADMIN', 'OPS_TEAM', 'FINANCE']);
  if ('error' in ctx) return ctx.error;

  try {
    const payload = await parseJsonBody(request, patchSchema);
    if (payload.action === 'sync') {
      const lines = await syncPayrollForCompletedAssignments(ctx.orgId, {
        userId: ctx.userId,
        email: ctx.email ?? null,
      });
      return NextResponse.json({ synced: lines.length });
    }

    if (payload.action === 'export_batch') {
      const batch = await markPayrollBatchExported({
        orgId: ctx.orgId,
        batchId: payload.batchId,
        actor: { userId: ctx.userId, email: ctx.email ?? null },
      });
      return NextResponse.json(batch);
    }

    const line = await updatePayrollLineStatus({
      orgId: ctx.orgId,
      lineItemId: payload.lineItemId,
      status: payload.status,
      disputedReason: payload.disputedReason,
      actor: { userId: ctx.userId, email: ctx.email ?? null },
    });
    return NextResponse.json(line);
  } catch (error) {
    return routeErrorResponse(error, { fallbackMessage: 'Failed to update payroll' });
  }
}
