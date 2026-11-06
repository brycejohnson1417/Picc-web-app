import { describe, expect, it } from 'vitest';
import { decimalInputToInteger, summarizeProposal, validateProposal, proposalFingerprint, type ProposalLine } from './distru-proposal';

const line = (overrides: Partial<ProposalLine> = {}): ProposalLine => ({
  productId: 'product-one', name: 'Product One', brand: 'Brand One', sku: 'SKU-1',
  unitsPerCase: 5, cases: 1, unitPriceCents: 1600, discountBps: 2000,
  paymentTerms: 'Net 30', ...overrides,
});

describe('proposal arithmetic and validation', () => {
  it('parses prices and percentage inputs without floating point truncation', () => {
    expect(decimalInputToInteger('1.10')).toBe(110);
    expect(decimalInputToInteger('10.25')).toBe(1025);
    expect(Number.isNaN(decimalInputToInteger('1.005'))).toBe(true);
    expect(Number.isNaN(decimalInputToInteger('-1'))).toBe(true);
  });
  it('calculates multiple cases and distinct line discounts without discounting twice', () => {
    const result = summarizeProposal([
      line({ cases: 3 }), line({ productId: 'two', unitsPerCase: 10, unitPriceCents: 450, discountBps: 1000 }),
    ]);
    expect(result).toEqual({ products: 2, cases: 4, units: 25, regularCents: 28500, savingsCents: 5250, netCents: 23250 });
  });

  it('rounds each line discount to a cent before summing', () => {
    const result = summarizeProposal([line({ unitsPerCase: 1, unitPriceCents: 105, discountBps: 1000 }), line({ productId: 'two', unitsPerCase: 1, unitPriceCents: 105, discountBps: 1000 })]);
    expect(result.savingsCents).toBe(22);
    expect(result.netCents).toBe(188);
  });

  it('rejects fractional quantities, invalid discounts, duplicate products and missing terms', () => {
    expect(validateProposal([line({ cases: 1.5 })]).join(' ')).toContain('whole cases');
    expect(validateProposal([line({ discountBps: 10001 })]).join(' ')).toContain('Discount');
    expect(validateProposal([line(), line()]).join(' ')).toContain('Duplicate');
    expect(validateProposal([line({ paymentTerms: '' })]).join(' ')).toContain('terms');
  });

  it('keeps COD-only restrictions and unresolved catalog decisions explicit', () => {
    expect(validateProposal([line({ codOnly: true })]).join(' ')).toContain('COD');
    expect(validateProposal([line({ requiresConfirmation: true })]).join(' ')).toContain('Confirm');
    expect(validateProposal([line({ codOnly: true, paymentTerms: 'COD', requiresConfirmation: true, confirmed: true })])).toEqual([]);
  });

  it('rejects unsafe prices and arithmetic overflow instead of displaying corrupt money', () => {
    expect(validateProposal([line({ unitPriceCents: NaN })]).length).toBeGreaterThan(0);
    expect(() => summarizeProposal([line({ cases: Number.MAX_SAFE_INTEGER })])).toThrow('range');
  });

  it('readback comparison catches quantity, price, terms or discount changes but ignores ordering', () => {
    const a = { lines: [line(), line({ productId: 'two' })], terms: 'Net 30', notes: '' };
    expect(proposalFingerprint(a)).toBe(proposalFingerprint({ ...a, lines: [...a.lines].reverse() }));
    expect(proposalFingerprint(a)).not.toBe(proposalFingerprint({ ...a, lines: [line({ cases: 2 }), a.lines[1]] }));
    expect(proposalFingerprint(a)).not.toBe(proposalFingerprint({ ...a, lines: [line({ paymentTerms: 'COD' }), a.lines[1]] }));
  });
});

 it('rejects proposals above available stock, including zero stock', () => {
   expect(validateProposal([line({cases: 3, availableUnits: 10})]).join(' ')).toContain('available');
   expect(validateProposal([line({availableUnits: 0})]).join(' ')).toContain('available');
   expect(validateProposal([line({cases: 2, availableUnits: 10})])).toEqual([]);
 });
