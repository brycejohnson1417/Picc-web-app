import { NextResponse } from 'next/server';
import { guard } from '@/lib/auth/api-guard';
import { prisma } from '@/lib/db/prisma';
import {
  getGmailConnectionStatus,
  GMAIL_SETUP_UNAVAILABLE_MESSAGE,
  GmailIntegrationUnavailableError,
} from '@/lib/server/gmail-connection';
import { gmailConfigurationStatus } from '@/lib/server/gmail-provider';

export async function GET() {
  const ctx = await guard(['ADMIN', 'OPS_TEAM', 'SALES_REP']);
  if ('error' in ctx) return ctx.error;
  try {
    const connection = await getGmailConnectionStatus(ctx.orgId, ctx.userId);
    return NextResponse.json({ configuration: gmailConfigurationStatus(), connection });
  } catch (error) {
    if (error instanceof GmailIntegrationUnavailableError) {
      return NextResponse.json({ error: GMAIL_SETUP_UNAVAILABLE_MESSAGE }, { status: 503 });
    }
    return NextResponse.json({ error: 'Gmail status could not be loaded. Try again.' }, { status: 502 });
  }
}

export async function DELETE() {
  const ctx = await guard(['ADMIN', 'OPS_TEAM', 'SALES_REP']);
  if ('error' in ctx) return ctx.error;
  await prisma.gmailConnection.deleteMany({ where: { orgId: ctx.orgId, clerkUserId: ctx.userId } });
  return NextResponse.json({ ok: true });
}
