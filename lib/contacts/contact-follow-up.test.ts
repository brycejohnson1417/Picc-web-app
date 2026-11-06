import { describe, expect, it } from 'vitest';
import { buildAccountFollowUpPayload, buildCommunicationFollowUpPayload } from '@/lib/contacts/contact-follow-up';

describe('buildCommunicationFollowUpPayload', () => {
  it('builds an honest account-scoped follow-up after a launched contact action', () => {
    expect(
      buildCommunicationFollowUpPayload({
        action: 'email',
        account: { id: 'account-page', name: 'Harbor House' },
        contact: {
          id: 'contact-page',
          name: 'Mara Vega',
          roleTitle: 'Buyer',
          email: 'mara@example.com',
          phone: '+13475550198',
        },
        followUpDate: '2026-08-18',
        reason: '',
      }),
    ).toEqual({
      followUpDate: '2026-08-18',
      followUpNeeded: true,
      followUpReason: 'Follow up after email with Mara Vega',
    });
  });

  it('uses the rep note when one is provided', () => {
    const payload = buildCommunicationFollowUpPayload({
      action: 'call',
      account: { id: 'account-page', name: 'Harbor House' },
      contact: { id: 'contact-page', name: 'Mara Vega', roleTitle: '', email: '', phone: '' },
      followUpDate: '2026-08-21',
      reason: 'Confirm fall menu placement',
    });

    expect(payload.followUpReason).toBe('Confirm fall menu placement');
    expect(payload).not.toHaveProperty('noteText');
    expect(payload).not.toHaveProperty('lastCheckIn');
  });
});

describe('buildAccountFollowUpPayload', () => {
  it('builds a new follow-up without fabricating a completed contact event', () => {
    expect(
      buildAccountFollowUpPayload({
        account: { id: 'store-id', notionPageId: 'account-page', name: 'Harbor House' },
        followUpDate: '2026-08-20',
        reason: 'Review the next order',
      }),
    ).toEqual({
      store: { id: 'store-id', notionPageId: 'account-page', name: 'Harbor House' },
      noteText: 'New follow-up scheduled: Review the next order',
      followUpDate: '2026-08-20',
      followUpNeeded: true,
      followUpReason: 'Review the next order',
    });
  });
});
