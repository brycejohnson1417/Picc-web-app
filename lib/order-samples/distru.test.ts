import { describe, expect, it, vi } from 'vitest';
import { classifySampleProduct } from './distru';
import type { SamplePolicy } from './plan';

vi.mock('server-only', () => ({}));

const policy: SamplePolicy = {
  unitPriceCents: 1, preRollCap: 5, preRollBrands: ['Example Roll', 'Example Hash', 'Example Half'],
  brandAliases: { 'Example Gummies': ['Example Edible Co'] }, exclusions: [],
  gummyBrand: 'Example Gummies', gummyGroups: [{ label: 'rosin', terms: ['rosin'] }, { label: 'mood', terms: ['sleep'] }],
};

function candidate(name: string, weight: string | null = '1') {
  return { id: 'product', sku: 'SKU', name, brand: { id: 'house', name: 'PICC' }, unitType: { id: 'unit', name: 'Unit' },
    unitNetWeight: weight, unitNetWeightAndServingSizeUnitType: { id: 'gram', name: 'Gram' } };
}

describe('Distru sample catalog classification', () => {
  it('recognizes branded single units and rejects multipacks and half-gram packs', () => {
    expect(classifySampleProduct(candidate('EXAMPLE-ROLL | Uninfused Pre-roll | 1g Single'), 20, policy))
      .toMatchObject({ kind: 'pre-roll', brand: 'Example Roll', available: 20 });
    expect(classifySampleProduct(candidate('EXAMPLE HASH | Hash Hole | 1g Single'), 20, policy))
      .toMatchObject({ kind: 'pre-roll', brand: 'Example Hash' });
    expect(classifySampleProduct(candidate('EXAMPLE-ROLL | Uninfused Pre-roll | 1g 4-Pack', '4'), 20, policy).kind).toBe('other');
    expect(classifySampleProduct(candidate('EXAMPLE HALF | Uninfused Pre-roll | .5g 2-Pack'), 20, policy).kind).toBe('other');
  });

  it('treats the Chopsticks twin 0.5g pack as the brand 1G unit', () => {
    const chopPolicy: SamplePolicy = { ...policy, preRollBrands: ['Chopsticks'], exclusions: [] };
    expect(classifySampleProduct(candidate('CHOPSTICKS | Uninfused Pre-roll | .5g 2-Pack (1g)'), 20, chopPolicy))
      .toMatchObject({ kind: 'pre-roll', brand: 'Chopsticks' });
  });

  it('separates the two gummy lines and honors the catalog count unit', () => {
    expect(classifySampleProduct(candidate('Example Edible Co | Hash Rosin Infused Gummies', null), 15, policy))
      .toMatchObject({ kind: 'gummy:rosin', brand: 'Example Gummies', available: 15 });
    expect(classifySampleProduct(candidate('Example Edible Co | Sleep | Gummies', null), 15, policy).kind).toBe('gummy:mood');
    expect(classifySampleProduct(candidate('Example Gummies Uninfused Sample Packs', null), 15, policy).kind).toBe('other');
    expect(classifySampleProduct({ ...candidate('EXAMPLE-ROLL | 1g Pre-roll'), unitType: { id: 'case', name: 'Case' } }, 15, policy).available).toBe(0);
  });
});
