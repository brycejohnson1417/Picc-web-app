import { expect, test, type Page } from '@playwright/test';

function store(id: string, name: string) {
  return { id, notionPageId: id, name, status: 'Lead - Hot', statusKey: 'lead-hot', statusColor: '#f97316', pinKind: 'lead', repNames: [], repEmails: [], lat: 40.7128, lng: -74.006, locationLabel: 'New York', locationAddress: 'New York, NY', locationSource: 'notion-place', locationPrecision: 'exact', isApproximate: false, lastEditedTime: null, city: 'New York', state: 'NY', referralSource: null };
}

async function delayedFocus(page: Page, savedDetail: string | null) {
  const linked = store('linked', 'Linked Account');
  const alternate = store('alternate', 'Alternate Account');
  const detail = (account: typeof linked) => ({ store: account, contacts: [], checkIns: [], crm: {}, analytics: { monthly: [], recentOrders: [], orders: [] }, history: { accountUpdates: [] } });
  let release!: () => void;
  const waitForRelease = new Promise<void>(resolve => { release = resolve; });
  let started = false;
  let completed = false;
  await page.route('**/api/territory/stores**', async route => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname.endsWith('/linked')) {
      started = true;
      await waitForRelease;
      await route.fulfill({ json: detail(linked) }).catch(() => undefined);
      completed = true;
    } else if (pathname.endsWith('/alternate')) {
      await route.fulfill({ json: detail(alternate) });
    } else {
      await route.fulfill({ json: { stores: [linked, alternate], filters: { statuses: [], reps: [], pppStatuses: [], headsetConnectionStatuses: [], preferredPartners: [], referralSources: [], locationAvailability: [], vendorDayStatuses: [] }, meta: { dataSource: 'notion-live-cache', recordsRead: 2, stale: false } } });
    }
  });
  await page.route('**/api/territory/boundaries', route => route.fulfill({ json: { boundaries: [] } }));
  await page.route('**/api/territory/markers', route => route.fulfill({ json: { markers: [] } }));
  await page.route('**/api/territory/saved-routes', route => route.fulfill({ json: { routes: [] } }));
  await page.addInitScript(({ savedDetail, linkedDetail }) => {
    sessionStorage.clear();
    localStorage.clear();
    sessionStorage.setItem('picc-territory-ui-state', JSON.stringify({ view: 'map', focusedId: 'linked', detailStoreId: savedDetail }));
    sessionStorage.setItem('territory-store-detail:linked', JSON.stringify({ fetchedAt: Date.now(), detail: linkedDetail }));
  }, { savedDetail, linkedDetail: detail(linked) });
  return { release, started: () => started, completed: () => completed };
}

test('explicit account link waits for its source instead of opening saved Brief selection', async ({ page }) => {
  const pending = await delayedFocus(page, 'linked');
  await page.goto('/territory?focus=linked');
  await expect.poll(pending.started).toBe(true);
  await expect(page.getByRole('button', { name: 'Open Alternate Account' }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Back to accounts' })).toBeHidden();
  pending.release();
  await expect(page.getByRole('heading', { name: 'Linked Account' })).toBeVisible();
  await page.getByRole('button', { name: 'Back to accounts' }).click();
  await expect(page.getByRole('button', { name: 'Back to accounts' })).toBeHidden();
});

test('a late account-link response does not reopen Brief after another account is closed', async ({ page }) => {
  const pending = await delayedFocus(page, null);
  await page.goto('/territory?focus=linked');
  await expect.poll(pending.started).toBe(true);
  await page.getByRole('button', { name: 'Open Alternate Account' }).first().click();
  await expect(page.getByRole('heading', { name: 'Alternate Account' })).toBeVisible();
  await page.getByRole('button', { name: 'Back to accounts' }).click();
  pending.release();
  await expect.poll(pending.completed).toBe(true);
  await expect(page.getByRole('button', { name: 'Back to accounts' })).toBeHidden();
  await expect(page.getByRole('button', { name: 'Open Alternate Account' }).first()).toBeVisible();
});
