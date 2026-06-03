import { NextResponse } from 'next/server';
import { Role } from '@prisma/client';
import { guard } from '@/lib/auth/api-guard';
import { listVendorDayCalendarEntries } from '@/lib/server/vendor-day-calendar';

export const dynamic = 'force-dynamic';

const RESPONSE_HEADERS = {
  'Cache-Control': 'private, max-age=60, stale-while-revalidate=300',
};

export async function GET() {
  const ctx = await guard(['ADMIN', 'OPS_TEAM', 'SALES_REP', 'FINANCE', 'BRAND_AMBASSADOR']);
  if ('error' in ctx) return ctx.error;

  try {
    const entries = await listVendorDayCalendarEntries({
      orgId: ctx.orgId,
      viewerUserId: ctx.userId,
      viewerEmail: ctx.email ?? null,
      viewerRole: ctx.role as Role,
    });

    return NextResponse.json({ entries }, { headers: RESPONSE_HEADERS });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to load vendor-day calendar' },
      { status: 500, headers: RESPONSE_HEADERS },
    );
  }
}
