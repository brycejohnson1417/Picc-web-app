import { describe, expect, it } from 'vitest';
import { matchPreferredPartnerPrice, preferredPartnerPriceKey } from '@/lib/preferred-partner/pricing';
import { calculatePreferredPartnerProposalDraft, type PreferredPartnerProposalInputRow } from '@/lib/server/preferred-partner-proposal';

function buildRow(input: {
  productName: string;
  totalQuantityOnHand?: number;
  totalUnitsSold?: number;
  avgUnitsPerDay?: number | null;
  minimumSuggestedOrder?: number | null;
}) {
  const price = matchPreferredPartnerPrice({ productName: input.productName });
  if (!price) {
    throw new Error(`No PPP price match for ${input.productName}`);
  }

  return {
    sourceIndex: 0,
    storeName: 'Culture House',
    productName: input.productName,
    totalQuantityOnHand: input.totalQuantityOnHand ?? 0,
    totalUnitsSold: input.totalUnitsSold ?? 0,
    avgUnitsPerDay: input.avgUnitsPerDay ?? null,
    inStockAvgSalesPerDay: null,
    totalSales: null,
    estDaysRemaining: null,
    minimumSuggestedOrder: input.minimumSuggestedOrder ?? null,
    lastSale: null,
    lastQtyIncreaseDate: null,
    percentDaysInStock: null,
    potentialLostProfit: 0,
    price,
    priceKey: preferredPartnerPriceKey(price),
  } satisfies PreferredPartnerProposalInputRow;
}

describe('calculatePreferredPartnerProposalDraft', () => {
  it('builds demand-backed and strategic PPP lines from Headset rows plus live Nabis inventory', () => {
    const rows: PreferredPartnerProposalInputRow[] = [
      buildRow({
        productName: 'Picc | Smack | Hard Lemon Haze | Infused Preroll | 0.5g',
        avgUnitsPerDay: 4,
        totalUnitsSold: 100,
        totalQuantityOnHand: 0,
        minimumSuggestedOrder: 168,
      }),
      buildRow({
        productName: 'Picc | Sushi Hash Hole | Grape Gas X Runtz Rosin | Infused | P. Roll 1g',
        totalQuantityOnHand: 10,
      }),
      buildRow({
        productName: 'Picc | Sushi Hash Hole | Jealousy X Hash Burger Rosin | Infused | P. Roll 1g',
        totalQuantityOnHand: 13,
      }),
    ];

    const draft = calculatePreferredPartnerProposalDraft({
      rows,
      inventoryRows: [
        {
          skuCode: 'S-5g-HLH-26351',
          skuName: 'SMACK. | Infused Pre-roll | .5G SINGLE | Hard Lemon Haze (S)',
          skuInventoryType: 'CANNABIS',
          skuInventoryClass: 'PRE_ROLL',
          skuInventoryCategory: 'SINGLE',
          skuCasePackSize: 10,
          skuPricePerUnit: '3.40',
          warehouseCounts: [{ warehouseId: 'warehouse-a', available: 220, updatedAt: '2026-04-22T10:00:00.000Z' }],
        },
        {
          skuCode: 'SH-1g-GxR-02925',
          skuName: 'SUSHI HASH | HASH HOLE | 1G SINGLE | Grape Gas X Runtz Rosin (I)',
          skuInventoryType: 'CANNABIS',
          skuInventoryClass: 'PRE_ROLL',
          skuInventoryCategory: 'SINGLE',
          skuCasePackSize: 10,
          skuPricePerUnit: '11.25',
          warehouseCounts: [{ warehouseId: 'warehouse-b', available: 24, updatedAt: '2026-04-22T10:00:00.000Z' }],
        },
      ],
    });

    expect(draft.lines).toHaveLength(2);
    expect(draft.lines.find((line) => line.sourceKind === 'strategic-add')).toMatchObject({
      sourceKind: 'strategic-add',
      quantity: 20,
      unitPrice: 11.25,
    });
    expect(draft.lines.find((line) => line.sourceKind === 'demand')).toMatchObject({
      sourceKind: 'demand',
      quantity: 170,
      unitPrice: 3.4,
    });
    expect(draft.breakdownRows).toHaveLength(2);
    expect(draft.summary.currentPromoTotal).toBe(803);
    expect(draft.summary.creditMemo).toBe(25);
    expect(draft.summary.totalBalanceDue).toBe(778);
    expect(draft.inputSummary.unmatchedRowCount).toBe(0);
  });
});
