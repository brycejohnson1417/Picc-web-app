import { describe, expect, it } from 'vitest';
import { matchPreferredPartnerPrice, PREFERRED_PARTNER_PRICING } from '@/lib/preferred-partner/pricing';
import { calculatePreferredPartnerOrdersFromRows } from '@/lib/server/preferred-partner-savings';

function buildSkuName(price: (typeof PREFERRED_PARTNER_PRICING)[number]) {
  return `${price.brand} ${price.size} ${price.weight}`;
}

function roundCents(value: number) {
  return Math.round(value * 100) / 100;
}

function seededRandom(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

const random = seededRandom(20260422);
const randomInvoiceCases = Array.from({ length: 10 }, (_, index) => {
  const price = PREFERRED_PARTNER_PRICING[Math.floor(random() * PREFERRED_PARTNER_PRICING.length)];
  const quantity = 1 + Math.floor(random() * 24);
  const priceAdjustment = [-0.5, 0, 0.25, 0.75, 1.25][Math.floor(random() * 5)];
  const paidUnitPrice = Math.max(0.01, roundCents(price.standardWholesale + priceAdjustment));
  const currentPromoTotal = roundCents(paidUnitPrice * quantity);
  const orderTaxAmount = roundCents(currentPromoTotal * (0.08 + random() * 0.05));
  const orderTotal = roundCents(currentPromoTotal + orderTaxAmount);
  const creditMemo = roundCents(random() * 75);
  const surcharge = roundCents(20 + random() * 60);
  const expectedSavings = roundCents(Math.max(0, (paidUnitPrice - price.preferredWholesale) * quantity));
  const expectedPreferred = roundCents(price.preferredWholesale * quantity);
  const expectedStandard = roundCents(price.standardWholesale * quantity);

  return {
    label: `random invoice ${index + 1}: ${price.brand} ${price.size} x${quantity}`,
    skuName: buildSkuName(price),
    quantity,
    paidUnitPrice,
    orderTotal,
    orderTaxAmount,
    creditMemo,
    surcharge,
    expectedPaid: orderTotal,
    expectedCurrentPromo: currentPromoTotal,
    expectedStandard,
    expectedSavings,
    expectedPreferred,
    expectedStandardDiscount: roundCents(expectedStandard - expectedPreferred),
  };
});

describe('Preferred Partner savings math', () => {
  it('prioritizes pack-size labels over 1G weight text in Nabis SKU names', () => {
    expect(
      matchPreferredPartnerPrice({
        skuName: 'ICHI-ROLL| Uninfused Pre-roll | 1G 4-PACK (4G) | Afterglow Haze (S)',
      }),
    ).toMatchObject({ brand: 'Ichi-Roll', size: '4-Pack', preferredWholesale: 12.8 });

    expect(
      matchPreferredPartnerPrice({
        skuName: '#JUAN-ROLL | Uninfused Pre-roll | 1G SINGLE | Blue Dream',
      }),
    ).toMatchObject({ brand: '#Juan-Roll', size: 'Single', preferredWholesale: 4 });

    expect(
      matchPreferredPartnerPrice({
        skuName: 'SMACK. | Infused Pre-roll | 1G SINGLE | Banana Runtz',
      }),
    ).toMatchObject({ brand: 'Smack.', size: 'Single', preferredWholesale: 5 });

    expect(
      matchPreferredPartnerPrice({
        skuName: 'O-YEAH | Infused Pre-roll | 5-PACK (2.5G) | Mango',
      }),
    ).toMatchObject({ brand: 'O-Yeah', size: '5-Pack', preferredWholesale: 14 });
  });

  it('maps malformed Chopsticks naming back to the 2-pack PPP family', () => {
    expect(
      matchPreferredPartnerPrice({
        skuName: 'CHOPSTIX | Infused Pre-roll | .5G SINGLE | OG Kush (S)',
      }),
    ).toMatchObject({ brand: 'Chopsticks', size: '2 (.5g)', preferredWholesale: 4 });

    expect(
      matchPreferredPartnerPrice({
        skuName: 'CHOPSTICKS | Infused Pre-roll | .5G SINGLE | OG Kush (S)',
      }),
    ).toMatchObject({ brand: 'Chopsticks', size: '2 (.5g)', preferredWholesale: 4 });
  });

  it('uses tax-inclusive order total, ignores credit memos, and excludes surcharge', () => {
    const [order] = calculatePreferredPartnerOrdersFromRows([
      {
        order: '9001',
        createdTimestamp: '2026-04-15T12:00:00.000Z',
        orderTotal: 56.5,
        orderTaxAmount: 6.5,
        creditMemo: 25,
        surcharge: 99,
        skuName: 'Ichi-Roll Single 1g',
        units: 10,
        pricePerUnit: 5,
        lineItemSubtotal: 50,
        sample: false,
      },
    ]);

    expect(order.paidTotal).toBe(56.5);
    expect(order.currentPromoTotal).toBe(50);
    expect(order.standardWholesaleTotal).toBe(50);
    expect(order.savings).toBe(10);
    expect(order.preferredTotal).toBe(40);
    expect(order.standardWholesaleDiscount).toBe(10);
  });

  it('falls through null Nabis after-discount fields to the populated line totals', () => {
    const [order] = calculatePreferredPartnerOrdersFromRows([
      {
        order: '923541',
        createdTimestamp: '2026-04-21T20:20:28.373Z',
        orderTotal: '144.00',
        orderTaxAmount: '11.90',
        skuName: 'ICHI-ROLL| Uninfused Pre-roll | 1G 4-PACK (4G) | Afterglow Haze (S)',
        units: 10,
        lineItemPricePerUnitAfterDiscount: null,
        pricePerUnit: '13.21',
        skuPricePerUnit: '14.40',
        taxInclusiveLineItemSubtotal: '144.00',
        lineItemSubtotalAfterDiscount: null,
        lineItemSubtotal: '132.10',
        sample: false,
        lineItemIsSample: false,
      },
    ]);

    expect(order.paidTotal).toBe(144);
    expect(order.currentPromoTotal).toBe(144);
    expect(order.standardWholesaleTotal).toBe(160);
    expect(order.savings).toBeCloseTo(16, 2);
    expect(order.preferredTotal).toBeCloseTo(128, 2);
    expect(order.standardWholesaleDiscount).toBeCloseTo(32, 2);
    expect(order.matchedLineCount).toBe(1);
  });

  it('keeps invoice savings separate per order', () => {
    const orders = calculatePreferredPartnerOrdersFromRows([
      {
        order: '9001',
        createdTimestamp: '2026-04-15T12:00:00.000Z',
        orderTotal: 50,
        orderTaxAmount: 0,
        skuName: 'Ichi-Roll Single 1g',
        units: 10,
        pricePerUnit: 5,
        lineItemSubtotal: 50,
      },
      {
        order: '9002',
        createdTimestamp: '2026-04-16T12:00:00.000Z',
        orderTotal: 175,
        orderTaxAmount: 0,
        skuName: 'O-Yeah 5-Pack 2.5g',
        units: 10,
        pricePerUnit: 17.5,
        lineItemSubtotal: 175,
      },
    ]);

    expect(orders).toHaveLength(2);
    expect(orders.map((order) => order.orderNumber)).toEqual(['9001', '9002']);
    expect(orders.map((order) => order.savings)).toEqual([10, 35]);
    expect(orders.map((order) => order.preferredTotal)).toEqual([40, 140]);
  });

  it('reflects different historical Nabis promo prices per invoice date', () => {
    const orders = calculatePreferredPartnerOrdersFromRows([
      {
        order: '2025-promo',
        createdTimestamp: '2025-08-15T12:00:00.000Z',
        orderTotal: 45,
        orderTaxAmount: 0,
        skuName: 'Ichi-Roll Single 1g',
        units: 10,
        pricePerUnit: 4.5,
        lineItemSubtotal: 45,
      },
      {
        order: '2026-promo',
        createdTimestamp: '2026-04-15T12:00:00.000Z',
        orderTotal: 50,
        orderTaxAmount: 0,
        skuName: 'Ichi-Roll Single 1g',
        units: 10,
        pricePerUnit: 5,
        lineItemSubtotal: 50,
      },
    ]);

    expect(orders.map((order) => order.orderNumber)).toEqual(['2025-promo', '2026-promo']);
    expect(orders.map((order) => order.currentPromoTotal)).toEqual([45, 50]);
    expect(orders.map((order) => order.savings)).toEqual([5, 10]);
    expect(orders.map((order) => order.preferredTotal)).toEqual([40, 40]);
  });

  it('falls back to tax-inclusive line totals when order total is unavailable', () => {
    const [order] = calculatePreferredPartnerOrdersFromRows([
      {
        order: '9003',
        createdTimestamp: '2026-04-17T12:00:00.000Z',
        creditMemo: 20,
        surcharge: 50,
        skuName: 'Smack. Mini 0.5g',
        units: 10,
        pricePerUnit: 4.25,
        lineItemSubtotal: 42.5,
        taxInclusiveLineItemSubtotal: 47.5,
      },
    ]);

    expect(order.paidTotal).toBe(47.5);
    expect(order.currentPromoTotal).toBe(47.5);
    expect(order.savings).toBe(13.5);
    expect(order.preferredTotal).toBe(34);
    expect(order.standardWholesaleDiscount).toBe(8.5);
  });

  it.each(randomInvoiceCases)('$label', (testCase) => {
    const [order] = calculatePreferredPartnerOrdersFromRows([
      {
        order: testCase.label,
        createdTimestamp: '2026-04-18T12:00:00.000Z',
        orderTotal: testCase.orderTotal,
        orderTaxAmount: testCase.orderTaxAmount,
        creditMemo: testCase.creditMemo,
        surcharge: testCase.surcharge,
        skuName: testCase.skuName,
        units: testCase.quantity,
        pricePerUnit: testCase.paidUnitPrice,
        lineItemSubtotal: testCase.expectedCurrentPromo,
      },
    ]);

    expect(order.paidTotal).toBeCloseTo(testCase.expectedPaid, 2);
    expect(order.currentPromoTotal).toBeCloseTo(testCase.expectedCurrentPromo, 2);
    expect(order.standardWholesaleTotal).toBeCloseTo(testCase.expectedStandard, 2);
    expect(order.savings).toBeCloseTo(testCase.expectedSavings, 2);
    expect(order.preferredTotal).toBeCloseTo(testCase.expectedPreferred, 2);
    expect(order.standardWholesaleDiscount).toBeCloseTo(testCase.expectedStandardDiscount, 2);
  });

  it('does not create customer savings when the invoice already has PPP-or-better pricing', () => {
    const price = PREFERRED_PARTNER_PRICING.find((row) => row.brand === 'O-Yeah' && row.size === 'Single');
    expect(price).toBeDefined();

    const [order] = calculatePreferredPartnerOrdersFromRows([
      {
        order: '9004',
        createdTimestamp: '2026-04-19T12:00:00.000Z',
        orderTotal: 39.6,
        orderTaxAmount: 3.6,
        skuName: buildSkuName(price!),
        units: 6,
        pricePerUnit: 6,
        lineItemSubtotal: 36,
      },
    ]);

    expect(order.paidTotal).toBe(39.6);
    expect(order.currentPromoTotal).toBe(36);
    expect(order.savings).toBe(0);
    expect(order.preferredTotal).toBe(36);
  });

  it('excludes sample lines from invoice savings', () => {
    const orders = calculatePreferredPartnerOrdersFromRows([
      {
        order: '9005',
        createdTimestamp: '2026-04-20T12:00:00.000Z',
        orderTotal: 0,
        orderTaxAmount: 0,
        skuName: 'Sushi Hash Single 1g',
        units: 5,
        pricePerUnit: 12.5,
        lineItemSubtotal: 62.5,
        sample: true,
      },
    ]);

    expect(orders).toEqual([]);
  });

  it('leaves unmatched SKUs in the paid invoice total without inventing PPP savings', () => {
    const [order] = calculatePreferredPartnerOrdersFromRows([
      {
        order: '9006',
        createdTimestamp: '2026-04-21T12:00:00.000Z',
        orderTotal: 165,
        orderTaxAmount: 15,
        skuName: 'Ichi-Roll Single 1g',
        units: 10,
        pricePerUnit: 5,
        lineItemSubtotal: 50,
      },
      {
        order: '9006',
        createdTimestamp: '2026-04-21T12:00:00.000Z',
        orderTotal: 165,
        orderTaxAmount: 15,
        skuName: 'Unknown SKU 10g',
        units: 1,
        pricePerUnit: 100,
        lineItemSubtotal: 100,
      },
    ]);

    expect(order.paidTotal).toBe(165);
    expect(order.currentPromoTotal).toBe(50);
    expect(order.savings).toBe(10);
    expect(order.preferredTotal).toBe(40);
    expect(order.matchedLineCount).toBe(1);
    expect(order.unmatchedLineCount).toBe(1);
  });

  it('keeps non-discountable display collateral in paid totals without warning as an unmatched SKU', () => {
    const [order] = calculatePreferredPartnerOrdersFromRows([
      {
        order: '9007',
        createdTimestamp: '2026-04-22T12:00:00.000Z',
        orderTotal: 50.01,
        orderTaxAmount: 0,
        skuName: 'Ichi-Roll Single 1g',
        units: 10,
        pricePerUnit: 5,
        lineItemSubtotal: 50,
      },
      {
        order: '9007',
        createdTimestamp: '2026-04-22T12:00:00.000Z',
        orderTotal: 50.01,
        orderTaxAmount: 0,
        skuName: 'Sushi Hash Store Display',
        units: 1,
        pricePerUnit: 0.01,
        lineItemSubtotal: 0.01,
      },
    ]);

    expect(order.paidTotal).toBe(50.01);
    expect(order.currentPromoTotal).toBe(50);
    expect(order.savings).toBe(10);
    expect(order.preferredTotal).toBe(40);
    expect(order.unmatchedLineCount).toBe(0);
  });

  it('matches the uploaded Blue Forest discount calculator reference totals', () => {
    const common = {
      order: '923541',
      createdTimestamp: '2026-04-21T20:20:28.373Z',
      orderTotal: 2265.52,
      orderTaxAmount: 187.06,
    };

    const [order] = calculatePreferredPartnerOrdersFromRows([
      {
        ...common,
        skuName: 'ICHI-ROLL | Uninfused Pre-roll | 1G SINGLE | Time Warp (S)',
        units: 20,
        skuPricePerUnit: 4.5,
        taxInclusiveLineItemSubtotal: 90,
        lineItemSubtotal: 82.6,
      },
      {
        ...common,
        skuName: 'ICHI-ROLL| Uninfused Pre-roll | 1G 4-PACK (4G) | Afterglow Haze (S)',
        units: 10,
        skuPricePerUnit: 14.4,
        taxInclusiveLineItemSubtotal: 144,
        lineItemSubtotal: 132.1,
      },
      {
        ...common,
        skuName: '#JUAN-ROLL | Uninfused Pre-roll | 1G SINGLE | Midnight Affair (S)',
        units: 40,
        skuPricePerUnit: 4.5,
        taxInclusiveLineItemSubtotal: 180,
        lineItemSubtotal: 165.2,
      },
      {
        ...common,
        skuName: '#JUAN-ROLL | Uninfused Pre-roll | 1G 4-PACK (4G) | Happy Purps (S)',
        units: 10,
        skuPricePerUnit: 14.4,
        taxInclusiveLineItemSubtotal: 144,
        lineItemSubtotal: 132.1,
      },
      {
        ...common,
        skuName: 'STATE OF MIND | Infused Pre-roll | 1G SINGLE | Melonberry Gelato',
        units: 40,
        skuPricePerUnit: 8,
        taxInclusiveLineItemSubtotal: 320,
        lineItemSubtotal: 293.6,
      },
      {
        ...common,
        skuName: 'STATE OF MIND | Live Resin Infused Pre-roll | .5G 5-PACK (2.5G) | MAC Berry',
        units: 30,
        skuPricePerUnit: 20,
        taxInclusiveLineItemSubtotal: 600,
        lineItemSubtotal: 550.5,
      },
      {
        ...common,
        skuName: 'SUSHI HASH | HASH HOLE | 1G SINGLE | Gold Rush',
        units: 70,
        skuPricePerUnit: 11.25,
        taxInclusiveLineItemSubtotal: 787.5,
        lineItemSubtotal: 722.4,
      },
      {
        ...common,
        skuName: 'Sushi Hash Store Display',
        units: 1,
        skuPricePerUnit: 0.01,
        taxInclusiveLineItemSubtotal: 0.01,
        lineItemSubtotal: 0.01,
      },
    ]);

    expect(order.paidTotal).toBe(2265.52);
    expect(order.currentPromoTotal).toBe(2265.5);
    expect(order.standardWholesaleTotal).toBe(2645);
    expect(order.preferredTotal).toBe(2116);
    expect(order.savings).toBe(149.5);
    expect(order.standardWholesaleDiscount).toBe(529);
    expect(order.unmatchedLineCount).toBe(0);
  });

  it('accepts a single-order response shape from the Nabis order detail endpoint', () => {
    const [order] = calculatePreferredPartnerOrdersFromRows([
      {
        id: 'order-uuid-1',
        createdTimestamp: '2026-04-22T12:00:00.000Z',
        orderTotal: 110,
        orderTaxAmount: 10,
        skuName: 'State of Mind Single 1g',
        units: 10,
        pricePerUnit: 10,
        lineItemSubtotal: 100,
      },
    ]);

    expect(order.orderNumber).toBe('order-uuid-1');
    expect(order.paidTotal).toBe(110);
    expect(order.currentPromoTotal).toBe(100);
    expect(order.savings).toBe(20);
    expect(order.preferredTotal).toBe(80);
  });
});
