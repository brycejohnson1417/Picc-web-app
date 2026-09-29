import { NextResponse } from 'next/server';
import { guard } from '@/lib/auth/api-guard';
import { extractMailboxPeople, normalizeMailboxEmail } from '@/lib/gmail/gmail-domain';
import {
  getGmailAccess,
  GMAIL_SETUP_UNAVAILABLE_MESSAGE,
  GmailIntegrationUnavailableError,
  GmailNotConnectedError,
} from '@/lib/server/gmail-connection';
import { listGmailMessages } from '@/lib/server/gmail-provider';
import { loadAccountContactRuntime } from '@/lib/server/account-contact-runtime';

export async function GET() {
  const ctx = await guard(['ADMIN', 'OPS_TEAM', 'SALES_REP']);
  if ('error' in ctx) return ctx.error;
  try {
    const [{ accessToken, connection }, runtime] = await Promise.all([
      getGmailAccess(ctx.orgId, ctx.userId),
      loadAccountContactRuntime(),
    ]);
    const messages = await listGmailMessages(accessToken, 'newer_than:90d -category:promotions -category:social', 60);
    const existingEmails = new Set(runtime.contacts.map((contact) => normalizeMailboxEmail(contact.email)).filter(Boolean));
    const suggestions = extractMailboxPeople(messages, connection.mailboxEmail)
      .filter((person) => !existingEmails.has(person.email))
      .slice(0, 20);
    return NextResponse.json({ suggestions, mailboxEmail: connection.mailboxEmail });
  } catch (error) {
    if (error instanceof GmailNotConnectedError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    if (error instanceof GmailIntegrationUnavailableError) {
      return NextResponse.json({ error: GMAIL_SETUP_UNAVAILABLE_MESSAGE }, { status: 503 });
    }
    return NextResponse.json({ error: 'Suggested contacts could not be loaded. Try again.' }, { status: 502 });
  }
}
