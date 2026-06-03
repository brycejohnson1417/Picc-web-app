import { NextResponse } from 'next/server';
import { AccountIdentityType } from '@prisma/client';
import { z } from 'zod';
import { guard } from '@/lib/auth/api-guard';
import { parseJsonBody, routeErrorResponse } from '@/lib/api/route-errors';
import { getAdminOpsData, saveAccountIdentityOverride } from '@/lib/server/admin-ops';

export const dynamic = 'force-dynamic';

const patchSchema = z.object({
  accountId: z.string().cuid(),
  identityType: z.nativeEnum(AccountIdentityType),
  identityValue: z.string().trim().min(1).max(200),
});

export async function GET() {
  const ctx = await guard(['ADMIN', 'OPS_TEAM', 'FINANCE']);
  if ('error' in ctx) return ctx.error;

  try {
    const payload = await getAdminOpsData(ctx.orgId);
    return NextResponse.json({
      identityOverrides: payload.identityOverrides,
      accounts: payload.accounts,
      auditEvents: payload.auditEvents,
    });
  } catch (error) {
    return routeErrorResponse(error, { fallbackMessage: 'Failed to load identity overrides' });
  }
}

export async function PATCH(request: Request) {
  const ctx = await guard(['ADMIN', 'OPS_TEAM', 'FINANCE']);
  if ('error' in ctx) return ctx.error;

  try {
    const payload = await parseJsonBody(request, patchSchema);
    const mapping = await saveAccountIdentityOverride({
      orgId: ctx.orgId,
      actor: { userId: ctx.userId, email: ctx.email ?? null },
      accountId: payload.accountId,
      identityType: payload.identityType,
      identityValue: payload.identityValue,
    });
    return NextResponse.json(mapping);
  } catch (error) {
    return routeErrorResponse(error, { fallbackMessage: 'Failed to save identity override' });
  }
}
