import { describe, expect, it } from 'vitest';
import { matchPreferredPartnerPrice, preferredPartnerPriceKey } from '@/lib/preferred-partner/pricing';
import { calculatePreferredPartnerProposalDraft, type PreferredPartnerProposalInputRow } from '@/lib/server/preferred-partner-proposal';

function buildRow(input: {
  storeName?: string;
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
    storeName: input.storeName ?? 'Culture House',
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

function buildInventoryRow(input: {
  skuCode: string;
  skuName: string;
  casePackSize?: number;
  pricePerUnit: number;
  availableUnits: number;
}) {
  return {
    skuCode: input.skuCode,
    skuName: input.skuName,
    skuInventoryType: 'CANNABIS',
    skuInventoryClass: 'PRE_ROLL',
    skuInventoryCategory: 'SINGLE',
    skuCasePackSize: input.casePackSize ?? 10,
    skuPricePerUnit: String(input.pricePerUnit),
    warehouseCounts: [{ warehouseId: `${input.skuCode}-warehouse`, available: input.availableUnits, updatedAt: '2026-04-22T10:00:00.000Z' }],
  };
}

function quantityByPriceKey(draft: ReturnType<typeof calculatePreferredPartnerProposalDraft>) {
  return Object.fromEntries(draft.breakdownRows.map((row) => [row.priceKey, row.quantity]));
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

  it('caps oversized family demand with recent order history and keeps allocations on whole cases', () => {
    const rows: PreferredPartnerProposalInputRow[] = [
      buildRow({
        productName: 'Juan Roll Golden Hour Pre Roll 1g',
        totalUnitsSold: 10,
        minimumSuggestedOrder: 140,
      }),
      buildRow({
        productName: 'Juan Roll Midnight Affair Pre Roll 1g',
        totalUnitsSold: 10,
        minimumSuggestedOrder: 210,
      }),
    ];

    const draft = calculatePreferredPartnerProposalDraft({
      rows,
      inventoryRows: [
        {
          skuCode: 'JR-GH-1G',
          skuName: '#JUAN-ROLL | 1G SINGLE | Golden Hour',
          skuInventoryType: 'CANNABIS',
          skuInventoryClass: 'PRE_ROLL',
          skuInventoryCategory: 'SINGLE',
          skuCasePackSize: 50,
          skuPricePerUnit: '4.50',
          warehouseCounts: [{ warehouseId: 'warehouse-a', available: 500, updatedAt: '2026-04-22T10:00:00.000Z' }],
        },
        {
          skuCode: 'JR-MA-1G',
          skuName: '#JUAN-ROLL | 1G SINGLE | Midnight Affair',
          skuInventoryType: 'CANNABIS',
          skuInventoryClass: 'PRE_ROLL',
          skuInventoryCategory: 'SINGLE',
          skuCasePackSize: 50,
          skuPricePerUnit: '4.50',
          warehouseCounts: [{ warehouseId: 'warehouse-b', available: 500, updatedAt: '2026-04-22T10:00:00.000Z' }],
        },
      ],
      historicalOrders: [
        {
          orderDate: '2026-04-01',
          breakdownRows: [{ priceKey: '#Juan-Roll|Single|1g', quantity: 100 }],
          lines: [
            { productName: 'Juan Roll Golden Hour Pre Roll 1g', quantity: 50, priceKey: '#Juan-Roll|Single|1g' },
            { productName: 'Juan Roll Midnight Affair Pre Roll 1g', quantity: 50, priceKey: '#Juan-Roll|Single|1g' },
          ],
        },
      ],
    });

    expect(draft.lines).toHaveLength(2);
    expect(draft.lines.every((line) => line.quantity % line.casePackSize === 0)).toBe(true);
    expect(draft.breakdownRows.find((row) => row.priceKey === '#Juan-Roll|Single|1g')).toMatchObject({
      quantity: 100,
    });
  });

  it('allows #Juan single demand to fall back to Ichi singles only', () => {
    const rows: PreferredPartnerProposalInputRow[] = [
      buildRow({
        productName: 'Juan Roll Golden Hour Pre Roll 1g',
        totalUnitsSold: 10,
        minimumSuggestedOrder: 140,
      }),
      buildRow({
        productName: 'Juan Roll Midnight Affair Pre Roll 1g',
        totalUnitsSold: 10,
        minimumSuggestedOrder: 210,
      }),
    ];

    const draft = calculatePreferredPartnerProposalDraft({
      rows,
      inventoryRows: [
        buildInventoryRow({ skuCode: 'IR-SS', skuName: 'ICHI-ROLL | Uninfused Pre-roll | 1G SINGLE | Super Slushie', casePackSize: 10, pricePerUnit: 4.5, availableUnits: 50 }),
        buildInventoryRow({ skuCode: 'IR-TW', skuName: 'ICHI-ROLL | Uninfused Pre-roll | 1G SINGLE | Time Warp', casePackSize: 10, pricePerUnit: 4.5, availableUnits: 50 }),
      ],
      historicalOrders: [
        {
          orderDate: '2026-04-01',
          breakdownRows: [{ priceKey: '#Juan-Roll|Single|1g', quantity: 100 }],
          lines: [
            { productName: 'Juan Roll Golden Hour Pre Roll 1g', quantity: 50, priceKey: '#Juan-Roll|Single|1g' },
            { productName: 'Juan Roll Midnight Affair Pre Roll 1g', quantity: 50, priceKey: '#Juan-Roll|Single|1g' },
          ],
        },
      ],
    });

    expect(quantityByPriceKey(draft)).toMatchObject({
      'Ichi-Roll|Single|1g': 100,
    });
    expect(quantityByPriceKey(draft)['#Juan-Roll|Single|1g']).toBeUndefined();
    expect(draft.lines.every((line) => line.priceKey === 'Ichi-Roll|Single|1g')).toBe(true);
    expect(draft.lines.every((line) => line.quantity % line.casePackSize === 0)).toBe(true);
    expect(draft.omittedDemandFamilies).toEqual([]);
  });

  it('allows #Juan pack demand to fall back to Ichi packs only', () => {
    const rows: PreferredPartnerProposalInputRow[] = [
      buildRow({
        productName: 'Juan Roll Happy Purps Pre Rolls 4pk 4g',
        totalUnitsSold: 9,
        minimumSuggestedOrder: 14,
      }),
    ];

    const draft = calculatePreferredPartnerProposalDraft({
      rows,
      inventoryRows: [
        buildInventoryRow({ skuCode: 'IR-AH4', skuName: 'ICHI-ROLL | Uninfused Pre-roll | 4-PACK (4G) | Afterglow Haze', casePackSize: 5, pricePerUnit: 14.4, availableUnits: 20 }),
      ],
      historicalOrders: [
        {
          orderDate: '2026-04-01',
          breakdownRows: [{ priceKey: '#Juan-Roll|4-Pack|4g', quantity: 15 }],
          lines: [{ productName: 'Juan Roll Happy Purps Pre Rolls 4pk 4g', quantity: 15, priceKey: '#Juan-Roll|4-Pack|4g' }],
        },
      ],
    });

    expect(quantityByPriceKey(draft)).toMatchObject({
      'Ichi-Roll|4-Pack|4g': 15,
    });
    expect(quantityByPriceKey(draft)['#Juan-Roll|4-Pack|4g']).toBeUndefined();
    expect(draft.lines.every((line) => line.priceKey === 'Ichi-Roll|4-Pack|4g')).toBe(true);
    expect(draft.lines.every((line) => line.quantity % line.casePackSize === 0)).toBe(true);
    expect(draft.omittedDemandFamilies).toEqual([]);
  });

  it('matches the known Culture House family totals and keeps whole-case line quantities', () => {
    const rows: PreferredPartnerProposalInputRow[] = [
      buildRow({ productName: 'Juan Roll Golden Hour Pre Roll 1g', totalUnitsSold: 58, minimumSuggestedOrder: 88 }),
      buildRow({ productName: 'Juan Roll Midnight Affair Pre Roll 1g', totalUnitsSold: 60, minimumSuggestedOrder: 90 }),
      buildRow({ productName: 'Juan Roll Happy Purps Pre Rolls 4pk 4g', totalUnitsSold: 9, minimumSuggestedOrder: 14 }),
      buildRow({ productName: 'Juan Roll Velour Pre Roll 4pk 4g', totalUnitsSold: 1, minimumSuggestedOrder: 7 }),
      buildRow({ productName: 'Smack Hard Lemon Haze Infused Preroll 1g', totalUnitsSold: 51, minimumSuggestedOrder: 21 }),
      buildRow({ productName: 'Smack Mad Mimosa Infused Preroll 1g', totalUnitsSold: 47, minimumSuggestedOrder: 28 }),
      buildRow({ productName: 'Smack Twisted Lime Kush Infused Preroll 0.5g', totalUnitsSold: 100, minimumSuggestedOrder: 168 }),
      buildRow({ productName: 'Smack Og Punch Infused Preroll 0.5g', totalUnitsSold: 12, minimumSuggestedOrder: 42 }),
      buildRow({ productName: 'Ichi-Roll Afterglow Haze Pre Roll 4pk 4g', totalUnitsSold: 9, minimumSuggestedOrder: 14 }),
      buildRow({ productName: 'Sushi Hash Hole Grape Gas X Runtz Rosin 1g', totalUnitsSold: 0, totalQuantityOnHand: 10 }),
      buildRow({ productName: 'Sushi Hash Hole Columbian Gold X Super Boof Rosin 1g', totalUnitsSold: 0, totalQuantityOnHand: 13 }),
    ];

    const draft = calculatePreferredPartnerProposalDraft({
      rows,
      inventoryRows: [
        buildInventoryRow({ skuCode: 'JR-GH', skuName: '#JUAN-ROLL | 1G SINGLE | Golden Hour', pricePerUnit: 4.5, availableUnits: 200 }),
        buildInventoryRow({ skuCode: 'JR-MA', skuName: '#JUAN-ROLL | 1G SINGLE | Midnight Affair', pricePerUnit: 4.5, availableUnits: 200 }),
        buildInventoryRow({ skuCode: 'JR-HP4', skuName: '#JUAN-ROLL | 4-PACK (4G) | Happy Purps', casePackSize: 1, pricePerUnit: 14.4, availableUnits: 50 }),
        buildInventoryRow({ skuCode: 'JR-V4', skuName: '#JUAN-ROLL | 4-PACK (4G) | Velour', casePackSize: 1, pricePerUnit: 14.4, availableUnits: 50 }),
        buildInventoryRow({ skuCode: 'SM-HLH', skuName: 'SMACK. | Infused Pre-roll | 1G SINGLE | Hard Lemon Haze', pricePerUnit: 5, availableUnits: 200 }),
        buildInventoryRow({ skuCode: 'SM-MM', skuName: 'SMACK. | Infused Pre-roll | 1G SINGLE | Mad Mimosa', pricePerUnit: 5, availableUnits: 200 }),
        buildInventoryRow({ skuCode: 'SM-TLK', skuName: 'SMACK. | Infused Pre-roll | .5G SINGLE | Twisted Lime Kush', pricePerUnit: 3.4, availableUnits: 200 }),
        buildInventoryRow({ skuCode: 'SM-OP', skuName: 'SMACK. | Infused Pre-roll | .5G SINGLE | OG Punch', pricePerUnit: 3.4, availableUnits: 200 }),
        buildInventoryRow({ skuCode: 'IR-AH4', skuName: 'ICHI-ROLL | Uninfused Pre-roll | 4-PACK (4G) | Afterglow Haze', casePackSize: 1, pricePerUnit: 14.4, availableUnits: 50 }),
        buildInventoryRow({ skuCode: 'SH-GGR', skuName: 'SUSHI HASH | HASH HOLE | 1G SINGLE | Grape Gas X Runtz Rosin', pricePerUnit: 11.25, availableUnits: 50 }),
        buildInventoryRow({ skuCode: 'SH-CGSB', skuName: 'SUSHI HASH | HASH HOLE | 1G SINGLE | Columbian Gold X Super Boof Rosin', pricePerUnit: 11.25, availableUnits: 50 }),
      ],
      historicalOrders: [
        {
          orderDate: '2026-04-15',
          breakdownRows: [
            { priceKey: '#Juan-Roll|Single|1g', quantity: 160 },
            { priceKey: '#Juan-Roll|4-Pack|4g', quantity: 19 },
            { priceKey: 'Smack.|Single|1g', quantity: 140 },
            { priceKey: 'Smack.|Mini|0.5g', quantity: 120 },
            { priceKey: 'Ichi-Roll|4-Pack|4g', quantity: 15 },
            { priceKey: 'Sushi Hash|Single|1g', quantity: 20 },
          ],
          lines: [
            { productName: 'Juan Roll Golden Hour Pre Roll 1g', quantity: 80, priceKey: '#Juan-Roll|Single|1g' },
            { productName: 'Juan Roll Midnight Affair Pre Roll 1g', quantity: 80, priceKey: '#Juan-Roll|Single|1g' },
            { productName: 'Juan Roll Happy Purps Pre Rolls 4pk 4g', quantity: 15, priceKey: '#Juan-Roll|4-Pack|4g' },
            { productName: 'Juan Roll Velour Pre Roll 4pk 4g', quantity: 4, priceKey: '#Juan-Roll|4-Pack|4g' },
            { productName: 'Smack Hard Lemon Haze Infused Preroll 1g', quantity: 80, priceKey: 'Smack.|Single|1g' },
            { productName: 'Smack Mad Mimosa Infused Preroll 1g', quantity: 60, priceKey: 'Smack.|Single|1g' },
            { productName: 'Smack Twisted Lime Kush Infused Preroll 0.5g', quantity: 80, priceKey: 'Smack.|Mini|0.5g' },
            { productName: 'Smack Og Punch Infused Preroll 0.5g', quantity: 40, priceKey: 'Smack.|Mini|0.5g' },
            { productName: 'Ichi-Roll Afterglow Haze Pre Roll 4pk 4g', quantity: 15, priceKey: 'Ichi-Roll|4-Pack|4g' },
            { productName: 'Sushi Hash Hole Grape Gas X Runtz Rosin 1g', quantity: 10, priceKey: 'Sushi Hash|Single|1g' },
            { productName: 'Sushi Hash Hole Columbian Gold X Super Boof Rosin 1g', quantity: 10, priceKey: 'Sushi Hash|Single|1g' },
          ],
        },
      ],
    });

    expect(quantityByPriceKey(draft)).toMatchObject({
      '#Juan-Roll|Single|1g': 160,
      '#Juan-Roll|4-Pack|4g': 19,
      'Smack.|Single|1g': 140,
      'Smack.|Mini|0.5g': 120,
      'Ichi-Roll|4-Pack|4g': 15,
      'Sushi Hash|Single|1g': 20,
    });
    expect(draft.lines.every((line) => line.quantity % line.casePackSize === 0)).toBe(true);
  });

  it('matches the known Canna Family family totals for exact-family inventory and does not cross-substitute packs into singles', () => {
    const rows: PreferredPartnerProposalInputRow[] = [
      buildRow({ storeName: 'Canna Family', productName: 'Chopsticks Blueberry Cookies Pre Roll 2pk 1g', totalUnitsSold: 20, minimumSuggestedOrder: 70 }),
      buildRow({ storeName: 'Canna Family', productName: 'Chopsticks Lemon Og Haze Pre Roll 2pk 1g', totalUnitsSold: 20, minimumSuggestedOrder: 56 }),
      buildRow({ storeName: 'Canna Family', productName: 'Chopsticks Og Kush Pre Roll 2pk 1g', totalUnitsSold: 20, minimumSuggestedOrder: 70 }),
      buildRow({ storeName: 'Canna Family', productName: 'Chopsticks Strawberry Cough Pre Roll 2pk 1g', totalUnitsSold: 20, minimumSuggestedOrder: 84 }),
      buildRow({ storeName: 'Canna Family', productName: 'Ichi-Roll Sour Zkittlez Preroll 1g', totalUnitsSold: 4, minimumSuggestedOrder: 56 }),
      buildRow({ storeName: 'Canna Family', productName: 'Ichi-Roll Super Slushie Preroll 1g', totalUnitsSold: 8, minimumSuggestedOrder: 38 }),
      buildRow({ storeName: 'Canna Family', productName: 'Ichi-Roll Time Warp Pre Roll 1g', totalUnitsSold: 7, minimumSuggestedOrder: 34 }),
      buildRow({ storeName: 'Canna Family', productName: 'Ichi-Roll Afterglow Haze Pre Roll 4pk 4g', totalUnitsSold: 2, minimumSuggestedOrder: 11 }),
      buildRow({ storeName: 'Canna Family', productName: 'Juan Roll Golden Hour Pre Roll 1g', totalUnitsSold: 10, minimumSuggestedOrder: 140 }),
      buildRow({ storeName: 'Canna Family', productName: 'Juan Roll Midnight Affair Pre Roll 1g', totalUnitsSold: 10, minimumSuggestedOrder: 210 }),
      buildRow({ storeName: 'Canna Family', productName: '#Juan-Roll Sevn Sins Prerolls 4pk 4g', totalUnitsSold: 4, minimumSuggestedOrder: 42 }),
      buildRow({ storeName: 'Canna Family', productName: 'Smack Blu Cookie Monster Infused Pre Roll 1g', totalUnitsSold: 20, minimumSuggestedOrder: 105 }),
      buildRow({ storeName: 'Canna Family', productName: 'Smack Cranberry Rozay Infused Pre Roll 1g', totalUnitsSold: 20, minimumSuggestedOrder: 65 }),
      buildRow({ storeName: 'Canna Family', productName: 'Smack Hard Lemon Haze Infused Pre Roll 1g', totalUnitsSold: 20, minimumSuggestedOrder: 70 }),
      buildRow({ storeName: 'Canna Family', productName: 'Smack Mad Mimosa Infused Pre Roll 1g', totalUnitsSold: 20, minimumSuggestedOrder: 94 }),
      buildRow({ storeName: 'Canna Family', productName: 'Smack Twisted Lime Kush Infused Pre Roll 1g', totalUnitsSold: 20, minimumSuggestedOrder: 56 }),
      buildRow({ storeName: 'Canna Family', productName: 'Smack. Og Punch Infused Preroll 1g', totalUnitsSold: 10, minimumSuggestedOrder: 70 }),
      buildRow({ storeName: 'Canna Family', productName: 'Smack. Sour City Diesel Infused Preroll 1g', totalUnitsSold: 10, minimumSuggestedOrder: 105 }),
      buildRow({ storeName: 'Canna Family', productName: 'Sushi Hash Columbian Lemonz X Fortified Jelly Hash Hole 5pk 2.5g', totalUnitsSold: 1, minimumSuggestedOrder: 5 }),
      buildRow({ storeName: 'Canna Family', productName: 'Sushi Hash Ghost Train Haze X Sour Guava Hash Hole 5pk 2.5g', totalUnitsSold: 3, minimumSuggestedOrder: 19 }),
      buildRow({ storeName: 'Canna Family', productName: 'Sushi Hash Grape Gas X Guava Gas Hash Hole 5pk 2.5g', totalUnitsSold: 5, minimumSuggestedOrder: 42 }),
    ];

    const draft = calculatePreferredPartnerProposalDraft({
      rows,
      inventoryRows: [
        buildInventoryRow({ skuCode: 'CH-CNC', skuName: 'CHOPSTICKS | Uninfused Pre-roll | .5G 2-Pack (1G) | Cookies N Cream', casePackSize: 40, pricePerUnit: 5, availableUnits: 160 }),
        buildInventoryRow({ skuCode: 'CH-GP', skuName: 'CHOPSTICKS | Uninfused Pre-roll | .5G 2-Pack (1G) | Golden Pineapple', casePackSize: 40, pricePerUnit: 5, availableUnits: 160 }),
        buildInventoryRow({ skuCode: 'SM-TLK', skuName: 'SMACK. | Infused Pre-roll | 1G SINGLE | Twisted Lime Kush', casePackSize: 10, pricePerUnit: 6.25, availableUnits: 100 }),
        buildInventoryRow({ skuCode: 'SM-CR', skuName: 'SMACK. | Infused Pre-roll | 1G SINGLE | Cranberry Rozay', casePackSize: 10, pricePerUnit: 6.25, availableUnits: 100 }),
        buildInventoryRow({ skuCode: 'SM-SCD', skuName: 'SMACK. | Infused Pre-roll | 1G SINGLE | Sour City Diesel', casePackSize: 10, pricePerUnit: 6.25, availableUnits: 100 }),
        buildInventoryRow({ skuCode: 'SM-MM', skuName: 'SMACK. | Infused Pre-roll | 1G SINGLE | Mad Mimosa', casePackSize: 10, pricePerUnit: 6.25, availableUnits: 100 }),
        buildInventoryRow({ skuCode: 'SM-HLH', skuName: 'SMACK. | Infused Pre-roll | 1G SINGLE | Hard Lemon Haze', casePackSize: 10, pricePerUnit: 6.25, availableUnits: 100 }),
        buildInventoryRow({ skuCode: 'SM-OP', skuName: 'SMACK. | Infused Pre-roll | 1G SINGLE | OG Punch', casePackSize: 10, pricePerUnit: 6.25, availableUnits: 100 }),
        buildInventoryRow({ skuCode: 'IR-TW', skuName: 'ICHI-ROLL | Uninfused Pre-roll | 1G SINGLE | Time Warp', casePackSize: 10, pricePerUnit: 4.5, availableUnits: 50 }),
        buildInventoryRow({ skuCode: 'IR-AH4', skuName: 'ICHI-ROLL | Uninfused Pre-roll | 4-PACK (4G) | Afterglow Haze', casePackSize: 5, pricePerUnit: 14.4, availableUnits: 30 }),
        buildInventoryRow({ skuCode: 'JR-GH', skuName: '#JUAN-ROLL | 1G SINGLE | Golden Hour', casePackSize: 10, pricePerUnit: 4.5, availableUnits: 100 }),
        buildInventoryRow({ skuCode: 'JR-MA', skuName: '#JUAN-ROLL | 1G SINGLE | Midnight Affair', casePackSize: 10, pricePerUnit: 4.5, availableUnits: 100 }),
        buildInventoryRow({ skuCode: 'JR-SS4', skuName: '#JUAN-ROLL | 4-PACK (4G) | Sevn Sins', casePackSize: 5, pricePerUnit: 14.4, availableUnits: 25 }),
        buildInventoryRow({ skuCode: 'SH-GGR', skuName: 'SUSHI HASH | HASH HOLE | 1G SINGLE | Grape Gas X Runtz Rosin', casePackSize: 10, pricePerUnit: 11.25, availableUnits: 30 }),
        buildInventoryRow({ skuCode: 'SH-CGSB', skuName: 'SUSHI HASH | HASH HOLE | 1G SINGLE | Columbian Gold X Super Boof Rosin', casePackSize: 10, pricePerUnit: 11.25, availableUnits: 30 }),
      ],
      historicalOrders: [
        {
          orderDate: '2026-04-10',
          breakdownRows: [
            { priceKey: 'Chopsticks|2 (.5g)|1g', quantity: 160 },
            { priceKey: 'Ichi-Roll|Single|1g', quantity: 20 },
            { priceKey: 'Ichi-Roll|4-Pack|4g', quantity: 10 },
            { priceKey: '#Juan-Roll|Single|1g', quantity: 100 },
            { priceKey: '#Juan-Roll|4-Pack|4g', quantity: 5 },
            { priceKey: 'Smack.|Single|1g', quantity: 290 },
            { priceKey: 'Sushi Hash|Single|1g', quantity: 20 },
          ],
          lines: [
            { productName: 'Chopsticks Cookies N Cream Pre Roll 2pk 1g', quantity: 80, priceKey: 'Chopsticks|2 (.5g)|1g' },
            { productName: 'Chopsticks Golden Pineapple Pre Roll 2pk 1g', quantity: 80, priceKey: 'Chopsticks|2 (.5g)|1g' },
            { productName: 'Ichi-Roll Time Warp Pre Roll 1g', quantity: 20, priceKey: 'Ichi-Roll|Single|1g' },
            { productName: 'Ichi-Roll Afterglow Haze Pre Roll 4pk 4g', quantity: 10, priceKey: 'Ichi-Roll|4-Pack|4g' },
            { productName: 'Juan Roll Golden Hour Pre Roll 1g', quantity: 50, priceKey: '#Juan-Roll|Single|1g' },
            { productName: 'Juan Roll Midnight Affair Pre Roll 1g', quantity: 50, priceKey: '#Juan-Roll|Single|1g' },
            { productName: '#Juan-Roll Sevn Sins Prerolls 4pk 4g', quantity: 5, priceKey: '#Juan-Roll|4-Pack|4g' },
            { productName: 'Smack Twisted Lime Kush Infused Pre Roll 1g', quantity: 40, priceKey: 'Smack.|Single|1g' },
            { productName: 'Smack Cranberry Rozay Infused Pre Roll 1g', quantity: 40, priceKey: 'Smack.|Single|1g' },
            { productName: 'Smack Sour City Diesel Infused Pre Roll 1g', quantity: 60, priceKey: 'Smack.|Single|1g' },
            { productName: 'Smack Mad Mimosa Infused Pre Roll 1g', quantity: 50, priceKey: 'Smack.|Single|1g' },
            { productName: 'Smack Hard Lemon Haze Infused Pre Roll 1g', quantity: 50, priceKey: 'Smack.|Single|1g' },
            { productName: 'Smack Og Punch Infused Preroll 1g', quantity: 50, priceKey: 'Smack.|Single|1g' },
            { productName: 'Sushi Hash Grape Gas X Runtz Rosin 1g', quantity: 10, priceKey: 'Sushi Hash|Single|1g' },
            { productName: 'Sushi Hash Columbian Gold X Super Boof Rosin 1g', quantity: 10, priceKey: 'Sushi Hash|Single|1g' },
          ],
        },
      ],
    });

    expect(quantityByPriceKey(draft)).toMatchObject({
      'Chopsticks|2 (.5g)|1g': 160,
      'Ichi-Roll|Single|1g': 20,
      'Ichi-Roll|4-Pack|4g': 10,
      '#Juan-Roll|Single|1g': 100,
      '#Juan-Roll|4-Pack|4g': 5,
      'Smack.|Single|1g': 290,
    });
    expect(quantityByPriceKey(draft)['Sushi Hash|Single|1g']).toBeUndefined();
    expect(draft.omittedDemandFamilies).toContain('Sushi Hash Pack');
    expect(draft.lines.every((line) => line.quantity % line.casePackSize === 0)).toBe(true);
  });
});
