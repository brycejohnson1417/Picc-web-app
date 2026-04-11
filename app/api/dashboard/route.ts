import { NextResponse } from 'next/server';
import { guard } from '@/lib/auth/api-guard';
import { ensureDateRange, getDashboardPayload } from '@/lib/dashboard/nabis-server';

export const dynamic = 'force-dynamic';

function responseHeaders() {
  return {
    'Cache-Control': 'private, no-store, max-age=0, must-revalidate',
    Pragma: 'no-cache',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
  };
}

export async function GET(request: Request) {
  const ctx = await guard();
  if ('error' in ctx) {
    return ctx.error;
  }

  try {
    const { searchParams } = new URL(request.url);
    const { start, end } = ensureDateRange({
      start: searchParams.get('start'),
      end: searchParams.get('end'),
    });
    const forceRefresh = searchParams.get('refresh') === '1';
    const payload = await getDashboardPayload({
      orgId: ctx.orgId,
      start,
      end,
      forceRefresh,
    });
    return NextResponse.json(payload, { headers: responseHeaders() });
  } catch (error) {
    const statusCode = Number((error as Error & { statusCode?: number })?.statusCode || 500);
    const publicMessage =
      statusCode >= 500
        ? 'Unable to sync data from the Nabis API right now.'
        : error instanceof Error
          ? error.message
          : 'Request failed.';

    console.error('[picc-nabis-dashboard]', error);
    return NextResponse.json(
      { error: publicMessage },
      {
        status: statusCode,
        headers: responseHeaders(),
      },
    );
  }
}
