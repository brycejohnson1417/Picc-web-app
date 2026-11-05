import { describe, expect, it } from 'vitest';
import { buildSalesView, ordersToCsv, parseSalesReport, type SalesOrder } from './sales-report';

const order = (overrides: Partial<SalesOrder> = {}): SalesOrder => ({
  id: 'one', number: 'SO-1', date: '2026-11-02', status: 'PROCESSING', total: 120,
  returnValue: 0, companyId: 'company-1', store: 'Store One', crmId: 'crm-1', rep: 'Rep A',
  included: true, hasCommercialLines: true, checks: [],
  items: [{ id: 'line-1', productId: 'product-1', name: 'Product', family: 'Flower', quantity: 10,
    returnedQuantity: 0, unitPrice: 12, lineValue: 120, retainedLineValue: 120, isSample: false, isPiccCatalogProduct: true }],
  ...overrides,
});

describe('sales review reporting', () => {
  it('excludes pending, canceled and sample-only orders even if upstream includes them', () => {
    const view = buildSalesView([
      order(), order({ id: 'pending', status: 'PENDING', total: 900 }),
      order({ id: 'canceled', status: 'CANCELED', total: 800 }),
      order({ id: 'sample', hasCommercialLines: false, total: 1 }),
      order({ id: 'mislabeled-sample', items: [{ ...order().items[0], isSample: true }] }),
    ], { month: '2026-11' });
    expect(view.summary.orderValue).toBe(120);
    expect(view.summary.orderCount).toBe(1);
    expect(view.excludedDrafts).toBe(1);
  });

  it('keeps month, rep, chart, table and CSV scopes consistent', () => {
    const orders = [order(), order({ id: 'two', rep: 'Rep B', total: 220 }), order({ id: 'old', date: '2026-10-31', total: 500 })];
    const view = buildSalesView(orders, { month: '2026-11', rep: 'Rep A' });
    expect(view.orders.map(row => row.id)).toEqual(['one']);
    expect(view.daily.reduce((sum, day) => sum + day.value, 0)).toBe(120);
    expect(view.reps.reduce((sum, rep) => sum + rep.value, 0)).toBe(120);
    expect(ordersToCsv(view.orders)).not.toContain('Rep B');
  });

  it('deduplicates stores and accounts for returned product units without treating samples as sales', () => {
    const original = order();
    const rows = [order({ items: [
      { ...original.items[0], returnedQuantity: 2, retainedLineValue: 96 },
      { ...original.items[0], id: 'sample', isSample: true, lineValue: 1, retainedLineValue: 1 },
    ], returnValue: 24 }), order({ id: 'second', total: 100 })];
    const view = buildSalesView(rows, { month: '2026-11' });
    expect(view.summary.buyingStores).toBe(1);
    expect(view.summary.returnValue).toBe(24);
    expect(view.products[0].retainedValue).toBe(216);
    expect(view.products[0].units).toBe(20);
    expect(view.products[0].returnedUnits).toBe(2);
  });

  it('does not call processing orders paid or confirmed and preserves buyer follow-ups', () => {
    const view = buildSalesView([order({ checks: ['Buyer approval follow-up'] }), order({ id: 'done', status: 'DELIVERED', total: 50 })], { month: '2026-11' });
    expect(view.summary.openValue).toBe(120);
    expect(view.summary.deliveredValue).toBe(50);
    expect(view.summary.approvalFollowups).toBe(1);
  });

  it('escapes spreadsheet formulas, embedded quotes and line breaks in exported labels', () => {
    const csv = ordersToCsv([order({ store: '=HYPERLINK("bad")\nStore' })]);
    expect(csv).toContain('"\'=HYPERLINK(""bad"")\nStore"');
  });

  it('rejects corrupt dates and duplicate order IDs before reporting totals', () => {
    const report = { generatedAt: '2026-11-05T12:00:00Z', timezone: 'America/New_York', currency: 'USD', defaultPeriod: '2026-11', source: { name: 'Source', workspace: 'Workspace', scope: 'Brand', firstAvailableOrder: '2026-10-01', lastAvailableOrder: '2026-11-05', retrievedOrders: 1, completePagination: true }, definitions: {}, coverage: {}, orders: [order()] };
    expect(parseSalesReport(report).orders).toHaveLength(1);
    expect(parseSalesReport(report).launchFamilies).toEqual([]);
    expect(parseSalesReport({ ...report, launchFamilies: ['Seasonal family'] }).launchFamilies).toEqual(['Seasonal family']);
    expect(() => parseSalesReport({ ...report, launchFamilies: [42] })).toThrow('incomplete');
    expect(() => parseSalesReport({ ...report, orders: [order({ date: '2026-11-31' })] })).toThrow('incomplete');
    expect(() => parseSalesReport({ ...report, orders: [order(), order()] })).toThrow('incomplete');
    expect(() => parseSalesReport({ ...report, orders: [{ ...order(), date: 20261101 }] })).toThrow('incomplete');
    expect(() => parseSalesReport({ ...report, orders: [order({ items: [{ ...order().items[0], lineValue: Infinity }] })] })).toThrow('incomplete');
  });
});
