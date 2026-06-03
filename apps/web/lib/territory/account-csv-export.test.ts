import { describe, expect, it } from 'vitest';
import { buildAccountCsv, getDefaultAccountCsvColumnKeys } from '@/lib/territory/account-csv-export';
import type { TerritoryStorePin } from '@/lib/territory/types';

const baseStore: TerritoryStorePin = {
  id: 'store-1',
  notionPageId: 'notion-1',
  name: 'Astoria & Co',
  status: 'Customer',
  statusKey: 'customer',
  statusColor: '#16a34a',
  pinKind: 'customer',
  repNames: ['Ben', 'Roxy'],
  repEmails: ['ben@piccplatform.com', 'roxy@piccplatform.com'],
  lat: 40.7643,
  lng: -73.9235,
  locationLabel: 'Astoria, NY',
  locationAddress: '31-01 Ditmars Blvd, Astoria, NY',
  locationSource: 'google-address-cache',
  locationPrecision: 'exact',
  isApproximate: false,
  lastEditedTime: '2026-05-01T12:00:00.000Z',
  licenseNumber: 'OCM-CAURD-123',
  city: 'Astoria',
  state: 'NY',
  daysOverdue: 4,
  phoneNumber: '555-0100',
  email: 'ops@example.com',
  vendorDayStatus: 'Requested',
  lastSampleOrderDate: '2026-04-14',
  lastSampleDeliveryDate: '2026-04-16',
  lastOrderDate: '2026-04-30',
  referralSource: 'Referral, buyer',
  pppStatus: 'Approved & Connected',
  headsetConnectionStatus: 'Connected to PICC Headset',
  isPreferredPartner: true,
  followUpDate: '2026-05-10',
  followUpNeeded: true,
  followUpReason: 'Needs "display" reset',
  notes: 'First line\nSecond line',
  lastCheckIn: '2026-05-02',
};

describe('account CSV export', () => {
  it('builds selected account columns in the requested order with CSV escaping', () => {
    const csv = buildAccountCsv({
      stores: [baseStore],
      columnKeys: ['name', 'repNames', 'referralSource', 'notes', 'lat', 'lng'],
    });

    expect(csv).toBe(
      [
        'Account Name,Reps,Referral Source,Notes,Latitude,Longitude',
        '"Astoria & Co","Ben; Roxy","Referral, buyer","First line\nSecond line",40.7643,-73.9235',
      ].join('\n'),
    );
  });

  it('omits unselected columns and exposes sensible defaults', () => {
    const defaults = getDefaultAccountCsvColumnKeys();

    expect(defaults).toContain('name');
    expect(defaults).toContain('status');
    expect(defaults).toContain('repNames');
    expect(defaults).not.toContain('notionPageId');

    const csv = buildAccountCsv({
      stores: [baseStore],
      columnKeys: ['name', 'status'],
    });

    expect(csv).toBe(['Account Name,Status', '"Astoria & Co","Customer"'].join('\n'));
    expect(csv).not.toContain('OCM-CAURD-123');
    expect(csv).not.toContain('notion-1');
  });
});
