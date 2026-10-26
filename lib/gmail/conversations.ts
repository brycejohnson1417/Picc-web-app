// Server-side Gmail parsing. UI imports the serializable types only.
export type GmailPart = {
  mimeType?: string; filename?: string; body?: { data?: string }; parts?: GmailPart[];
  headers?: Array<{ name?: string | null; value?: string | null }> | null;
};
export type GmailThreadPayload = { id?: string; messages?: Array<{
  id?: string; threadId?: string; internalDate?: string; snippet?: string;
  labelIds?: string[]; payload?: GmailPart;
}> };
export type ConversationMessage = {
  id: string; from: string; to: string; cc: string; occurredAt: string;
  direction: 'sent' | 'received'; text: string; truncated: boolean;
};
export type GmailConversation = {
  id: string; subject: string; snippet: string; occurredAt: string; messageCount: number;
  matchedEmails: string[]; externalUrl: string; messages: ConversationMessage[];
};
export type ConversationPage = {
  threads: GmailConversation[]; nextPageToken: string | null; mailboxEmail: string;
  matchedContactCount: number; checkedAt: string; range: string;
};

export function exactEmail(value: string) {
  const email = value.trim().toLowerCase();
  return /^[a-z0-9.!#$%&'*+/=?^_`|~-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+$/.test(email) ? email : '';
}
export function participantEmails(value: string) {
  // Match addresses directly so quoted display names containing commas remain intact.
  return [...new Set((value.match(/[a-z0-9.!#$%&'*+/=?^_`|~-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+/gi) ?? []).map(exactEmail).filter(Boolean))];
}
export function conversationQuery(emails: string[], range: string) {
  const normalized = [...new Set(emails.map(exactEmail).filter(Boolean))];
  if (!normalized.length) return null;
  return `{${normalized.flatMap(email => [`from:${email}`, `to:${email}`, `cc:${email}`]).join(' ')}}${range === 'all' ? '' : ` newer_than:${range === '90d' ? '90d' : '2y'}`}`;
}
function textEntities(value: string) {
  return value.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (all, key: string) => {
    if (key.startsWith('#')) { const code = key[1].toLowerCase() === 'x' ? parseInt(key.slice(2),16) : Number(key.slice(1)); return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : all; }
    return ({ amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' ' } as Record<string,string>)[key.toLowerCase()] ?? all;
  });
}
function messageText(part?: GmailPart): string {
  if (!part || part.filename) return '';
  const pieces = part.parts?.filter(child => !child.filename) ?? [];
  if (pieces.length) {
    const plain = pieces.find(child => child.mimeType === 'text/plain');
    return plain ? messageText(plain) : pieces.map(messageText).filter(Boolean).join('\n');
  }
  if (!part.body?.data || !['text/plain','text/html'].includes(part.mimeType ?? '')) return '';
  const text = Buffer.from(part.body.data, 'base64url').toString('utf8');
  // Returned only as React text, never HTML. No remote images, scripts or tracking pixels.
  return part.mimeType === 'text/html' ? textEntities(text.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,'').replace(/<(br\b[^>]*|\/p|\/div|\/tr)>/gi,'\n').replace(/<[^>]*>/g,'')).trim() : text.trim();
}
export function parseConversation(raw: GmailThreadPayload, targetEmails: string[], mailboxEmail: string): GmailConversation | null {
  if (!raw.id || !raw.messages?.length) return null;
  const targets = new Set(targetEmails.map(exactEmail).filter(Boolean));
  const matched = new Set<string>();
  let subject = '';
  const messages = [...new Map(raw.messages.map(message => [message.id, message])).values()].filter(message => message.id).map(message => {
    const header = (name: string) => message.payload?.headers?.find(h => h.name?.toLowerCase() === name.toLowerCase())?.value ?? '';
    const from = header('From'), to = header('To'), cc = header('Cc');
    for (const email of participantEmails(`${from},${to},${cc}`)) if (targets.has(email)) matched.add(email);
    subject ||= header('Subject');
    const body = messageText(message.payload) || textEntities(message.snippet ?? '');
    const time = Number(message.internalDate);
    return { id: message.id!, from, to, cc, occurredAt: new Date(Number.isFinite(time) && time > 0 ? time : 0).toISOString(),
      direction: message.labelIds?.includes('SENT') || participantEmails(from).includes(exactEmail(mailboxEmail)) ? 'sent' as const : 'received' as const,
      text: body.slice(0,20000), truncated: body.length > 20000 };
  }).sort((a,b) => a.occurredAt.localeCompare(b.occurredAt));
  if (!matched.size || !messages.length) return null;
  return { id: raw.id, subject: textEntities(subject) || '(No subject)', snippet: textEntities(raw.messages[raw.messages.length-1]?.snippet ?? ''), occurredAt: messages[messages.length-1].occurredAt,
    messageCount: messages.length, matchedEmails: [...matched], externalUrl: `https://mail.google.com/mail/u/${encodeURIComponent(mailboxEmail)}/#all/${encodeURIComponent(raw.id)}`, messages };
}
export function suggestionIsRelevant(email: string, mailboxEmail: string) {
  const normalized = exactEmail(email);
  if (!normalized) return false;
  const [local, domain] = normalized.split('@');
  if (domain === exactEmail(mailboxEmail).split('@')[1]) return false;
  return !/(^|[._-])(no.?reply|do.?not.?reply|notifications?|newsletter|newsletters|invoices?|billing|mailer|postmaster|posts-recaps|updates|digest)([._-]|$)/i.test(local);
}
