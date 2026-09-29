import { GMAIL_INSERT_SCOPE } from '@/lib/server/gmail-sent-copy';
import { IntegrationSyncStatus } from '@prisma/client';
import { NextRequest, NextResponse } from 'next/server';
import { guard } from '@/lib/auth/api-guard';
import { decodeOAuthState, protectToken } from '@/lib/gmail/gmail-domain';
import { prisma } from '@/lib/db/prisma';
import { exchangeGmailCode, getGmailProfile, GMAIL_READONLY_SCOPE } from '@/lib/server/gmail-provider';
import { tokenExpiry } from '@/lib/server/gmail-connection';

function settingsRedirect(request: Request, outcome: 'connected' | 'error') {
  const url = new URL('/settings', request.url);
  url.hash = 'connected-services';
  url.searchParams.set('gmail', outcome);
  return url;
}

export async function GET(request: NextRequest) {
  const ctx = await guard(['ADMIN', 'OPS_TEAM', 'SALES_REP']);
  if ('error' in ctx) return ctx.error;
  try {
    const code = request.nextUrl.searchParams.get('code');
    const stateValue = request.nextUrl.searchParams.get('state');
    if (!code || !stateValue) throw new Error('Gmail callback is missing authorization details');
    const state = decodeOAuthState(stateValue);
    const nonce = request.cookies.get('picc_gmail_oauth_nonce')?.value;
    if (!nonce || nonce !== state.nonce || state.orgId !== ctx.orgId || state.userId !== ctx.userId) throw new Error('Gmail OAuth session does not match');
    const tokens = await exchangeGmailCode(code);
    if (!tokens.refresh_token) throw new Error('Google did not return offline mailbox access. Reconnect and approve access.');
    const hasInsert = tokens.scope?.split(' ').includes(GMAIL_INSERT_SCOPE) === true;
    if(state.sentCopies && !hasInsert)throw new Error('Gmail copy permission was not granted');
    const profile = await getGmailProfile(tokens.access_token);
    await prisma.gmailConnection.upsert({
      where: { orgId_clerkUserId: { orgId: ctx.orgId, clerkUserId: ctx.userId } },
      create: {
        orgId: ctx.orgId,
        clerkUserId: ctx.userId,
        mailboxEmail: profile.emailAddress.toLowerCase(),
        encryptedAccessToken: protectToken(tokens.access_token),
        encryptedRefreshToken: protectToken(tokens.refresh_token),
        accessTokenExpiresAt: tokenExpiry(tokens),
        grantedScope: tokens.scope || GMAIL_READONLY_SCOPE,
        sentCopiesEnabled: state.sentCopies === true && hasInsert,
        status: IntegrationSyncStatus.SUCCESS,
      },
      update: {
        mailboxEmail: profile.emailAddress.toLowerCase(),
        encryptedAccessToken: protectToken(tokens.access_token),
        encryptedRefreshToken: protectToken(tokens.refresh_token),
        accessTokenExpiresAt: tokenExpiry(tokens),
        grantedScope: tokens.scope || GMAIL_READONLY_SCOPE,
        sentCopiesEnabled: state.sentCopies === true && hasInsert,
        status: IntegrationSyncStatus.SUCCESS,
        lastError: null,
      },
    });
    const response = NextResponse.redirect(settingsRedirect(request, 'connected'));
    response.cookies.delete('picc_gmail_oauth_nonce');
    return response;
  } catch {
    const response = NextResponse.redirect(settingsRedirect(request, 'error'));
    response.cookies.delete('picc_gmail_oauth_nonce');
    return response;
  }
}
