import { NextResponse } from 'next/server';
import { guard } from '@/lib/auth/api-guard';
import { ensureDateRange, isIsoDate } from '@/lib/dashboard/nabis-server';
import { getVendorDayReportSummary, syncVendorDayRoiSnapshots } from '@/lib/server/roi';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const ctx = await guard(['ADMIN', 'OPS_TEAM', 'FINANCE', 'SALES_REP']);
  if ('error' in ctx) return ctx.error;

  try {
    const url = new URL(request.url);
    const start = url.searchParams.get('start');
    const end = url.searchParams.get('end');
    const refresh = url.searchParams.get('refresh') === '1';

    if (refresh) {
      await syncVendorDayRoiSnapshots(ctx.orgId, {
        userId: ctx.userId,
        email: ctx.email ?? null,
      });
    }

    const range =
      start && end && isIsoDate(start) && isIsoDate(end)
        ? ensureDateRange({ start, end })
        : null;

    const payload = await getVendorDayReportSummary({
      orgId: ctx.orgId,
      start: range ? new Date(`${range.start}T00:00:00.000Z`) : undefined,
      end: range ? new Date(`${range.end}T23:59:59.999Z`) : undefined,
    });
    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to load vendor-day reports' },
      { status: 500 },
    );
  }
}
