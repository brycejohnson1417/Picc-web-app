import { describe, expect, it } from 'vitest';
import { buildNabisExceptionPreview, selectMostRecentOrder } from '@/lib/server/nabis-exceptions';

describe('Nabis exception workflow domain', () => {
  it('selects the most recent order with a usable order date', () => {
    const selected = selectMostRecentOrder([
      {
        id: 'older',
        orderNumber: 'NY900100',
        orderCreatedDate: '2026-04-20T14:00:00.000Z',
      },
      {
        id: 'newest',
        orderNumber: 'NY900300',
        orderCreatedDate: '2026-05-02T16:30:00.000Z',
      },
      {
        id: 'undated',
        orderNumber: 'NY900999',
        orderCreatedDate: null,
      },
    ]);

    expect(selected?.id).toBe('newest');
  });

  it('builds a Microbar sample-addition and order-correction preview from cached order context', () => {
    const preview = buildNabisExceptionPreview({
      retailer: {
        accountName: 'Microbar - Utica',
        licensedLocationId: 'OCM-AUCC-24-000115',
        licenseNumber: 'OCM-AUCC-24-000115',
        nabisRetailerId: 'retailer-115',
      },
      order: {
        id: 'order-1',
        orderNumber: 'NY924483',
        externalOrderId: 'nabis-order-924483',
        orderCreatedDate: '2026-05-08T15:30:00.000Z',
        status: 'SUBMITTED',
        salesRep: 'Bryce Johnson',
        poSoNumber: 'SO-1882',
        lines: [
          {
            productName: 'ICHI-ROLL | 1G SINGLE | Time Warp',
            quantity: 10,
            isSample: false,
          },
        ],
      },
      sampleLines: [
        {
          sku: 'MICRO-SAMPLE-IR-TW',
          productName: 'ICHI-ROLL Time Warp sample',
          quantity: 2,
          reason: 'Microbar opening sample kit',
          notes: 'Add as samples to the existing order.',
        },
      ],
      discrepancyNotes: ['Correct delivery note: add Microbar sample bag to the shipment.'],
      requestedBy: 'demo@piccplatform.com',
    });

    expect(preview.subject).toBe('Nabis exception request for Microbar - Utica order NY924483');
    expect(preview.summary.requestType).toBe('sample_addition_and_order_correction');
    expect(preview.payload.sampleLines).toHaveLength(1);
    expect(preview.payload.selectedOrder.orderNumber).toBe('NY924483');
    expect(preview.message).toContain('Retailer: Microbar - Utica');
    expect(preview.message).toContain('License: OCM-AUCC-24-000115');
    expect(preview.message).toContain('Order: NY924483');
    expect(preview.message).toContain('Sample additions:');
    expect(preview.message).toContain('MICRO-SAMPLE-IR-TW');
    expect(preview.message).toContain('Discrepancy / correction notes:');
    expect(preview.message).toContain('Correct delivery note');
  });
});
