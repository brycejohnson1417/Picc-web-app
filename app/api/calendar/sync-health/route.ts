import { NextResponse } from 'next/server';
import { guard } from '@/lib/auth/api-guard';
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

    return NextResponse.json(
      { error: 'Worker calendar sync has been retired.' },
      { status: 410, headers: responseHeaders() },
    );
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
