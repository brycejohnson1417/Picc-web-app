import { afterEach, describe, expect, it } from 'vitest';
import {
  decodeOAuthState,
  encodeOAuthState,
  extractMailboxPeople,
  normalizeMailboxEmail,
  parseGmailMessage,
  protectToken,
  revealToken,
} from '@/lib/gmail/gmail-domain';

const previousStateSecret = process.env.GMAIL_OAUTH_STATE_SECRET;
const previousEncryptionKey = process.env.GMAIL_TOKEN_ENCRYPTION_KEY;

afterEach(() => {
  process.env.GMAIL_OAUTH_STATE_SECRET = previousStateSecret;
  process.env.GMAIL_TOKEN_ENCRYPTION_KEY = previousEncryptionKey;
});

describe('Gmail domain safety', () => {
  it('signs OAuth state and rejects tampering', () => {
    process.env.GMAIL_OAUTH_STATE_SECRET = 'state-secret-for-tests';
    const state = encodeOAuthState({ orgId: 'org-1', userId: 'user-1', nonce: 'nonce-1', returnTo: '/settings' });

    expect(decodeOAuthState(state)).toMatchObject({ orgId: 'org-1', userId: 'user-1', nonce: 'nonce-1' });
    const [payload, signature] = state.split('.');
    const changedSignature = `${signature[0] === 'A' ? 'B' : 'A'}${signature.slice(1)}`;
    expect(() => decodeOAuthState(`${payload}.${changedSignature}`)).toThrow('Invalid Gmail OAuth state');
  });

  it('encrypts provider tokens with authenticated encryption', () => {
    process.env.GMAIL_TOKEN_ENCRYPTION_KEY = 'test-encryption-key-that-is-long-enough';
    const encrypted = protectToken('refresh-token-value');

    expect(encrypted).not.toContain('refresh-token-value');
    expect(revealToken(encrypted)).toBe('refresh-token-value');
    expect(() => revealToken(`${encrypted.slice(0, -2)}aa`)).toThrow();
  });

  it('normalizes mailbox addresses and extracts distinct external people', () => {
    expect(normalizeMailboxEmail('Mara Vega <MARA@Example.com>')).toBe('mara@example.com');
    expect(extractMailboxPeople([
      { from: 'Bryce <rep@picc.co>', to: 'Mara Vega <mara@example.com>, Other <other@example.com>', occurredAt: '2026-08-14T10:00:00.000Z' },
      { from: 'Mara <MARA@example.com>', to: 'rep@picc.co', occurredAt: '2026-08-15T10:00:00.000Z' },
    ], 'rep@picc.co')).toEqual([
      expect.objectContaining({ email: 'mara@example.com', name: 'Mara Vega', messageCount: 2, lastInteractionAt: '2026-08-15T10:00:00.000Z' }),
      expect.objectContaining({ email: 'other@example.com', name: 'Other', messageCount: 1 }),
    ]);
  });

  it('parses Gmail metadata and creates a provider thread link', () => {
    const parsed = parseGmailMessage({
      id: 'message-1',
      threadId: 'thread-1',
      snippet: 'Sample follow-up',
      internalDate: '1786701600000',
      payload: { headers: [
        { name: 'From', value: 'Mara <mara@example.com>' },
        { name: 'To', value: 'Bryce <rep@picc.co>' },
        { name: 'Subject', value: 'Placement review' },
      ] },
    });

    expect(parsed).toMatchObject({
      id: 'message-1',
      threadId: 'thread-1',
      from: 'Mara <mara@example.com>',
      subject: 'Placement review',
      externalUrl: 'https://mail.google.com/mail/u/0/#all/thread-1',
    });
  });
});
