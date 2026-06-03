import { expect, test } from '@playwright/test';

const activeRoutes = ['/home', '/accounts', '/route', '/dashboard', '/settings'];
const retiredRoutes = ['/vendor-days', '/request-vendor-day'];
const retiredApis = ['/api/vendor-days', '/api/vendor-days/calendar', '/api/vendor-days/public-request', '/api/payroll', '/api/settings/worker-supply', '/api/reports/vendor-days'];

test.describe('active app smoke', () => {
  async function mockTerritoryStores(page: import('@playwright/test').Page) {
    await page.route('**/api/territory/stores**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          stores: [],
          filters: {
            statuses: [],
            reps: [],
            pppStatuses: [],
            headsetConnectionStatuses: [],
            preferredPartners: [],
            referralSources: [],
            locationAvailability: [],
            vendorDayStatuses: [{ value: 'Requested', count: 1 }],
          },
          meta: {
            dataSource: 'notion-live-cache',
            lastEditedMax: null,
            recordsRead: 0,
            unresolvedLocationCount: 0,
            geocodedThisRequest: 0,
            syncedAt: null,
            stale: false,
            syncing: false,
            syncError: null,
          },
        }),
      });
    });
  }

  for (const route of activeRoutes) {
    test(`${route} loads`, async ({ page }) => {
      const response = await page.goto(route);
      expect(response?.status(), route).toBeLessThan(400);
      await expect(page.locator('body')).not.toContainText('This page could not be found');
    });
  }

  test('/home has no retired Vendor Day dispatch links or cards', async ({ page }) => {
    await page.goto('/home');

    await expect(page.locator('a[href*="/vendor-days"]')).toHaveCount(0);
    await expect(page.locator('body')).not.toContainText('Open Offers');
    await expect(page.locator('body')).not.toContainText('View History');
    await expect(page.locator('body')).not.toContainText('Open Queue');
    await expect(page.locator('body')).not.toContainText('dispatch-ready');
    await expect(page.locator('body')).not.toContainText('ready to dispatch');
  });

  test('/territory still exposes Vendor Day Status filtering', async ({ page }) => {
    await mockTerritoryStores(page);
    await page.goto('/territory');
    await page.getByRole('button', { name: /filters/i }).first().click();
    await expect(page.getByText('Vendor Day Status')).toBeVisible();
  });

  for (const route of retiredRoutes) {
    test(`${route} is retired`, async ({ page }) => {
      const response = await page.goto(route);
      expect(response?.status(), route).toBe(404);
    });
  }

  for (const route of retiredApis) {
    test(`${route} API is retired`, async ({ request }) => {
      const response = await request.get(route);
      expect(response.status(), route).toBe(404);
    });
  }
});
