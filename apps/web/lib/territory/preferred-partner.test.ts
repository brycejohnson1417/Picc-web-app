import { describe, expect, it } from 'vitest';
import { pinColorForStore } from '@/lib/territory/pin-colors';
import { isPreferredPartnerFromStatuses, preferredPartnerRepBreakdown } from '@/lib/territory/preferred-partner';
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

  it('aggregates preferred partners by rep and includes unassigned rows', () => {
    const breakdown = preferredPartnerRepBreakdown([
      buildStore({ id: 'store-1', repNames: ['Donovan Snyder'] }),
      buildStore({ id: 'store-2', repNames: ['Donovan Snyder', 'Eric Acosta'] }),
      buildStore({ id: 'store-3', repNames: [], repEmails: [] }),
      buildStore({
        id: 'store-4',
        isPreferredPartner: false,
        pppStatus: 'Onboarding Pending',
        headsetConnectionStatus: 'On Headset - Not Connected to PICC',
      }),
    ]);

    expect(breakdown.totalPreferredPartners).toBe(3);
    expect(breakdown.reps).toEqual([
      { name: 'Donovan Snyder', count: 2 },
      { name: 'Eric Acosta', count: 1 },
      { name: 'Unassigned', count: 1 },
    ]);
  });
});
