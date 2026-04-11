import { NextResponse } from 'next/server';
import { guard } from '@/lib/auth/api-guard';
import { getCalendarSyncHealth } from '@/lib/server/calendar-sync-health';
import { getUserRole } from '@/lib/rbac/guards';

export const dynamic = 'force-dynamic';

function responseHeaders() {
  return {
    'Cache-Control': 'private, no-store, max-age=0, must-revalidate',
    Pragma: 'no-cache',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
  };
}

export async function GET() {
  const ctx = await guard();
  if ('error' in ctx) {
    return ctx.error;
  }

  try {
    const role = await getUserRole(ctx.orgId, ctx.userId);
    if (!['ADMIN', 'OPS_TEAM', 'FINANCE'].includes(role)) {
      return NextResponse.json(
        { error: 'Only admin, ops, or finance can view calendar sync health.' },
        {
          status: 403,
          headers: responseHeaders(),
        },
      );
    }

    const payload = await getCalendarSyncHealth(ctx.orgId);
    return NextResponse.json(payload, { headers: responseHeaders() });
  } catch (error) {
    console.error('[picc-calendar-sync-health]', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to load calendar sync health.' },
      {
        status: 500,
        headers: responseHeaders(),
      },
    );
  }
}
