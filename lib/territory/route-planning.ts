export const MAX_ROUTE_STORES = 50;
export const ROUTE_ORIGIN_ID = '__route_origin__';
export interface RouteLocation { name: string; lat: number; lng: number }
export interface RouteStop extends RouteLocation { id: string }

export function completeRouteOrder(selected: string[], ordered: string[]) {
  const selectedSet = new Set(selected.filter(Boolean));
  return [...new Set([...ordered.filter(id => selectedSet.has(id)), ...selectedSet])];
}

export function hasCompleteRouteOrder(selected: string[], ordered: string[]) {
  return selected.length === ordered.length && new Set(ordered).size === selected.length && ordered.every(id => selected.includes(id));
}

export function validRouteLocation(value: unknown): value is RouteLocation {
  if (!value || typeof value !== 'object') return false;
  const p = value as RouteLocation;
  return typeof p.name === 'string' && !!p.name.trim() && Number.isFinite(p.lat) && Math.abs(p.lat) <= 90 && Number.isFinite(p.lng) && Math.abs(p.lng) <= 180;
}

function distance(a: RouteLocation, b: RouteLocation) {
  const rad = Math.PI / 180;
  const h = Math.sin((b.lat-a.lat)*rad/2)**2 + Math.cos(a.lat*rad)*Math.cos(b.lat*rad)*Math.sin((b.lng-a.lng)*rad/2)**2;
  return 2 * Math.asin(Math.sqrt(Math.min(1, h)));
}

// Nearest-neighbor seed followed by bounded 2-opt improvement, with a fixed origin
// and a free endpoint. Google refines road ordering within provider-sized batches.
export function orderRouteStops(stops: RouteStop[], origin?: RouteStop) {
  if (!stops.length) return origin ? [origin] : [];
  const remaining = origin ? [...stops] : stops.slice(1);
  const ordered = [origin ?? stops[0]];
  while (remaining.length) {
    let best = 0;
    for (let i = 1; i < remaining.length; i++) {
      if (distance(ordered[ordered.length-1], remaining[i]) < distance(ordered[ordered.length-1], remaining[best])) best = i;
    }
    ordered.push(remaining.splice(best, 1)[0]);
  }
  for (let pass = 0; pass < 10; pass++) {
    let improved = false;
    for (let i = 1; i < ordered.length - 1; i++) {
      for (let j = i + 1; j < ordered.length; j++) {
        const before = distance(ordered[i-1], ordered[i]) + (ordered[j+1] ? distance(ordered[j], ordered[j+1]) : 0);
        const after = distance(ordered[i-1], ordered[j]) + (ordered[j+1] ? distance(ordered[i], ordered[j+1]) : 0);
        if (after < before - 1e-10) {
          ordered.splice(i, j-i+1, ...ordered.slice(i,j+1).reverse());
          improved = true;
        }
      }
    }
    if (!improved) break;
  }
  return ordered;
}

export function splitRouteLegs<T>(stops: T[], maxPoints = 25): T[][] {
  if (maxPoints < 2) throw new Error('A route segment needs at least two points');
  const batches: T[][] = [];
  for (let i = 0; i < stops.length-1; i += maxPoints-1) batches.push(stops.slice(i, i+maxPoints));
  return batches;
}
