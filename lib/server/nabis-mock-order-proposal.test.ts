import { describe, expect, it } from 'vitest';
import { calculateMockOrderProposalFromInventoryRows } from '@/lib/server/nabis-mock-order-proposal';

describe('Nabis mock-order proposal inventory math', () => {
  it('includes one full case of in-stock cannabis products and excludes displays, samples, and dummy packaging', () => {
    const proposal = calculateMockOrderProposalFromInventoryRows([
      {
        skuCode: 'NJR-4pk-HP-46598',
        skuName: '#JUAN-ROLL | Uninfused Pre-roll | 1G 4-PACK (4G) | Happy Purps (S)',
        skuInventoryType: 'CANNABIS',
        skuInventoryClass: 'PRE_ROLL',
        skuInventoryCategory: 'PACK',
        skuCasePackSize: 5,
        skuPricePerUnit: '14.40',
        skuUnit: '4g',
        warehouseCounts: [{ warehouseId: '94798372-c748-4b33-894c-f9614e6260dc', available: 8, updatedAt: '2026-04-22T16:00:00.000Z' }],
      },
      {
        skuCode: 'C-POS-DISPLAY',
        skuName: 'Chopsticks Store Display',
        skuInventoryType: 'NON_CANNABIS',
        skuInventoryClass: 'OTHER',
        skuInventoryCategory: 'OTHER',
        skuCasePackSize: 1,
        skuPricePerUnit: '0.01',
        warehouseCounts: [{ available: 40 }],
      },
      {
        skuCode: 'DUMMY-PACKAGING',
        skuName: 'Dummy Packaging Sleeve',
        skuInventoryType: 'CANNABIS',
        skuCasePackSize: 100,
        skuPricePerUnit: '0.01',
        warehouseCounts: [{ available: 1000 }],
      },
      {
        skuCode: 'SAMPLE-1',
        skuName: 'State of Mind Sample',
        skuInventoryType: 'CANNABIS',
        skuIsSample: true,
        skuCasePackSize: 10,
        skuPricePerUnit: '8.00',
        warehouseCounts: [{ available: 100 }],
      },
      {
        skuCode: 'OY-LOW',
        skuName: 'O-YEAH | Infused Pre-roll | 5-PACK (2.5G) | Mango',
        skuInventoryType: 'CANNABIS',
        skuCasePackSize: 10,
        skuPricePerUnit: '15.75',
        warehouseCounts: [{ available: 4 }],
      },
    ]);

    expect(proposal.summary.sourceRowCount).toBe(5);
    expect(proposal.summary.eligibleProductCount).toBe(2);
    expect(proposal.summary.proposedLineCount).toBe(1);
    expect(proposal.summary.excludedNonProductRowCount).toBe(3);
    expect(proposal.summary.excludedInsufficientInventoryCount).toBe(1);
    expect(proposal.summary.totalCases).toBe(1);
    expect(proposal.summary.totalUnits).toBe(5);
    expect(proposal.summary.subtotal).toBe(66.06);
    expect(proposal.summary.taxRate).toBe(0.09);
    expect(proposal.summary.taxTotal).toBe(5.94);
    expect(proposal.summary.totalBalanceDue).toBe(72);
    expect(proposal.lines[0]).toMatchObject({
      skuCode: 'NJR-4pk-HP-46598',
      brandName: '#JUAN-ROLL',
      casePackSize: 5,
      cases: 1,
      units: 5,
      unitPrice: 14.4,
      caseTotal: 72,
      availableUnits: 8,
      availableCases: 1,
      warehouseCount: 1,
      sourceWarehouseIds: ['94798372-c748-4b33-894c-f9614e6260dc'],
    });
  });

  it('aggregates availability across duplicate SKU batch rows before deciding whether one case is available', () => {
    const proposal = calculateMockOrderProposalFromInventoryRows([
      {
        skuCode: 'IR-1g-TW-33400',
        skuName: 'ICHI-ROLL | Uninfused Pre-roll | 1G SINGLE | Time Warp (S)',
        skuInventoryType: 'CANNABIS',
        skuCasePackSize: 10,
        skuPricePerUnit: '4.50',
        warehouseCounts: [{ warehouseId: 'warehouse-a', available: 4, updatedAt: '2026-04-20T10:00:00.000Z' }],
        skuBatchLastUpdatedDate: '2026-04-20T10:00:00.000Z',
        batchCode: 'BATCH-A',
        batchExpirationDate: '2026-12-01',
      },
      {
        skuCode: 'IR-1g-TW-33400',
        skuName: 'ICHI-ROLL | Uninfused Pre-roll | 1G SINGLE | Time Warp (S)',
        skuInventoryType: 'CANNABIS',
        skuCasePackSize: 10,
        skuPricePerUnit: '4.50',
        warehouseCounts: [
          { warehouseId: 'warehouse-a', available: 3, updatedAt: '2026-04-21T10:00:00.000Z' },
          { warehouseId: 'warehouse-b', available: 4, updatedAt: '2026-04-22T10:00:00.000Z' },
        ],
        batchCode: 'BATCH-B',
      },
    ]);

    expect(proposal.summary.proposedLineCount).toBe(1);
    expect(proposal.summary.totalUnits).toBe(10);
    expect(proposal.summary.subtotal).toBe(41.28);
    expect(proposal.summary.taxTotal).toBe(3.72);
    expect(proposal.summary.totalBalanceDue).toBe(45);
    expect(proposal.summary.inventoryUpdatedAt).toBe('2026-04-22T10:00:00.000Z');
    expect(proposal.lines[0]).toMatchObject({
      availableUnits: 11,
      availableCases: 1,
      batchCount: 2,
      batchCode: 'BATCH-A',
      batchExpirationDate: '2026-12-01',
      warehouseCount: 2,
      sourceWarehouseIds: ['warehouse-a', 'warehouse-b'],
    });
  });

  it('does not create partial-case proposal lines when available units are below the case-pack size', () => {
    const proposal = calculateMockOrderProposalFromInventoryRows([
      {
        skuCode: 'SH-LOW',
        skuName: 'SUSHI HASH | HASH HOLE | 1G SINGLE | Gold Rush',
        skuInventoryType: 'CANNABIS',
        skuCasePackSize: 10,
        skuPricePerUnit: '11.25',
        warehouseCounts: [{ available: 9 }],
      },
    ]);

    expect(proposal.summary.eligibleProductCount).toBe(1);
    expect(proposal.summary.proposedLineCount).toBe(0);
    expect(proposal.summary.excludedInsufficientInventoryCount).toBe(1);
    expect(proposal.summary.subtotal).toBe(0);
    expect(proposal.summary.taxTotal).toBe(0);
    expect(proposal.summary.totalBalanceDue).toBe(0);
    expect(proposal.lines).toEqual([]);
  });
});
