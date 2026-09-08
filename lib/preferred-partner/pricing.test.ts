import { describe, expect, it } from 'vitest';
import { matchPreferredPartnerPrice } from './pricing';
import { calculatePreferredPartnerOrdersFromRows } from '@/lib/server/preferred-partner-savings';

describe('updated partner catalog', () => {
  it.each([
    ['SMACK. | Infused Pre-roll | .5G SINGLE | OG Punch', 4.5, 3.6],
    ['SMACK. | Infused Pre-roll | 1G SINGLE | Banana Runtz', 6.75, 5.4],
    ['CHOPSTICKS | Uninfused Pre-roll | .5G 2-PACK (1G) | Blueberry', 5.5, 4.4],
  ])('uses approved rates for %s in SKU matching and savings', (skuName, standardWholesale, preferredWholesale) => {
    expect(matchPreferredPartnerPrice({ skuName })).toMatchObject({ standardWholesale, preferredWholesale });
    const [order] = calculatePreferredPartnerOrdersFromRows([{
      order: 'catalog-regression', createdTimestamp: '2026-09-08T12:00:00Z',
      skuName, units: 10, pricePerUnit: standardWholesale,
      taxInclusiveLineItemSubtotal: standardWholesale * 10,
      orderTotal: standardWholesale * 10,
    }]);
    expect(order.preferredTotal).toBe(preferredWholesale * 10);
    expect(order.savings).toBe(Math.round((standardWholesale - preferredWholesale) * 1000) / 100);
  });
});
