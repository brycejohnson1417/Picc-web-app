import { describe, expect, it } from 'vitest';
import { parseNabisOrderLineForCache } from '@/lib/server/nabis-sync';

describe('Nabis sync line cache parsing', () => {
  it('extracts order line detail needed for local PPP savings calculations', () => {
    const line = parseNabisOrderLineForCache({
      id: 'order-id-1',
      order: '9000',
      skuName: 'Ichi-Roll Single 1g',
      units: '10',
      lineItemSubtotalAfterDiscount: '50.00',
      skuPricePerUnit: '7.00',
      lineItemIsSample: false,
      itemStrain: 'Time Warp',
      itemCategory: 'Pre-roll',
      itemClass: 'Cannabis',
    });

    expect(line).toEqual({
      externalOrderId: 'order-id-1',
      productName: 'Ichi-Roll Single 1g',
      quantity: 10,
      unitPrice: 5,
      isSample: false,
      itemStrain: 'Time Warp',
      itemCategory: 'Pre-roll',
      itemClass: 'Cannabis',
    });
  });
});
