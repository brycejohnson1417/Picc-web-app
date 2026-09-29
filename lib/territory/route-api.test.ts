import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('@/lib/auth/territory-access', () => ({ requireTerritoryApiAccess: vi.fn(async () => ({ orgId: 'test', email: 'test@example.com' })) }));
vi.mock('@/lib/server/google-usage', () => ({ checkGoogleBudgetCap: vi.fn(async () => ({ allowed: true })), estimateGoogleUsageCostUsd: () => 0, recordGoogleUsage: vi.fn(async () => {}) }));
vi.mock('@/lib/server/google-geocode', () => ({ geocodeAddress: vi.fn(async () => ({ lat: 40.1, lng: -74, formattedAddress: 'Starting address' })) }));
import { POST } from '@/app/api/territory/optimize-route/route';
const stops = Array.from({length: 50}, (_, i) => ({id: `s${i}`, name: `Stop ${i}`, lat: 40+i*.001, lng: -74}));
beforeEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
it('accepts 50 stores plus an origin without dropping stores', async () => {
  const response = await POST(new Request('http://local/api', { method: 'POST', body: JSON.stringify({ mode: 'transit', stops, origin: { name: 'Start', lat: 40.1, lng: -74 } }) }));
  expect(response!.status).toBe(200);
  const data = await response!.json();
  expect(data.orderedStopIds).toHaveLength(50);
  expect(data.legs).toHaveLength(50);
  expect(data.origin.name).toBe('Start');
});
it('rejects 51 stores and duplicate IDs', async () => {
  for (const invalid of [[...stops, {...stops[0], id:'extra'}], [stops[0],stops[0]]]) {
    const response = await POST(new Request('http://local/api', { method: 'POST', body: JSON.stringify({ mode: 'car', stops: invalid }) }));
    expect(response!.status).toBe(400);
  }
});
it('joins all Google road sections including connecting legs and origin', async () => {
  vi.stubEnv('GOOGLE_ROUTES_API_KEY', 'test-only');
  const requests: Array<{ intermediates: unknown[] }> = [];
  vi.stubGlobal('fetch', vi.fn(async (_url, options) => {
    const body = JSON.parse(options.body); requests.push(body);
    const count = body.intermediates.length + 1;
    return new Response(JSON.stringify({ routes: [{ legs: Array.from({length:count},()=>({distanceMeters:100,duration:'60s'})), distanceMeters: count*100, duration:`${count*60}s`, optimizedIntermediateWaypointIndex: body.intermediates.map((_:unknown,i:number)=>i) }] }), {status:200});
  }));
  const response = await POST(new Request('http://local/api', {method:'POST',body:JSON.stringify({mode:'car',stops,origin:{name:'Start',lat:40.1,lng:-74}})}));
  expect(response!.status).toBe(200);
  const data = await response!.json();
  expect(requests).toHaveLength(3);
  expect(requests.every(r=>r.intermediates.length<=25)).toBe(true);
  expect(new Set(data.orderedStopIds).size).toBe(50);
  expect(data.legs).toHaveLength(50);
  expect(data.totalDistanceMeters).toBe(5000);
  expect(data.totalDurationSeconds).toBe(3000);
  expect(data.estimationModel).toBe('google-routes');
});
it('labels the entire route estimated when a provider section fails', async () => {
  vi.stubEnv('GOOGLE_ROUTES_API_KEY','test-only');
  vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify({error:{message:'Provider unavailable'}}),{status:503})));
  const response = await POST(new Request('http://local/api',{method:'POST',body:JSON.stringify({mode:'car',stops})}));
  const data = await response!.json();
  expect(data.orderedStopIds).toHaveLength(50);
  expect(data.legs).toHaveLength(49);
  expect(data.estimationModel).toBe('fallback-order');
  expect(data.warning).toContain('Provider unavailable');
});
it('rejects invalid coordinates',async()=>{
  const response = await POST(new Request('http://local/api',{method:'POST',body:JSON.stringify({mode:'car',stops:[{...stops[0],lat:91},stops[1]]})}));
  expect(response!.status).toBe(400);
});
