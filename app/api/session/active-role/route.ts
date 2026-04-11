import { NextResponse } from 'next/server';
import { z } from 'zod';
import { guard } from '@/lib/auth/api-guard';
import { parseJsonBody, routeErrorResponse } from '@/lib/api/route-errors';
import { getActiveRoleCookieName, getUserRoles } from '@/lib/rbac/guards';
import type { AppRole } from '@/lib/types/rbac';

export const dynamic = 'force-dynamic';

const payloadSchema = z.object({
  role: z.enum(['ADMIN', 'OPS_TEAM', 'SALES_REP', 'FINANCE', 'BRAND_AMBASSADOR', 'GUEST_VIEWER']),
});

export async function POST(request: Request) {
  const ctx = await guard();
  if ('error' in ctx) return ctx.error;

  try {
    const payload = await parseJsonBody(request, payloadSchema);
    const availableRoles = await getUserRoles(ctx.orgId, ctx.userId);
    if (!availableRoles.includes(payload.role as AppRole)) {
      return NextResponse.json({ error: 'Role not granted for this user' }, { status: 403 });
    }

    const response = NextResponse.json({ ok: true, role: payload.role });
    response.cookies.set(getActiveRoleCookieName(), payload.role, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 60 * 60 * 24 * 30,
    });
    return response;
  } catch (error) {
    return routeErrorResponse(error, { fallbackMessage: 'Failed to switch role', zodMessage: 'Invalid role selection' });
  }
}
