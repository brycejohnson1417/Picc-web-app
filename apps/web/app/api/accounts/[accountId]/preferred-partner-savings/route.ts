import { NextResponse } from 'next/server';
import { guard } from '@/lib/auth/api-guard';
import { getPreferredPartnerSavings } from '@/lib/server/preferred-partner-savings';

export const dynamic = 'force-dynamic';

function responseHeaders() {
  return {
    'Cache-Control': 'private, no-store, max-age=0, must-revalidate',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
  };
}

export async function GET(request: Request, { params }: { params: Promise<{ accountId: string }> }) {
  const ctx = await guard();
  if ('error' in ctx) {
    return ctx.error;
  }

  try {
    const { accountId } = await params;
    const { searchParams } = new URL(request.url);
    const yearParam = Number.parseInt(searchParams.get('year') || '', 10);
    const historical = searchParams.get('scope') === 'historical';
    const payload = await getPreferredPartnerSavings({
      orgId: ctx.orgId,
      accountIdOrPageId: accountId,
      year: historical ? null : Number.isFinite(yearParam) ? yearParam : null,
      historical,
    });

    return NextResponse.json(payload, { headers: responseHeaders() });
  } catch (error) {
    const statusCode = Number((error as Error & { statusCode?: number })?.statusCode || 500);
    const message = statusCode >= 500 ? 'Unable to calculate Preferred Partner savings right now.' : (error as Error).message;

    console.error('[preferred-partner-savings]', error);
    return NextResponse.json(
      {
        ok: false,
        error: message,
      },
      {
        status: statusCode,
        headers: responseHeaders(),
      },
    );
  }
}
