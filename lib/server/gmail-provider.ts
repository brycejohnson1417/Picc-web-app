import { parseGmailMessage, type GmailMessagePayload, type ParsedGmailMessage } from '@/lib/gmail/gmail-domain';

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GMAIL_API_URL = 'https://gmail.googleapis.com/gmail/v1/users/me';
export const GMAIL_READONLY_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';

export type GmailTokenResponse = {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
};

function gmailConfig() {
  const clientId = process.env.GMAIL_OAUTH_CLIENT_ID?.trim();
  const clientSecret = process.env.GMAIL_OAUTH_CLIENT_SECRET?.trim();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (!clientId || !clientSecret || !appUrl) throw new Error('Gmail OAuth is not configured');
  return {
    clientId,
    clientSecret,
    redirectUri: `${appUrl.replace(/\/$/, '')}/api/integrations/gmail/callback`,
  };
}

export function gmailConfigurationStatus() {
  return {
    configured: Boolean(
      process.env.GMAIL_OAUTH_CLIENT_ID?.trim()
      && process.env.GMAIL_OAUTH_CLIENT_SECRET?.trim()
      && process.env.GMAIL_OAUTH_STATE_SECRET?.trim()
      && process.env.GMAIL_TOKEN_ENCRYPTION_KEY?.trim()
      && process.env.NEXT_PUBLIC_APP_URL?.trim(),
    ),
    redirectUri: process.env.NEXT_PUBLIC_APP_URL?.trim()
      ? `${process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, '')}/api/integrations/gmail/callback`
      : null,
  };
}

export function buildGmailAuthorizationUrl(state: string) {
  const config = gmailConfig();
  const query = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: 'code',
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    scope: `openid email ${GMAIL_READONLY_SCOPE}`,
    state,
  });
  return `${GOOGLE_AUTH_URL}?${query}`;
}

async function tokenRequest(body: URLSearchParams, fetchImpl: typeof fetch = fetch): Promise<GmailTokenResponse> {
  const response = await fetchImpl(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });
  const payload = (await response.json().catch(() => ({}))) as Partial<GmailTokenResponse> & { error_description?: string; error?: string };
  if (!response.ok || !payload.access_token || !payload.expires_in) {
    throw new Error(payload.error_description || payload.error || 'Gmail authorization failed');
  }
  return payload as GmailTokenResponse;
}

export function exchangeGmailCode(code: string, fetchImpl?: typeof fetch) {
  const config = gmailConfig();
  return tokenRequest(new URLSearchParams({
    code,
    client_id: config.clientId,
    client_secret: config.clientSecret,
    redirect_uri: config.redirectUri,
    grant_type: 'authorization_code',
  }), fetchImpl);
}

export function refreshGmailAccessToken(refreshToken: string, fetchImpl?: typeof fetch) {
  const config = gmailConfig();
  return tokenRequest(new URLSearchParams({
    refresh_token: refreshToken,
    client_id: config.clientId,
    client_secret: config.clientSecret,
    grant_type: 'refresh_token',
  }), fetchImpl);
}

async function gmailJson<T>(path: string, accessToken: string, fetchImpl: typeof fetch = fetch): Promise<T> {
  const response = await fetchImpl(`${GMAIL_API_URL}${path}`, {
    headers: { authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
    signal: AbortSignal.timeout(10000),
  });
  const payload = (await response.json().catch(() => ({}))) as T & { error?: { message?: string } };
  if (!response.ok) throw new Error(payload.error?.message || 'Gmail request failed');
  return payload;
}

export async function getGmailProfile(accessToken: string, fetchImpl?: typeof fetch) {
  return gmailJson<{ emailAddress: string; messagesTotal?: number; threadsTotal?: number }>('/profile', accessToken, fetchImpl);
}

export async function listGmailMessages(accessToken: string, query: string, maxResults = 30, fetchImpl?: typeof fetch) {
  const params = new URLSearchParams({ q: query, maxResults: String(Math.min(Math.max(maxResults, 1), 100)) });
  const listed = await gmailJson<{ messages?: Array<{ id: string; threadId: string }> }>(`/messages?${params}`, accessToken, fetchImpl);
  const ids = listed.messages ?? [];
  const messages: ParsedGmailMessage[] = [];
  for (let index = 0; index < ids.length; index += 8) {
    const batch = ids.slice(index, index + 8);
    const values = await Promise.all(batch.map(({ id }) => gmailJson<GmailMessagePayload>(
      `/messages/${encodeURIComponent(id)}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Date&metadataHeaders=List-Unsubscribe&metadataHeaders=List-Id&metadataHeaders=Precedence&metadataHeaders=Auto-Submitted`,
      accessToken,
      fetchImpl,
    )));
    messages.push(...values.map(parseGmailMessage));
  }
  return messages.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
}

/** On-demand read-through; no mailbox messages or contact links are persisted. */
export async function listGmailThreads(accessToken: string, query: string, pageToken?: string, fetchImpl?: typeof fetch) {
  const params = new URLSearchParams({ q: query, maxResults: '20' });
  if (pageToken) params.set('pageToken', pageToken);
  const listed = await gmailJson<{ threads?: Array<{ id: string }>; nextPageToken?: string }>(`/threads?${params}`, accessToken, fetchImpl);
  const threads: import('@/lib/gmail/conversations').GmailThreadPayload[] = [];
  const ids = [...new Set((listed.threads ?? []).map(thread => thread.id))].slice(0, 20);
  for (let i = 0; i < ids.length; i += 4) {
    threads.push(...await Promise.all(ids.slice(i,i+4).map(id => getGmailThread(accessToken, id, 'metadata', fetchImpl))));
  }
  return { threads, nextPageToken: listed.nextPageToken ?? null };
}

export function getGmailThread(accessToken: string, id: string, format: 'metadata' | 'full', fetchImpl?: typeof fetch) {
  const params = new URLSearchParams({ format });
  if (format === 'metadata') for (const name of ['From','To','Cc','Subject','Date']) params.append('metadataHeaders',name);
  return gmailJson<import('@/lib/gmail/conversations').GmailThreadPayload>(`/threads/${encodeURIComponent(id)}?${params}`,accessToken,fetchImpl);
}
