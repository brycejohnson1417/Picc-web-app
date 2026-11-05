import { expect, test } from '@playwright/test';

test('refreshes accounts and cached empty map layers in one action', async ({ page }) => {
  const stores = {
    stores: [],
    filters: { statuses: [], reps: [], pppStatuses: [], headsetConnectionStatuses: [], preferredPartners: [], referralSources: [], locationAvailability: [], vendorDayStatuses: [] },
    meta: { dataSource: 'notion-live-cache', lastEditedMax: null, recordsRead: 0, unresolvedLocationCount: 0, geocodedThisRequest: 0, syncedAt: null, stale: false, syncing: false, syncError: null },
  };
  const requests = { stores: 0, boundaries: 0, markers: 0 };
  let forcedStoreRefresh = false;
  await page.route('**/api/territory/stores?**', route => {
    requests.stores += 1;
    forcedStoreRefresh = new URL(route.request().url()).searchParams.get('refresh') === '1';
    return route.fulfill({ json: stores });
  });
  await page.route('**/api/territory/boundaries', route => {
    requests.boundaries += 1;
    return route.fulfill({ json: { boundaries: [{
      id: 'refresh-boundary', name: 'Refreshed territory', description: null,
      color: '#1746ff', borderWidth: 2, isVisibleByDefault: true,
      coordinates: [[-74.01, 40.71], [-74, 40.72], [-73.99, 40.71]],
      createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
    }] } });
  });
  await page.route('**/api/territory/markers', route => {
    requests.markers += 1;
    return route.fulfill({ json: { markers: [{
      id: 'refresh-marker', name: 'Refreshed home marker', description: null,
      address: null, lat: 40.71, lng: -74.01, color: '#1746ff', isVisibleByDefault: true,
      createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
    }] } });
  });
  await page.route('**/api/territory/saved-routes', route => route.fulfill({ json: { routes: [] } }));
  await page.addInitScript((cachedStores) => {
    sessionStorage.clear();
    localStorage.clear();
    const cachedAt = Date.now();
    for (const [url, payload] of [
      ['/api/territory/stores?', cachedStores],
      ['/api/territory/boundaries', { boundaries: [] }],
      ['/api/territory/markers', { markers: [] }],
    ]) sessionStorage.setItem(`picc:territory-cache:v2:${url}`, JSON.stringify({ cachedAt, payload }));
  }, stores);

  await page.goto('/territory');
  await page.getByRole('button', { name: 'Open territory layers' }).click();
  await expect(page.getByText('No territory boundaries have been saved yet.')).toBeVisible();
  await expect(page.getByText('No rep home markers have been saved yet.')).toBeVisible();
  await page.getByRole('button', { name: 'Close territory layers' }).click();
  expect(requests).toEqual({ stores: 0, boundaries: 0, markers: 0 });

  await page.getByRole('button', { name: 'Refresh territory data' }).click();
  await expect.poll(() => requests).toEqual({ stores: 1, boundaries: 1, markers: 1 });
  expect(forcedStoreRefresh).toBe(true);
  await page.getByRole('button', { name: 'Open territory layers' }).click();
  await expect(page.getByText('Refreshed territory', { exact: true })).toBeVisible();
  await expect(page.getByText('Refreshed home marker', { exact: true })).toBeVisible();
  const cachedCounts = await page.evaluate(() => [
    JSON.parse(sessionStorage.getItem('picc:territory-cache:v2:/api/territory/boundaries')!).payload.boundaries.length,
    JSON.parse(sessionStorage.getItem('picc:territory-cache:v2:/api/territory/markers')!).payload.markers.length,
  ]);
  expect(cachedCounts).toEqual([1, 1]);

  await page.getByRole('button', { name: 'Close territory layers' }).click();
  await page.getByRole('button', { name: 'Start lasso selection' }).click();
  await page.getByRole('button', { name: 'Pause Lasso', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Resume Lasso', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Clear lasso selection' })).toBeVisible();
  await page.getByRole('button', { name: 'Resume Lasso', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Pause Lasso', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Clear lasso selection' }).click();
  await expect(page.getByRole('button', { name: 'Start lasso selection' })).toBeVisible();
});
