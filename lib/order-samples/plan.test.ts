import { describe, expect, it } from 'vitest';
import { planSamples, type CatalogProduct, type SalesOrder, type SamplePolicy } from './plan';

const product = (id: string, brand: string, kind: CatalogProduct['kind'], available = 0): CatalogProduct =>
  ({ id, sku: id, name: id, brand, kind, available, strain: id });
const roll = product('roll', 'Example Roll', 'pre-roll', 9);
const oldDisplay = product('old-display', 'Example Roll', 'display');
const display = product('display', 'Example Roll', 'display', 5);
const rosin = product('rosin', 'Example Gummies', 'gummy:rosin', 8);
const mood = product('mood', 'Example Gummies', 'gummy:mood', 3);
const excluded = product('excluded', 'Excluded Brand', 'pre-roll', 20);
const policy: SamplePolicy = {
  unitPriceCents: 1, preRollCap: 5, preRollBrands: ['Example Roll'], brandAliases: {}, exclusions: ['Excluded Brand'],
  gummyBrand: 'Example Gummies', gummyGroups: [{ label: 'rosin', terms: ['rosin'] }, { label: 'mood', terms: ['mood'] }],
};
const catalog = [roll, oldDisplay, display, rosin, mood, excluded];

function row(productId: string, quantity: number, sample = false, price = sample ? 0.01 : 10) {
  return { id: productId, productId, quantity, sample, price, snapshot: productId };
}
function order(overrides: Partial<SalesOrder> = {}): SalesOrder {
  return { id: 'order', number: 'SO-1', status: 'pending', updatedAt: 'v1', date: '2026-11-25', dueDate: null,
    url: null, editable: true, locationId: 'warehouse', rows: [row('roll', 8), row('excluded', 5)], snapshot: 'v1', ...overrides };
}

describe('first-order sample plan', () => {
  it('reserves demand on the purchase, excludes Excluded Brand, and honors an earlier display of a different SKU', () => {
    const historic = order({ id: 'old', status: 'completed', rows: [row('old-display', 1, false, 0.01)] });
    const result = planSamples([order(), historic], catalog, false, policy);
    expect(result.lines.map(({ productId, quantity }) => [productId, quantity])).toEqual([
      ['roll', 1], ['rosin', 1], ['mood', 1],
    ]);
    expect(result.skipped).toContain('Example Roll already has a display.');
  });

  it('subtracts samples already added and picks the best-stocked verified gummy in its own group', () => {
    const saved = order({ rows: [row('roll', 1), { ...row('roll', 2, true), id: 'existing' }] });
    const result = planSamples([saved], [...catalog, product('mood-top', 'Example Gummies', 'gummy:mood', 12)], false, policy);
    expect(result.lines.map(({ productId, quantity }) => [productId, quantity])).toEqual([
      ['roll', 3], ['rosin', 1], ['mood-top', 1], ['display', 1],
    ]);
  });

  it('blocks commercial reorders and recorded purchases in another channel', () => {
    const earlier = order({ id: 'old', status: 'complete', date: '2026-11-02' });
    expect(planSamples([order(), earlier], catalog, false, policy).lines).toEqual([]);
    expect(planSamples([order(), { ...earlier, status: 'pending' }], catalog, false, policy).lines).toEqual([]);
    expect(planSamples([order()], catalog, true, policy).lines).toEqual([]);
  });

  it('plans a split first purchase on its Net 30 order, pooling both orders', () => {
    const cod = order({ id: 'cod', number: 'SO-2', dueDate: '2026-11-25', rows: [row('roll', 2)] });
    const net30 = order({ id: 'net30', number: 'SO-3', dueDate: '2026-12-25', rows: [row('roll', 2)] });
    const result = planSamples([cod, net30], catalog, false, policy);
    expect(result.order?.number).toBe('SO-3');
    expect(result.lines.map(({ productId, quantity }) => [productId, quantity])).toEqual([
      ['roll', 5], ['rosin', 1], ['mood', 1], ['display', 1],
    ]);
  });

  it('never substitutes an unordered strain when the ordered SKU runs out', () => {
    const orderedRoll = product('roll-a', 'Example Roll', 'pre-roll', 8);
    const otherRoll = product('roll-b', 'Example Roll', 'pre-roll', 10);
    const result = planSamples(
      [order({ rows: [row('roll-a', 8)] })],
      [...catalog, orderedRoll, otherRoll], false, policy);
    expect(result.lines.some(line => line.productId === 'roll-b')).toBe(false);
    expect(result.skipped).toContain('Example Roll: 5 pre-roll units unavailable.');
  });

  it('plans a display for a samples-excluded brand that was ordered, without sampling it', () => {
    const excludedDisplay = product('excluded-display', 'Excluded Brand', 'display', 3);
    const result = planSamples([order()], [...catalog, excludedDisplay], false, policy);
    expect(result.lines.map(({ productId }) => productId)).toContain('excluded-display');
    expect(result.lines.some(line => line.productId === 'excluded')).toBe(false);
  });

  it('refuses a non-editable order and never offers a display when past product classification is missing', () => {
    expect(planSamples([order({ editable: false })], catalog, false, policy).lines).toEqual([]);
    const historic = order({ id: 'old', status: 'completed', rows: [row('unresolved', 1, true)] });
    expect(planSamples([order(), historic], catalog, false, policy).lines.some(line => line.kind === 'display')).toBe(false);
  });
});
