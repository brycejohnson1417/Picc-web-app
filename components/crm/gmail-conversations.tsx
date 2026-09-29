'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ChevronDown, ExternalLink, Loader2, Mail, RefreshCw } from 'lucide-react';
import type { ConversationPage, GmailConversation } from '@/lib/gmail/conversations';
import { Button } from '@/components/ui';

export function GmailConversations({ kind, recordId }: { kind: 'contact' | 'account'; recordId: string }) {
  const endpoint = `/api/${kind === 'contact' ? 'contacts' : 'accounts'}/${encodeURIComponent(recordId)}/gmail`;
  return <ConversationList key={endpoint} endpoint={endpoint} kind={kind} />;
}

function ConversationList({ endpoint, kind }: { endpoint: string; kind: 'contact' | 'account' }) {
  const [range, setRange] = useState('2y');
  const [page, setPage] = useState<ConversationPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [needsConnection, setNeedsConnection] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const controller = useRef<AbortController | null>(null);

  const load = useCallback(async (pageToken?: string) => {
    controller.current?.abort();
    const request = new AbortController();
    controller.current = request;
    setLoading(true); setError(null);
    if (!pageToken) { setPage(null); setExpanded(null); }
    const params = new URLSearchParams({range});
    if (pageToken) params.set('pageToken',pageToken);
    try {
      const response = await fetch(`${endpoint}?${params}`,{cache:'no-store',signal:request.signal});
      const data = await response.json();
      if (request.signal.aborted) return;
      setNeedsConnection(Boolean(data.needsConnection));
      if (!response.ok) { if (response.status === 409) setPage(null); throw new Error(data.error || 'Conversations could not be loaded.'); }
      setPage(current => ({...data, threads:pageToken && current ? [...new Map([...current.threads,...data.threads].map((thread: GmailConversation) => [thread.id,thread])).values()] : data.threads}));
    } catch (caught) {
      if (!request.signal.aborted) setError(caught instanceof Error ? caught.message : 'Conversations could not be loaded.');
    } finally { if (!request.signal.aborted) setLoading(false); }
  },[endpoint,range]);
  useEffect(() => { void load(); return () => controller.current?.abort(); },[load]);

  return <section aria-label="Gmail conversations" className="min-w-0 rounded-xl border border-slate-200 bg-white p-4 text-slate-900">
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0"><h2 className="flex items-center gap-2 text-base font-semibold"><Mail aria-hidden="true" className="h-4 w-4 text-[#c93412]" /> Email conversations</h2><p className="mt-1 text-sm text-slate-600">Private to you · Read-only Gmail</p></div>
      <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading} aria-label="Refresh conversations"><RefreshCw aria-hidden="true" className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh</Button>
    </div>
    <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
      <label className="flex items-center gap-2 text-sm font-medium">History
        <select aria-label="Conversation history range" value={range} onChange={event => setRange(event.target.value)} className="min-h-10 rounded-lg border border-slate-300 bg-white px-2 text-sm text-slate-900">
          <option value="90d">Last 90 days</option><option value="2y">Last 2 years</option><option value="all">All history</option>
        </select>
      </label>
      {page ? <p className="min-w-0 break-all text-xs text-slate-600">{page.mailboxEmail}</p> : null}
    </div>
    <p className="mt-3 text-xs leading-5 text-slate-600">{kind === 'account' ? 'Matched to email addresses of this account’s linked contacts.' : 'Matched to this contact’s exact email address.'} Includes From, To and Cc. Refresh checks Gmail directly.</p>
    {error ? <div role="alert" className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950"><p>{error}</p><div className="mt-2 flex flex-wrap gap-3">{needsConnection ? null : <button type="button" className="min-h-10 font-semibold underline" onClick={() => void load(page?.nextPageToken ?? undefined)}>Try again</button>}<Link className="inline-flex min-h-10 items-center font-semibold underline" href="/settings#connected-services">Gmail Settings</Link></div></div> : null}
    <div aria-live="polite" aria-busy={loading}>
      {loading ? <p role="status" className="mt-4 flex items-center gap-2 text-sm text-slate-600"><Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> Loading conversations…</p> : null}
      {page && !page.threads.length && !loading ? <p className="mt-4 rounded-lg bg-slate-50 p-4 text-sm text-slate-700">No matching conversations in this period. Try All history or check the contact email addresses.</p> : null}
      {page?.threads.length ? <ul className="mt-4 divide-y divide-slate-200 border-y border-slate-200">{page.threads.map(thread => <li key={thread.id} className="min-w-0 py-1">
        <button type="button" className="flex w-full items-start gap-2 rounded-lg px-1 py-3 text-left hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#c93412]" aria-expanded={expanded === thread.id} onClick={() => setExpanded(current => current === thread.id ? null : thread.id)}>
          <ChevronDown aria-hidden="true" className={`mt-1 h-4 w-4 shrink-0 transition-transform ${expanded === thread.id ? 'rotate-180' : ''}`} />
          <span className="min-w-0 flex-1"><span className="block break-words text-sm font-semibold">{thread.subject}</span><span className="mt-1 block text-xs text-slate-600">{thread.messageCount} {thread.messageCount === 1 ? 'message' : 'messages'} · {new Date(thread.occurredAt).toLocaleDateString()}</span><span className="mt-1 block truncate text-xs text-slate-600">{thread.snippet}</span></span>
        </button>
        {expanded === thread.id ? <ConversationDetail key={thread.id} thread={thread} endpoint={endpoint} /> : null}
      </li>)}</ul> : null}
      {page ? <div className="mt-3 flex flex-wrap items-center justify-between gap-2"><p className="text-xs text-slate-600">{page.threads.length} conversations loaded · Checked {new Date(page.checkedAt).toLocaleTimeString([], {hour:'numeric',minute:'2-digit'})}</p>{page.nextPageToken ? <Button variant="outline" disabled={loading} onClick={() => void load(page.nextPageToken!)}>Load more</Button> : null}</div> : null}
    </div>
  </section>;
}

function ConversationDetail({ thread, endpoint }: { thread: GmailConversation; endpoint: string }) {
  const [detail, setDetail] = useState<GmailConversation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setError(null); setDetail(null);
    void fetch(`${endpoint}?threadId=${encodeURIComponent(thread.id)}`,{cache:'no-store',signal:controller.signal}).then(async response => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'This conversation could not be opened.');
      if (!controller.signal.aborted) setDetail(data.thread);
    }).catch(caught => { if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : 'This conversation could not be opened.'); });
    return () => controller.abort();
  },[endpoint,thread.id,attempt]);
  return <div className="mb-3 min-w-0 rounded-lg bg-slate-50 p-3">
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><p className="text-xs text-slate-600">Message text · Attachments stay in Gmail</p><a href={thread.externalUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-10 items-center gap-1 text-sm font-semibold text-blue-800 underline">Open in Gmail <ExternalLink aria-hidden="true" className="h-3 w-3" /></a></div>
    {error ? <div role="alert" className="text-sm text-red-800">{error}<button type="button" className="ml-2 min-h-10 font-semibold underline" onClick={() => setAttempt(value => value+1)}>Retry message</button></div> : !detail ? <p role="status" className="text-sm text-slate-600">Loading messages…</p> : <div className="divide-y divide-slate-200">{detail.messages.map(message => <article key={message.id} className="py-3 first:pt-0">
      <p className="break-words text-sm font-semibold">{message.direction === 'sent' ? 'Sent' : 'Received'} · {message.from}</p>
      <p className="mt-1 break-words text-xs text-slate-600">To: {message.to}{message.cc ? ` · Cc: ${message.cc}` : ''}</p>
      <time className="mt-1 block text-xs text-slate-600">{new Date(message.occurredAt).toLocaleString()}</time>
      <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-slate-900 [overflow-wrap:anywhere]">{message.text || 'No message text available. Open this conversation in Gmail.'}</p>
      {message.truncated ? <p className="mt-2 text-xs text-slate-600">Long message shortened. Open in Gmail to read the rest.</p> : null}
    </article>)}</div>}
  </div>;
}
