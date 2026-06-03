import { NextResponse } from 'next/server';
import { VendorDayRequestSource } from '@prisma/client';
import { z } from 'zod';
import { guard } from '@/lib/auth/api-guard';
import { parseJsonBody, routeErrorResponse } from '@/lib/api/route-errors';
import { createVendorDayRequest, listPublicEligibleStores } from '@/lib/server/vendor-day-ops';
import { getSharedWorkspaceId } from '@/lib/auth/access-policy';

export const dynamic = 'force-dynamic';

const payloadSchema = z.object({
  accountId: z.string().cuid(),
  requestedStart: z.string().datetime(),
  alternateStart: z.string().datetime().optional().nullable(),
  pennyBundleRequested: z.boolean().optional(),
  notes: z.string().trim().max(2000).optional().nullable(),
  honeypot: z.string().max(0).optional().default(''),
});

function getWorkspaceOrgId() {
  return process.env.PICC_WORKSPACE_ORG_ID?.trim() || getSharedWorkspaceId();
}

export async function GET() {
  const ctx = await guard(['ADMIN', 'OPS_TEAM', 'SALES_REP', 'BRAND_AMBASSADOR']);
  if ('error' in ctx) return ctx.error;

  try {
    const stores = await listPublicEligibleStores(ctx.orgId ?? getWorkspaceOrgId());
    return NextResponse.json({ stores });
  } catch (error) {
    return routeErrorResponse(error, { fallbackMessage: 'Failed to load eligible stores' });
  }
}

export async function POST(request: Request) {
  const ctx = await guard(['ADMIN', 'OPS_TEAM', 'SALES_REP', 'BRAND_AMBASSADOR']);
  if ('error' in ctx) return ctx.error;

  try {
    const payload = await parseJsonBody(request, payloadSchema);
    if (payload.honeypot) {
      return NextResponse.json({ ok: true });
    }

    const created = await createVendorDayRequest({
      orgId: ctx.orgId ?? getWorkspaceOrgId(),
      accountId: payload.accountId,
      source: VendorDayRequestSource.STORE_REQUESTED,
      requestedStart: new Date(payload.requestedStart),
      alternateStart: payload.alternateStart ? new Date(payload.alternateStart) : null,
      requestedDurationHours: 3,
      pennyBundleRequested: payload.pennyBundleRequested,
      notes: payload.notes,
    });

    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    return routeErrorResponse(error, {
      fallbackMessage: 'Failed to submit store request',
      zodMessage: 'Invalid store request payload',
      statusByMessage: {
        'Store already has an active vendor-day request or assignment': 409,
        'Store is inside the 60-day cooldown window': 409,
      },
    });
  }
}
