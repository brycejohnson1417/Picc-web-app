import { describe, expect, it } from 'vitest';
import { buildStoreOpportunities, type StoreSalesContext } from './store-opportunities';

const context = (overrides: Partial<StoreSalesContext> = {}): StoreSalesContext => ({
  coverageStart: '2026-09-14', coverageEnd: '2026-11-05', completeCoverage: true, featuredFamilies: ['Launch'],
  catalog: [
    { productId: 'one', name: 'Launch Product One', brand: 'Launch', family: 'Launch', unitsPerCase: 10, availableUnits: 20, unitPriceCents: 500, paymentTerms: '' },
    { productId: 'two', name: 'Launch Product Two', brand: 'Launch', family: 'Launch', unitsPerCase: 10, availableUnits: 30, unitPriceCents: 500, paymentTerms: '' },
  ],
  orders: [], ...overrides,
});

describe('store opportunity evidence', () => {
  it('does not turn pending drafts or samples into purchase evidence', () => {
    const result = buildStoreOpportunities(context({ orders: [
      { date: '2026-11-05', status: 'PENDING', included: false, items: [{ productId: 'one', family: 'Launch', isSample: false, quantity: 10 }] },
      { date: '2026-11-03', status: 'DELIVERED', included: true, items: [{ productId: 'two', family: 'Launch', isSample: true, quantity: 10 }] },
    ] }));
    expect(result.purchased).toEqual([]);
    expect(result.suggestions.every(row => row.evidence === 'not-ordered-in-period')).toBe(true);
  });

  it('only claims absence within complete scoped coverage with explicit bounds', () => {
    expect(buildStoreOpportunities(context({ completeCoverage: false })).suggestions[0].evidence).toBe('available');
    expect(buildStoreOpportunities(context({ coverageStart: null })).suggestions[0].evidence).toBe('available');
    expect(buildStoreOpportunities(context({ coverageEnd: null })).suggestions[0].evidence).toBe('available');
  });

  it('uses exact product IDs and preserves the last purchased family date', () => {
    const result = buildStoreOpportunities(context({ orders: [{ date: '2026-10-28', status: 'DELIVERED', included: true, items: [{ productId: 'one', family: 'Launch', isSample: false, quantity: 10 }] }] }));
    expect(result.suggestions[0].product.productId).toBe('two');
    expect(result.purchased).toEqual([{ family: 'Launch', lastOrderDate: '2026-10-28' }]);
  });

  it('excludes insufficient stock while retaining explicit confirmation requirements for available products', () => {
    const base = context();
    const suggestions = buildStoreOpportunities(context({ catalog: base.catalog.map((row, index) => index === 0 ? { ...row, availableUnits: 9 } : { ...row, requiresConfirmation: true }) })).suggestions;
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].product.productId).toBe('two');
    expect(suggestions[0].product.requiresConfirmation).toBe(true);
  });

  it('never labels warehouse supply as store inventory or assumes replenishment need', () => {
    const result = buildStoreOpportunities(context({ orders: [{ date: '2026-10-28', status: 'DELIVERED', included: true, items: [
      { productId: 'one', family: 'Launch', isSample: false, quantity: 10 },
      { productId: 'two', family: 'Launch', isSample: false, quantity: 10 },
    ] }] }));
    expect(result.suggestions.every(row => row.evidence === 'previously-ordered')).toBe(true);
    expect(result.suggestions[0].lastOrderDate).toBe('2026-10-28');
  });
});
