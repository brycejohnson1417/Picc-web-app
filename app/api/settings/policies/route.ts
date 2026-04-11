import { NextResponse } from 'next/server';
import { z } from 'zod';
import { guard } from '@/lib/auth/api-guard';
import { parseJsonBody, routeErrorResponse } from '@/lib/api/route-errors';
import { createPolicySnapshot, getAdminOpsData } from '@/lib/server/admin-ops';
import type { PiccPolicyValues } from '@/lib/server/policy-snapshots';

export const dynamic = 'force-dynamic';

const patchSchema = z.object({
  cooldownDays: z.number().int().min(1).max(365).optional(),
  standardEventDurationHours: z.number().int().min(1).max(8).optional(),
  fourHourEventRequiresAdminApproval: z.boolean().optional(),
  offerWindowHours: z.number().int().min(1).max(24).optional(),
  eventPayRateDollars: z.number().min(0).max(500).optional(),
  travelPayRateDollars: z.number().min(0).max(500).optional(),
  oneWayTravelThresholdMinutes: z.number().int().min(0).max(300).optional(),
  passOffCutoffHours: z.number().int().min(1).max(72).optional(),
  noShowGracePeriodMinutes: z.number().int().min(0).max(180).optional(),
  priorityWeights: z
    .object({
      daysSinceLastVendorDay: z.number().min(0).max(100).optional(),
      orderVelocity: z.number().min(0).max(100).optional(),
      accountValue: z.number().min(0).max(100).optional(),
      neverHadVendorDay: z.number().min(0).max(100).optional(),
      repRequestFlag: z.number().min(0).max(100).optional(),
      reorderPotential: z.number().min(0).max(100).optional(),
      preferredPartner: z.number().min(0).max(100).optional(),
    })
    .optional(),
  reason: z.string().trim().max(500).optional().nullable(),
});

export async function GET() {
  const ctx = await guard(['ADMIN']);
  if ('error' in ctx) return ctx.error;

  try {
    const payload = await getAdminOpsData(ctx.orgId);
    return NextResponse.json({
      currentPolicy: payload.currentPolicy,
      policyHistory: payload.policyHistory,
      auditEvents: payload.auditEvents,
    });
  } catch (error) {
    return routeErrorResponse(error, { fallbackMessage: 'Failed to load policy data' });
  }
}

export async function PATCH(request: Request) {
  const ctx = await guard(['ADMIN']);
  if ('error' in ctx) return ctx.error;

  try {
    const payload = await parseJsonBody(request, patchSchema);
    const { reason, ...values } = payload;
    const snapshot = await createPolicySnapshot({
      orgId: ctx.orgId,
      actor: { userId: ctx.userId, email: ctx.email ?? null },
      values: values as Partial<PiccPolicyValues>,
      reason,
    });
    return NextResponse.json(snapshot);
  } catch (error) {
    return routeErrorResponse(error, { fallbackMessage: 'Failed to save policy snapshot' });
  }
}
