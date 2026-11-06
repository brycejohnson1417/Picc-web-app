import { describe, expect, it } from 'vitest';
import { getContactEmailDeliveryStatus } from './email-delivery-status';

describe('contact email delivery status', () => {
  it('blocks explicit email opt-outs and undeliverable addresses', () => {
    expect(getContactEmailDeliveryStatus({ emailPermission: 'Do not contact' }).blocked).toBe(true);
    for (const emailQuality of ['Permanent bounce', 'Existing suppression', 'Malformed or combined']) {
      expect(getContactEmailDeliveryStatus({ emailQuality }).blocked).toBe(true);
    }
  });

  it('preserves marketing and review flags without treating them as a blanket business-contact ban', () => {
    expect(getContactEmailDeliveryStatus({ marketingSuppressed: true })).toEqual({ blocked: false, labels: ['Marketing suppressed'] });
    expect(getContactEmailDeliveryStatus({ emailPermission: 'Needs review', emailQuality: 'Format checked only' })).toEqual({ blocked: false, labels: ['Needs review', 'Format checked only'] });
    expect(getContactEmailDeliveryStatus({})).toEqual({ blocked: false, labels: [] });
  });
});
