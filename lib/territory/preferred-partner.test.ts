import { describe, expect, it } from 'vitest';
import { pinColorForStore } from '@/lib/territory/pin-colors';
import { isPreferredPartnerFromStatuses } from '@/lib/territory/preferred-partner';
import type { TerritoryStorePin } from '@/lib/territory/types';

function buildStore(overrides: Partial<TerritoryStorePin> = {}): TerritoryStorePin {
  return {
    id: 'store-1',
    notionPageId: 'page-1',
    name: 'Demo Store',
    status: 'Customer',
    statusKey: 'customer',
    statusColor: '#16a34a',
    statusColorName: 'green',
    pinKind: 'customer',
    repNames: ['Donovan Snyder'],
    repEmails: ['donovan@example.com'],
    lat: 40.1,
    lng: -73.9,
    locationLabel: 'Demo',
    locationAddress: '123 Main St',
    locationSource: 'notion-place',
    locationPrecision: 'exact',
    isApproximate: false,
    lastEditedTime: new Date().toISOString(),
    referralSource: null,
    pppStatus: 'Approved & Connected',
    pppStatusColorName: 'green',
    headsetConnectionStatus: 'Connected to PICC Headset',
    headsetConnectionStatusColorName: 'blue',
    isPreferredPartner: true,
    ...overrides,
  };
}

describe('preferred partner territory rule', () => {
  it('only marks accounts preferred when both CRM statuses match', () => {
    expect(isPreferredPartnerFromStatuses('Approved & Connected', 'Connected to PICC Headset')).toBe(true);
    expect(isPreferredPartnerFromStatuses('Approved & Connected', 'On Headset - Not Connected to PICC')).toBe(false);
    expect(isPreferredPartnerFromStatuses('Onboarding Pending', 'Connected to PICC Headset')).toBe(false);
  });

  it('keeps the original pin color in status mode for preferred partners', () => {
    const store = buildStore();
    expect(pinColorForStore(store, 'status')).toBe('#16a34a');
  });
});
