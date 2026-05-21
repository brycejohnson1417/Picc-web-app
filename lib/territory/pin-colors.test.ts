import { describe, expect, it } from 'vitest';
import { followUpPinPresentation, pinColorForStore, pinGlyphForStore } from '@/lib/territory/pin-colors';
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
    lastEditedTime: '2026-05-21T15:00:00.000Z',
    referralSource: null,
    isPreferredPartner: false,
    followUpDate: null,
    ...overrides,
  };
}

describe('territory pin colors', () => {
  const referenceDate = new Date('2026-05-21T16:00:00.000Z');

  it('colors no follow-up date dark blue with a blank label', () => {
    const store = buildStore({ followUpDate: null });

    expect(followUpPinPresentation(store, referenceDate)).toEqual({
      color: '#0616b7',
      daysUntil: null,
      glyph: '',
    });
    expect(pinColorForStore(store, 'follow-up-date', undefined, referenceDate)).toBe('#0616b7');
    expect(pinGlyphForStore(store, 'follow-up-date', referenceDate)).toBe('');
  });

  it('colors due-today follow-ups green with 0 inside the pin', () => {
    const store = buildStore({ followUpDate: '2026-05-21T00:00:00.000Z' });

    expect(followUpPinPresentation(store, referenceDate)).toEqual({
      color: '#00e63a',
      daysUntil: 0,
      glyph: '0',
    });
  });

  it('colors upcoming follow-ups light blue with positive labels', () => {
    const store = buildStore({ followUpDate: '2026-05-24' });

    expect(followUpPinPresentation(store, referenceDate)).toEqual({
      color: '#a7dcff',
      daysUntil: 3,
      glyph: '3',
    });
  });

  it('colors overdue follow-ups orange to red with negative labels', () => {
    const mildlyOverdue = buildStore({ followUpDate: '2026-05-19' });
    const severelyOverdue = buildStore({ followUpDate: '2026-05-06' });

    expect(followUpPinPresentation(mildlyOverdue, referenceDate)).toEqual({
      color: '#ff7a00',
      daysUntil: -2,
      glyph: '-2',
    });
    expect(followUpPinPresentation(severelyOverdue, referenceDate)).toEqual({
      color: '#d00000',
      daysUntil: -15,
      glyph: '-15',
    });
  });

  it('suppresses the preferred partner P glyph in follow-up date mode but keeps it in status mode', () => {
    const store = buildStore({ isPreferredPartner: true, followUpDate: '2026-05-21' });

    expect(pinGlyphForStore(store, 'status', referenceDate)).toBe('P');
    expect(pinGlyphForStore(store, 'follow-up-date', referenceDate)).toBe('0');
  });
});
