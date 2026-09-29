import { z } from 'zod';
import { randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';
import { guard } from '@/lib/auth/api-guard';
import { encodeOAuthState } from '@/lib/gmail/gmail-domain';
import { buildGmailAuthorizationUrl, gmailConfigurationStatus } from '@/lib/server/gmail-provider';

export async function POST(request: Request) {
  const ctx = await guard(['ADMIN', 'OPS_TEAM', 'SALES_REP']);
  if ('error' in ctx) return ctx.error;
  if (!gmailConfigurationStatus().configured) {
    return NextResponse.json({ error: 'Gmail OAuth is not configured for this deployment.' }, { status: 503 });
  }
  const parsed = z.object({sentCopies:z.boolean().optional()}).safeParse(await request.json().catch(()=>({})));
  if(!parsed.success)return NextResponse.json({error:'Invalid connection request.'},{status:400});
  const sentCopies = parsed.data.sentCopies === true;
  const nonce = randomBytes(24).toString('base64url');
  const state = encodeOAuthState({ orgId: ctx.orgId, userId: ctx.userId, nonce, returnTo: '/settings#connected-services', sentCopies });
  const response = NextResponse.json({ authorizationUrl: buildGmailAuthorizationUrl(state,sentCopies) });
  response.cookies.set('picc_gmail_oauth_nonce', nonce, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/api/integrations/gmail/callback',
    maxAge: 10 * 60,
  });
  return response;
}
