import { NextResponse } from 'next/server';
import { z } from 'zod';
import { guard } from '@/lib/auth/api-guard';
import { AUTH_BYPASS_MODE } from '@/lib/config/runtime';
import { SampleOrderError } from '@/lib/order-samples/distru';
import { applySamples, previewSamples } from '@/lib/order-samples/service';
import { AppRoles } from '@/lib/types/rbac';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;
const roles = [AppRoles.ADMIN, AppRoles.OPS_TEAM, AppRoles.SALES_REP];
const headers = { 'Cache-Control': 'private, no-store' };
const confirmation = z.object({
  fingerprint: z.string().regex(/^[0-9a-f]{64}$/),
  productIds: z.array(z.string().min(1).max(128)).min(1).max(75),
});
type Context = { params: Promise<{ accountId: string }> };

function failure(error: unknown) {
  return NextResponse.json({ error: error instanceof SampleOrderError ? error.message : 'Unable to verify the Distru order. Check the connection and try again.' },
    { status: error instanceof SampleOrderError ? error.status : 502, headers });
}

export async function GET(_request: Request, { params }: Context) {
  if (AUTH_BYPASS_MODE) return NextResponse.json({ error: 'Sign in to review Distru orders.' }, { status: 401, headers });
  const actor = await guard(roles);
  if ('error' in actor) return actor.error;
  try {
    const { accountId } = await params;
    return NextResponse.json(await previewSamples(accountId, actor), { headers });
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request, { params }: Context) {
  if (AUTH_BYPASS_MODE) return NextResponse.json({ error: 'Sign in to update Distru orders.' }, { status: 401, headers });
  const actor = await guard(roles);
  if ('error' in actor) return actor.error;
  if (!request.headers.get('content-type')?.startsWith('application/json') ||
      request.headers.get('sec-fetch-site') === 'cross-site') {
    return NextResponse.json({ error: 'Confirm the review from the PICC app.' }, { status: 403, headers });
  }
  const parsed = confirmation.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'The sample confirmation was invalid.' }, { status: 400, headers });
  try {
    const { accountId } = await params;
    return NextResponse.json(await applySamples(accountId, actor, parsed.data.fingerprint, parsed.data.productIds), { headers });
  } catch (error) {
    return failure(error);
  }
}
