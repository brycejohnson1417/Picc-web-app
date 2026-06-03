import { NextResponse } from 'next/server';
import { guard } from '@/lib/auth/api-guard';
import { getPreferredPartnerProposal } from '@/lib/server/preferred-partner-proposal';

export const dynamic = 'force-dynamic';

function responseHeaders() {
  return {
    'Cache-Control': 'private, no-store, max-age=0, must-revalidate',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
  };
}

export async function POST(request: Request, { params }: { params: Promise<{ accountId: string }> }) {
  const ctx = await guard();
  if ('error' in ctx) {
    return ctx.error;
  }

  try {
    const { accountId } = await params;
    const body = (await request.json()) as { rawReport?: string | null };
    const payload = await getPreferredPartnerProposal({
      orgId: ctx.orgId,
      accountIdOrPageId: accountId,
      rawReport: body.rawReport?.trim() || '',
    });

    return NextResponse.json(payload, { headers: responseHeaders() });
  } catch (error) {
    const statusCode = Number((error as Error & { statusCode?: number })?.statusCode || 500);
    const message = statusCode >= 500 ? 'Unable to generate a PPP proposal right now.' : (error as Error).message;

    console.error('[preferred-partner-proposal]', error);
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
