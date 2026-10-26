import { describe, expect, it } from 'vitest';
import { conversationQuery, parseConversation, suggestionIsRelevant } from './conversations';

const raw = { id: 'thread1', messages: [
  { id: 'm1', threadId: 'thread1', internalDate: '1700000000000', snippet: 'Hello', payload: { headers: [{ name: 'From', value: 'Buyer <buyer@example.com>' }, { name: 'To', value: 'rep@piccplatform.com' }, { name: 'Cc', value: '"Other, Buyer" <second@example.com>' }, { name: 'Subject', value: 'Order' }], mimeType: 'text/plain', body: { data: Buffer.from('Hello\nCan we reorder?').toString('base64url') } } },
  { id: 'm2', threadId: 'thread1', internalDate: '1700000001000', labelIds: ['SENT'], payload: { headers: [{ name: 'From', value: 'sales-alias@piccplatform.com' }, { name: 'To', value: 'buyer@example.com' }], mimeType: 'text/html', body: { data: Buffer.from('<style>hidden</style><p>Yes &amp; thanks</p><script>evil()</script>').toString('base64url') } } },
] };

describe('private Gmail conversations', () => {
 it('preserves the same thread for every exact participant without assigning it to one contact', () => {
   const a = parseConversation(raw, ['buyer@example.com'], 'rep@piccplatform.com');
   const b = parseConversation(raw, ['second@example.com'], 'rep@piccplatform.com');
   expect(a?.id).toBe('thread1'); expect(b?.id).toBe('thread1');
   expect(a?.matchedEmails).toEqual(['buyer@example.com']);
   expect(b?.matchedEmails).toEqual(['second@example.com']);
   expect(parseConversation(raw, ['other@example.com'], 'rep@piccplatform.com')).toBeNull();
   expect(parseConversation(raw, ['buyer@example.co'], 'rep@piccplatform.com')).toBeNull();
 });
 it('renders chronological text messages, Cc, sent aliases and mailbox-specific links', () => {
   const thread = parseConversation(raw, ['buyer@example.com'], 'rep@piccplatform.com')!;
   expect(thread.messages[0].text).toBe('Hello\nCan we reorder?');
   expect(thread.messages[0].cc).toContain('second@example.com');
   expect(thread.messages[1].direction).toBe('sent');
   expect(thread.messages[1].text).toContain('Yes & thanks');
   expect(thread.messages[1].text).not.toMatch(/evil|hidden|<p>/);
   expect(thread.externalUrl).toContain('rep%40piccplatform.com');
 });
 it('deduplicates query addresses, includes Cc and rejects Gmail search injection', () => {
   expect(conversationQuery(['Buyer@example.com', 'buyer@example.com'], 'all')).toBe('{from:buyer@example.com to:buyer@example.com cc:buyer@example.com}');
   expect(conversationQuery(['x@example.com} OR in:anywhere'], '2y')).toBeNull();
   expect(conversationQuery([], '2y')).toBeNull();
 });
 it('bounds message text and ignores attachment bodies', () => {
   const thread = parseConversation({ id:'t', messages:[{ ...raw.messages[0], payload:{headers:raw.messages[0].payload.headers,mimeType:'multipart/mixed',parts:[{mimeType:'text/plain',filename:'private.txt',body:{data:Buffer.from('attachment secret').toString('base64url')}},{mimeType:'text/plain',body:{data:Buffer.from('x'.repeat(25000)).toString('base64url')}}]}}]}, ['buyer@example.com'],'rep@piccplatform.com')!;
   expect(thread.messages[0].text.length).toBeLessThanOrEqual(20001);
   expect(thread.messages[0].truncated).toBe(true);
   expect(thread.messages[0].text).not.toContain('attachment secret');
 });
 it('filters internal colleagues and automated senders but keeps human external contacts', () => {
   for (const email of ['team@piccplatform.com','noreply@vendor.com','newsletter@vendor.com','posts-recaps@mail.instagram.com']) expect(suggestionIsRelevant(email,'rep@piccplatform.com')).toBe(false);
   expect(suggestionIsRelevant('buyer@store.com','rep@piccplatform.com')).toBe(true);
 });
});
