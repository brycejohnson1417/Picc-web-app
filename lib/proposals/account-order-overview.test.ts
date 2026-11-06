import { describe, expect, it } from 'vitest';
import { isStandaloneFieldReference, latestRecordedOrder } from './account-order-overview';

const delivered = { id: 'historical', orderNumber: 'A-12', source: 'Archive', createdDate: '2026-05-01', status: 'DELIVERED', total: 140 };
const processing = { id: 'current', orderNumber: 'B-14', source: 'Distributor', createdDate: '2026-06-01', status: 'PROCESSING', total: 185 };

describe('latest recorded order', () => {
  it('selects by recorded order date and preserves the source state of an open order', () => {
    expect(latestRecordedOrder([delivered, processing])).toEqual(processing);
    expect(latestRecordedOrder([processing, delivered])).toEqual(processing);
  });

  it('preserves an actual delivered state and does not infer it from a delivery date', () => {
    expect(latestRecordedOrder([delivered])?.status).toBe('DELIVERED');
    expect(latestRecordedOrder([{ ...processing, status: 'UNKNOWN' }])?.status).toBe('UNKNOWN');
  });

  it('does not claim a latest order without a dated record', () => {
    expect(latestRecordedOrder([])).toBeNull();
    expect(latestRecordedOrder([{ ...processing, createdDate: null }])).toBeNull();
  });
});

describe('standalone field references', () => {
  it('recognizes a relative self-reference to the source delivery-date field', () => {
    expect(isStandaloneFieldReference(' [Last Delivery Date](Last%20Delivery%20Date) ')).toBe(true);
  });

  it.each([
    'Confirm next delivery with the buyer',
    '[Last Delivery Date](https://example.org/delivery)',
    '[Last Delivery Date](/accounts/deliveries)',
    'Check [Last Delivery Date](Last%20Delivery%20Date) with the buyer',
    '[Packing list.pdf](Packing%20list.pdf)',
    '[Last Delivery Date](%zz)',
    '', null,
  ])('preserves other source text: %s', value => {
    expect(isStandaloneFieldReference(value)).toBe(false);
  });
});
