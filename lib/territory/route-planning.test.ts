import { describe, expect, it } from 'vitest';
import { completeRouteOrder, hasCompleteRouteOrder, orderRouteStops, splitRouteLegs } from './route-planning';

const stores = Array.from({ length: 50 }, (_, i) => ({ id: `s${i}`, name: `Store ${i}`, lat: 40 + i * .001, lng: -74 }));
describe('complete route selection', () => {
  it('recovers all 27 selected stores from an old four-stop order', () => {
    const selected = stores.slice(0, 27).map(s => s.id);
    expect(completeRouteOrder(selected, selected.slice(0, 4))).toEqual(selected);
    expect(hasCompleteRouteOrder(selected, selected.slice(0, 4))).toBe(false);
  });
  it('preserves manual ordering, appends new stops and removes stale/duplicate IDs', () => {
    expect(completeRouteOrder(['a', 'b', 'c'], ['b', 'old', 'b', 'a'])).toEqual(['b', 'a', 'c']);
    expect(hasCompleteRouteOrder(['a', 'b'], ['a', 'a'])).toBe(false);
  });
});
describe('large route planning', () => {
  it('visits all 50 stores exactly once from the supplied origin', () => {
    const origin = { id: '__origin__', name: 'Start', lat: 40.06, lng: -74 };
    const ordered = orderRouteStops(stores, origin);
    expect(ordered[0]).toEqual(origin);
    expect(ordered[1].id).toBe('s49');
    expect(new Set(ordered.slice(1).map(s => s.id)).size).toBe(50);
    const batches = splitRouteLegs(ordered, 25);
    expect(batches.every(b => b.length <= 25)).toBe(true);
    expect(batches.flatMap(b => b.slice(1)).map(s => s.id)).toEqual(ordered.slice(1).map(s => s.id));
  });
  it('keeps first store fixed without a separate origin', () => {
    expect(orderRouteStops(stores)[0]).toEqual(stores[0]);
  });
});
