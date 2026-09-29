import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildGmailAuthorizationUrl, GMAIL_READONLY_SCOPE, listGmailMessages } from '@/lib/server/gmail-provider';

const prior = { ...process.env };
afterEach(() => {
  process.env.GMAIL_OAUTH_CLIENT_ID = prior.GMAIL_OAUTH_CLIENT_ID;
  process.env.GMAIL_OAUTH_CLIENT_SECRET = prior.GMAIL_OAUTH_CLIENT_SECRET;
  process.env.NEXT_PUBLIC_APP_URL = prior.NEXT_PUBLIC_APP_URL;
});

describe('Gmail provider boundary', () => {
  it('builds an offline, consented, read-only authorization request', () => {
    process.env.GMAIL_OAUTH_CLIENT_ID = 'client-id';
    process.env.GMAIL_OAUTH_CLIENT_SECRET = 'client-secret';
    process.env.NEXT_PUBLIC_APP_URL = 'https://app.example.com';
    const url = new URL(buildGmailAuthorizationUrl('signed-state'));

    expect(url.searchParams.get('scope')).toContain(GMAIL_READONLY_SCOPE);
    expect(url.searchParams.get('access_type')).toBe('offline');
    expect(url.searchParams.get('prompt')).toBe('consent');
    expect(url.searchParams.get('redirect_uri')).toBe('https://app.example.com/api/integrations/gmail/callback');
  });

  it('loads message metadata in bounded batches and returns newest first', async () => {
    const fetchImpl = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes('/messages?')) return Response.json({ messages: [{ id: 'old', threadId: 't-old' }, { id: 'new', threadId: 't-new' }] });
      const isNew = url.includes('/messages/new');
      return Response.json({
        id: isNew ? 'new' : 'old', threadId: isNew ? 't-new' : 't-old', internalDate: isNew ? '2000' : '1000', snippet: 'hello',
        payload: { headers: [{ name: 'From', value: 'Mara <mara@example.com>' }, { name: 'To', value: 'rep@picc.co' }, { name: 'Subject', value: isNew ? 'New' : 'Old' }] },
      });
    }) as unknown as typeof fetch;

    const messages = await listGmailMessages('token', 'newer_than:30d', 20, fetchImpl);
    expect(messages.map((message) => message.subject)).toEqual(['New', 'Old']);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });
});

describe('thread retrieval', () => {
  it('paginates metadata reads and uses a full read only for an expanded thread', async () => {
    const { listGmailThreads, getGmailThread } = await import('./gmail-provider');
    const urls: string[] = [];
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      const url = String(input); urls.push(url);
      return new Response(JSON.stringify(url.includes('/threads?') ? { threads: [{id:'t1'},{id:'t1'},{id:'t2'}], nextPageToken:'next3' } : {id:'t1',messages:[]}),{status:200});
    }) as unknown as typeof fetch;
    const page = await listGmailThreads('token','from:buyer@example.com','page2',fetcher);
    expect(page.threads).toHaveLength(2);expect(page.nextPageToken).toBe('next3');
    expect(new URL(urls[0]).searchParams.get('pageToken')).toBe('page2');
    expect(new URL(urls[0]).searchParams.get('maxResults')).toBe('20');
    expect(new URL(urls[1]).searchParams.getAll('metadataHeaders')).toContain('Cc');
    expect(urls.every(url => !url.includes('format=full'))).toBe(true);
    await getGmailThread('token','t1','full',fetcher);
    expect(urls.at(-1)).toContain('format=full');
  });
});
