import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ensureDispensaryCrmPageFromRetailer } from '@/lib/server/notion-crm-sync';

const originalEnv = process.env;

function jsonResponse(payload: unknown) {
  return Promise.resolve(new Response(JSON.stringify(payload), { status: 200 }));
}

function retailerInput() {
  return {
    licensedLocationId: 'nabis-licensed-location-1',
    nabisRetailerId: 'retailer-1',
    licenseNumber: 'OCM-CAURD-24-000001-D1',
    name: 'Nabis Store',
    doingBusinessAs: 'Nabis DBA',
    address1: '1 Main St',
    city: 'Brooklyn',
    state: 'NY',
    zipcode: '11201',
    hasOrders: true,
  };
}

describe('Notion CRM retailer mirroring', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    process.env = {
      ...originalEnv,
      NOTION_API_KEY: 'test-notion-key',
      NOTION_MASTER_LIST_DATABASE_ID: 'master-list-db',
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.env = originalEnv;
  });

  it('does not update an existing CRM page matched by Licensed Location ID', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.endsWith('/databases/master-list-db/query')) {
        return jsonResponse({ results: [{ id: 'existing-page-id' }] });
      }
      throw new Error(`Unexpected Notion request: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await ensureDispensaryCrmPageFromRetailer(retailerInput());

    expect(result).toEqual({
      pageId: 'existing-page-id',
      created: false,
      updated: false,
      skippedExisting: true,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: 'POST' });
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toMatchObject({
      filter: {
        property: 'Licensed Location ID',
        rich_text: {
          equals: 'nabis-licensed-location-1',
        },
      },
    });
  });

  it('creates a CRM page only when no Licensed Location ID match exists', async () => {
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(() => jsonResponse({ results: [] }))
      .mockImplementationOnce((url: string, init: RequestInit) => {
        expect(url).toBe('https://api.notion.com/v1/pages');
        expect(init.method).toBe('POST');
        return jsonResponse({ id: 'created-page-id' });
      });
    vi.stubGlobal('fetch', fetchMock);

    const result = await ensureDispensaryCrmPageFromRetailer(retailerInput());

    expect(result).toEqual({
      pageId: 'created-page-id',
      created: true,
      updated: false,
      skippedExisting: false,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
