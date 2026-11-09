import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  cachedGeocode: vi.fn(),
  cacheGeocode: vi.fn(),
  readSnapshot: vi.fn(),
  writeSnapshot: vi.fn(),
  syncReadModel: vi.fn(),
  readModel: vi.fn(),
}));

vi.mock('@/lib/db/prisma', () => ({ prisma: { spatialGeocodeCache: {
  findUnique: mocks.cachedGeocode, upsert: mocks.cacheGeocode,
} } }));
vi.mock('@/lib/server/notion-cache-store', () => ({
  getSyncTtlMinutes: () => 5,
  isSnapshotStale: () => false,
  readNotionCacheSnapshot: mocks.readSnapshot,
  writeNotionCacheSnapshot: mocks.writeSnapshot,
}));
vi.mock('@/lib/server/territory-read-model', async (original) => ({
  ...await original<typeof import('@/lib/server/territory-read-model')>(),
  syncTerritoryStoresReadModel: mocks.syncReadModel,
  loadTerritoryStoresFromReadModel: mocks.readModel,
}));
vi.mock('@/lib/server/google-usage', () => ({
  checkGoogleBudgetCap: async () => ({ allowed: true }),
  estimateGoogleUsageCostUsd: () => 0.005,
  recordGoogleUsage: async () => undefined,
}));

const originalEnv = process.env;
const fullAddress = '123 Main St, Suite 4, Albany, NY 12207';
const schema = (withPlace = true) => ({ properties: {
  'Dispensary Name': { type: 'title' },
  'Full Address': { type: 'rich_text' },
  'Account Status': { type: 'status' },
  Rep: { type: 'people' },
  ...(withPlace ? { 'Map Location': { type: 'place' } } : {}),
} });
function store(address: string | null = fullAddress) {
  return { id: 'store-1', last_edited_time: '2026-11-09T12:00:00Z', properties: {
    'Dispensary Name': { title: [{ plain_text: 'Address Store' }] },
    'Full Address': { rich_text: address ? [{ plain_text: address }] : [] },
    'Address 1': { rich_text: [{ plain_text: '999 Old Road' }] },
    City: { rich_text: [{ plain_text: 'Buffalo' }] },
    'Map Location': { place: { lat: 43, lon: -78, name: 'Old location', address: '999 Old Road, Buffalo, NY 14201' } },
  } };
}
function notionResponses(rows = [store()], database = schema()) {
  mocks.fetch.mockImplementation(async (url: string) => {
    if (url.includes('/query')) return Response.json({ results: rows, has_more: false });
    if (url.includes('/databases/')) return Response.json(database);
    throw new Error('Unexpected external request');
  });
}

describe('territory canonical address location', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env = { ...originalEnv, NOTION_API_KEY: 'test-token', NOTION_TOKEN: 'test-token',
      NOTION_MASTER_LIST_DATABASE_ID: 'test-database', GOOGLE_MAPS_API_KEY: 'test-key' };
    vi.stubGlobal('fetch', mocks.fetch);
    mocks.readSnapshot.mockResolvedValue(null);
    mocks.readModel.mockResolvedValue({ stores: [], recordsRead: 0 });
    mocks.cachedGeocode.mockResolvedValue({ lat: 42.65, lng: -73.75, formattedAddress: '123 Main St, Albany, NY 12207, USA' });
    notionResponses();
  });
  afterEach(() => { process.env = originalEnv; vi.unstubAllGlobals(); });

  it('accepts a schema after Map Location has been removed', async () => {
    notionResponses([], schema(false));
    const { territoryConnectionCheck } = await import('./notion-territory');
    expect(await territoryConnectionCheck()).toMatchObject({ ok: true, missingFields: [] });
  });

  it('requires Full Address even when the legacy place property exists', async () => {
    const database = schema();
    delete (database.properties as Record<string, unknown>)['Full Address'];
    notionResponses([], database);
    const { territoryConnectionCheck } = await import('./notion-territory');
    expect(await territoryConnectionCheck()).toMatchObject({ ok: false, missingFields: ['Full Address'] });
  });

  it('resolves coordinates and preserves suite details from Full Address despite stale place data', async () => {
    const { getCachedTerritoryStores } = await import('./notion-territory');
    const result = await getCachedTerritoryStores({ refresh: true });
    expect(result.stores[0]).toMatchObject({ lat: 42.65, lng: -73.75,
      locationLabel: fullAddress, locationAddress: fullAddress,
      locationSource: 'google-address-cache', locationPrecision: 'address', isApproximate: false,
      city: 'Albany', state: 'NY' });
  });

  it('uses a different geocode cache entry when Full Address changes', async () => {
    mocks.cachedGeocode.mockImplementation(async ({ where }: { where: { addressNormalized: string } }) => ({
      lat: where.addressNormalized.includes('456') ? 42.7 : 42.65, lng: -73.75,
    }));
    const { getCachedTerritoryStores } = await import('./notion-territory');
    const before = await getCachedTerritoryStores({ refresh: true });
    notionResponses([store('456 Main St, Albany, NY 12207')]);
    const after = await getCachedTerritoryStores({ refresh: true });
    expect([before.stores[0].lat, after.stores[0].lat]).toEqual([42.65, 42.7]);
  });

  it('keeps a missing Full Address unavailable rather than using old place or separate city fields', async () => {
    notionResponses([store(null)]);
    const { getCachedTerritoryStores } = await import('./notion-territory');
    const result = await getCachedTerritoryStores({ refresh: true });
    expect(result.stores[0]).toMatchObject({ locationPrecision: 'unavailable', locationSource: 'unavailable', isApproximate: true });
    expect(mocks.cachedGeocode).not.toHaveBeenCalled();
  });

  it('does not substitute a legacy place when live lookup budget is zero', async () => {
    mocks.cachedGeocode.mockResolvedValue(null);
    const { prewarmTerritoryGeocodeCache } = await import('./notion-territory');
    const result = await prewarmTerritoryGeocodeCache({ action: 'sync_only', maxLiveGeocodeLookups: 0 });
    expect(result).toMatchObject({ warmedLookups: 0, unresolvedLocationCount: 1, approximateCount: 1 });
  });

  it('does not reuse the legacy place-based snapshot on the first address-only load', async () => {
    const legacyPin = { id: 'store-1', notionPageId: 'store-1', lat: 43, lng: -78,
      locationSource: 'notion-place', pppStatus: null, headsetConnectionStatus: null };
    mocks.readSnapshot.mockImplementation(async (key: string) => key === 'territory-stores-v3' ? {
      key, payload: [legacyPin], recordsRead: 1, syncedAt: new Date().toISOString(), lastEditedMax: null,
    } : null);
    const { getCachedTerritoryStores } = await import('./notion-territory');
    const result = await getCachedTerritoryStores();
    expect(result.stores[0]).toMatchObject({ lat: 42.65, locationSource: 'google-address-cache' });
  });

  it('derives the city from the comma-separated canonical address without separate city fields', async () => {
    notionResponses([store('123 Main St, Albany, NY, 12207')]);
    const { getCachedTerritoryStores } = await import('./notion-territory');
    const result = await getCachedTerritoryStores({ refresh: true });
    expect(result.stores[0]).toMatchObject({ city: 'Albany', state: 'NY' });
  });

  it('uses the canonical snapshot location even if the read model still contains old place coordinates', async () => {
    process.env.TERRITORY_ORG_ID = 'test-org';
    process.env.DEMO_MODE = 'false';
    mocks.readModel.mockResolvedValue({ stores: [{
      id: 'store-1', notionPageId: 'store-1', name: 'Address Store', status: 'Customer',
      statusKey: 'customer', repNames: [], repEmails: [],
      lat: 43, lng: -78, locationSource: 'notion-place', locationPrecision: 'exact',
      locationAddress: '999 Old Road', isApproximate: false,
    }], recordsRead: 1 });
    const { loadTerritoryStores } = await import('./notion-territory');
    const result = await loadTerritoryStores({ orgId: 'test-org', refresh: true });
    expect(result.stores[0]).toMatchObject({ lat: 42.65, lng: -73.75,
      locationAddress: fullAddress, locationSource: 'google-address-cache', locationPrecision: 'address' });
  });

  it('marks a cached city-only answer as approximate instead of a verified address pin', async () => {
    mocks.cachedGeocode.mockResolvedValue({ lat: 42.65, lng: -73.75, formattedAddress: 'Albany, NY 12207, USA' });
    const { getCachedTerritoryStores } = await import('./notion-territory');
    const result = await getCachedTerritoryStores({ refresh: true });
    expect(result.stores[0]).toMatchObject({ locationPrecision: 'city', isApproximate: true });
  });

  it('does not mark a live street-only geocoder response as an address pin', async () => {
    mocks.cachedGeocode.mockResolvedValue(null);
    process.env.GOOGLE_GEOCODING_API_KEY = 'test-geocoding-key';
    const prior = mocks.fetch.getMockImplementation()!;
    mocks.fetch.mockImplementation(async (url: string) => url.includes('/geocode/json') ? Response.json({
      status: 'OK', results: [{ formatted_address: 'Main St, Albany, NY 12207, USA',
        address_components: [{ short_name: 'NY', types: ['administrative_area_level_1'] }],
        geometry: { location: { lat: 42.65, lng: -73.75 } } }],
    }) : prior(url));
    const { getCachedTerritoryStores } = await import('./notion-territory');
    const result = await getCachedTerritoryStores({ refresh: true });
    expect(result.stores[0]).toMatchObject({ locationPrecision: 'city', isApproximate: true });
  });
});
