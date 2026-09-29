import { createCipheriv, createDecipheriv, createHmac, createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export type GmailMessagePayload = {
  id?: string | null;
  threadId?: string | null;
  snippet?: string | null;
  internalDate?: string | null;
  payload?: { headers?: Array<{ name?: string | null; value?: string | null }> | null } | null;
};

export type ParsedGmailMessage = {
  id: string;
  threadId: string;
  from: string;
  to: string;
  subject: string;
  snippet: string;
  occurredAt: string;
  externalUrl: string;
  automated: boolean;
};

type OAuthState = {
  orgId: string;
  userId: string;
  nonce: string;
  returnTo: string;
  issuedAt: number;
};

function requiredSecret(name: 'GMAIL_OAUTH_STATE_SECRET' | 'GMAIL_TOKEN_ENCRYPTION_KEY') {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function base64Url(value: Buffer | string) {
  return Buffer.from(value).toString('base64url');
}

export function encodeOAuthState(input: Omit<OAuthState, 'issuedAt'> & { issuedAt?: number }) {
  const payload = base64Url(JSON.stringify({ ...input, issuedAt: input.issuedAt ?? Date.now() }));
  const signature = createHmac('sha256', requiredSecret('GMAIL_OAUTH_STATE_SECRET')).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

export function decodeOAuthState(value: string): OAuthState {
  const [payload, signature, extra] = value.split('.');
  if (!payload || !signature || extra) throw new Error('Invalid Gmail OAuth state');
  const expected = createHmac('sha256', requiredSecret('GMAIL_OAUTH_STATE_SECRET')).update(payload).digest();
  let received: Buffer;
  try {
    received = Buffer.from(signature, 'base64url');
  } catch {
    throw new Error('Invalid Gmail OAuth state');
  }
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) throw new Error('Invalid Gmail OAuth state');
  let parsed: OAuthState;
  try {
    parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as OAuthState;
  } catch {
    throw new Error('Invalid Gmail OAuth state');
  }
  if (!parsed.orgId || !parsed.userId || !parsed.nonce || !parsed.returnTo || !Number.isFinite(parsed.issuedAt)) throw new Error('Invalid Gmail OAuth state');
  if (Date.now() - parsed.issuedAt > 10 * 60 * 1000) throw new Error('Expired Gmail OAuth state');
  return parsed;
}

function encryptionKey() {
  return createHash('sha256').update(requiredSecret('GMAIL_TOKEN_ENCRYPTION_KEY')).digest();
}

export function protectToken(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return ['v1', base64Url(iv), base64Url(cipher.getAuthTag()), base64Url(ciphertext)].join('.');
}

export function revealToken(value: string) {
  const [version, iv, tag, ciphertext, extra] = value.split('.');
  if (version !== 'v1' || !iv || !tag || !ciphertext || extra) throw new Error('Invalid encrypted token');
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, 'base64url')), decipher.final()]).toString('utf8');
}

function header(payload: GmailMessagePayload, name: string) {
  return payload.payload?.headers?.find((candidate) => candidate.name?.toLowerCase() === name.toLowerCase())?.value?.trim() ?? '';
}

export function parseGmailMessage(payload: GmailMessagePayload): ParsedGmailMessage {
  const id = payload.id?.trim();
  const threadId = payload.threadId?.trim();
  if (!id || !threadId) throw new Error('Gmail message is missing its provider identity');
  const internalDate = Number(payload.internalDate);
  return {
    id,
    threadId,
    from: header(payload, 'From'),
    to: header(payload, 'To'),
    subject: header(payload, 'Subject') || '(No subject)',
    snippet: payload.snippet?.trim() ?? '',
    occurredAt: Number.isFinite(internalDate) && internalDate > 0 ? new Date(internalDate).toISOString() : new Date(0).toISOString(),
    externalUrl: `https://mail.google.com/mail/u/0/#all/${encodeURIComponent(threadId)}`,
    automated: Boolean(header(payload, 'List-Unsubscribe') || header(payload, 'List-Id') || /bulk|list|junk/i.test(header(payload, 'Precedence')) || (header(payload, 'Auto-Submitted') && header(payload, 'Auto-Submitted').toLowerCase() !== 'no')),
  };
}

function parseMailboxPeople(value: string) {
  return value.split(',').map((entry) => {
    const trimmed = entry.trim();
    const angle = trimmed.match(/^(.*?)\s*<([^>]+)>$/);
    const email = normalizeMailboxEmail(trimmed);
    const name = angle?.[1]?.replace(/^"|"$/g, '').trim() || email.split('@')[0]?.replace(/[._-]+/g, ' ') || 'Unknown contact';
    return email ? { email, name } : null;
  }).filter((person): person is { email: string; name: string } => Boolean(person));
}

export function normalizeMailboxEmail(value: string) {
  const angle = value.match(/<([^>]+)>/);
  const candidate = (angle?.[1] ?? value).trim().toLowerCase();
  const match = candidate.match(/[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,}/i);
  return match?.[0]?.toLowerCase() ?? '';
}

export function extractMailboxPeople(messages: Array<Pick<ParsedGmailMessage, 'from' | 'to' | 'occurredAt'> & { automated?: boolean }>, mailboxEmail: string) {
  const ownEmail = normalizeMailboxEmail(mailboxEmail);
  const people = new Map<string, { email: string; name: string; messageCount: number; lastInteractionAt: string }>();
  for (const message of messages) {
    if (message.automated) continue;
    for (const person of [...parseMailboxPeople(message.from), ...parseMailboxPeople(message.to)]) {
      if (!person.email || person.email === ownEmail) continue;
      const current = people.get(person.email);
      people.set(person.email, {
        email: person.email,
        name: current && current.name.length >= person.name.length ? current.name : person.name,
        messageCount: (current?.messageCount ?? 0) + 1,
        lastInteractionAt: !current || message.occurredAt > current.lastInteractionAt ? message.occurredAt : current.lastInteractionAt,
      });
    }
  }
  return [...people.values()].sort((a, b) => b.lastInteractionAt.localeCompare(a.lastInteractionAt) || a.email.localeCompare(b.email));
}
