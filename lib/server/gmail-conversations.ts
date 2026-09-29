import { NextResponse } from 'next/server';
import { guard } from '@/lib/auth/api-guard';
import { conversationQuery, exactEmail, parseConversation } from '@/lib/gmail/conversations';
import { loadAccountContactRuntime } from '@/lib/server/account-contact-runtime';
import { getGmailAccess, GmailNotConnectedError, GmailIntegrationUnavailableError, GMAIL_SETUP_UNAVAILABLE_MESSAGE } from '@/lib/server/gmail-connection';
import { getGmailThread, listGmailThreads } from '@/lib/server/gmail-provider';

const privateHeaders = { 'Cache-Control': 'private, no-store', Vary: 'Cookie' };
const normalizeId = (id: string) => id.replace(/-/g,'').toLowerCase();
function json(body: unknown, status = 200) { return NextResponse.json(body, {status, headers:privateHeaders}); }

export async function gmailConversations(request: Request, target: { kind: 'contact' | 'account'; id: string }) {
  const ctx = await guard(['ADMIN','OPS_TEAM','SALES_REP']);
  if ('error' in ctx) return ctx.error ?? json({error:'Access denied.'},403);
  const id = normalizeId(target.id);
  if (!/^[a-f0-9]{32}$/.test(id)) return json({error:'Invalid record.'},400);
  const search = new URL(request.url).searchParams;
  const range = search.get('range') ?? '2y';
  const pageToken = search.get('pageToken') ?? undefined;
  const threadId = search.get('threadId');
  if (!['90d','2y','all'].includes(range) || (pageToken?.length ?? 0) > 2048 || (threadId && !/^[a-zA-Z0-9_-]{1,200}$/.test(threadId))) return json({error:'Invalid conversation request.'},400);
  try {
    const { accessToken, connection } = await getGmailAccess(ctx.orgId,ctx.userId);
    const runtime = await loadAccountContactRuntime();
    if ((runtime.freshness?.contacts.error && !runtime.contacts.length) || (target.kind === 'account' && runtime.freshness?.accounts.error && !runtime.accounts.length)) return json({error:'Contact matching is temporarily unavailable. Try again shortly.'},503);
    const recordExists = target.kind === 'contact'
      ? runtime.contacts.some(contact => normalizeId(contact.id) === id)
      : runtime.accounts.some(account => normalizeId(account.notionPageId) === id || normalizeId(account.id) === id);
    if (!recordExists) return json({error: target.kind === 'contact' ? 'Contact not found.' : 'Account not found.'},404);
    const contacts = runtime.contacts.filter(contact => target.kind === 'contact' ? normalizeId(contact.id) === id : contact.accountPageIds.some(accountId => normalizeId(accountId) === id));
    const emails = [...new Set(contacts.map(contact => exactEmail(contact.email ?? '')).filter(Boolean))];
    if (emails.length > 100) return json({error:'This account has more than 100 email addresses. Open a specific contact to view conversations.'},422);
    const query = conversationQuery(emails,range);
    if (!query) return json({error: target.kind === 'contact' ? 'Add a valid email address to this contact to find conversations.' : 'Link contacts with email addresses to this account to find conversations.'},422);
    if (threadId) {
      const raw = await getGmailThread(accessToken,threadId,'full');
      const thread = parseConversation(raw,emails,connection.mailboxEmail);
      if (!thread) return json({error:'This conversation no longer matches this record.'},404);
      return json({thread});
    }
    const page = await listGmailThreads(accessToken,query,pageToken);
    const threads = page.threads.map(raw => parseConversation(raw,emails,connection.mailboxEmail)).filter(thread => thread !== null).map(thread => ({...thread,messages:[]})).sort((a,b) => b.occurredAt.localeCompare(a.occurredAt));
    return json({threads,nextPageToken:page.nextPageToken,mailboxEmail:connection.mailboxEmail,matchedContactCount:emails.length,checkedAt:new Date().toISOString(),range});
  } catch (error) {
    if (error instanceof GmailNotConnectedError) return json({error:'Connect your Gmail in Settings to view conversations.',needsConnection:true},409);
    if (error instanceof GmailIntegrationUnavailableError) return json({error:GMAIL_SETUP_UNAVAILABLE_MESSAGE},503);
    return json({error:'Gmail could not load conversations. Try again, or reconnect Gmail in Settings if the problem continues.'},502);
  }
}
