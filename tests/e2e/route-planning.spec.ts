import { test, expect, type Page } from '@playwright/test';
test.use({ video: 'on' });
const stores = Array.from({ length: 51 }, (_, i) => ({ id: `route-store-${i}`, name: `Route account ${String(i+1).padStart(2,'0')}`, lat: 40.7+i*.001, lng: -74, repNames: [], status: i % 2 ? 'Lead - Hot' : 'Lead - Cold', statusColor: i % 2 ? '#f97316' : '#3b82f6', locationAddress: `${i+1} Route Test Street` }));
async function setup(page: Page, count: number, missing = false) {
  await page.route('**/api/territory/stores', route => route.fulfill({ json: { stores: missing ? stores.slice(0,count-1) : stores } }));
  await page.route('**/api/territory/saved-routes', route => route.fulfill({ json: { routes: [] } }));
  await page.addInitScript(({ ids }) => {
    if (!localStorage.getItem('route-test-initialized')) {
      localStorage.setItem('picc_route_plan_v1', JSON.stringify({ selectedStopIds: ids, orderedStopIds: ids.slice(0,4), savedRoutes: [], optimizedRoute: { mode:'car', orderedStopIds: ids.slice(0,4), totalDistanceMeters: 100, totalDurationSeconds: 100, legs: [], geometry: null } }));
      localStorage.setItem('route-test-initialized', 'yes');
    }
  }, { ids: stores.slice(0,count).map(s => s.id) });
  await page.goto('/route');
}

test('recovers 27 selected stores from four-stop order and keeps reordering across reload', async ({ page }) => {
  await setup(page,27);
  await expect(page.getByText('27 / 50 stores')).toBeVisible();
  await expect(page.getByRole('button', { name: /^Remove Route account/ })).toHaveCount(27);
  await expect(page.getByText('Lead - Cold').first()).toBeVisible();
  await expect(page.getByText('Lead - Hot').first()).toBeVisible();
  await page.getByRole('button', {name:'Move Route account 01 down'}).click();
  await page.reload();
  await expect(page.getByRole('button', { name: /^Remove Route account/ })).toHaveCount(27);
  await expect(page.getByRole('button', {name:'Move Route account 02 up'})).toBeDisabled();
  await page.screenshot({path:'.agents/route-187-desktop.png', fullPage:false});
});

test('50 stores, starting address, optimization and navigable sections on mobile', async ({ page }) => {
  await page.setViewportSize({width:390,height:844});
  await setup(page,50);
  let requested = 0;
  await page.route('**/api/territory/optimize-route', async route => {
    const body = route.request().postDataJSON();
    requested = body.stops.length;
    const origin = body.originAddress ? {name:'Verified starting address',lat:40.8,lng:-74} : body.origin;
    await route.fulfill({json:{ mode:body.mode, origin, orderedStopIds:body.stops.map((s:{id:string})=>s.id), legs:[], totalDurationSeconds:4000,totalDistanceMeters:8000,estimationModel:'google-routes',geometry:null }});
  });
  await page.locator('summary').filter({hasText:'Starting location'}).click();
  await page.getByLabel('Starting location', {exact:true}).fill('100 Starting Avenue');
  await page.getByRole('button',{name:'Apply',exact:true}).click();
  await expect(page.getByText(/Start: Verified starting address/)).toBeVisible();
  expect(requested).toBe(50);
  await page.getByRole('button',{name:'optimize',exact:true}).click();
  await expect(page.getByRole('button',{name:'optimize',exact:true})).toBeEnabled();
  await expect(page.getByRole('button',{name:/^Remove Route account/})).toHaveCount(50);
  await page.screenshot({path:'.agents/route-187-mobile.png'});
  await page.getByRole('button',{name:'GO',exact:true}).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  const links = page.getByRole('dialog').getByRole('link');
  await expect(links).toHaveCount(13);
  const destinations: string[] = [];
  for (const href of await links.evaluateAll(nodes=>nodes.map(n=>(n as HTMLAnchorElement).href))) {
    const url = new URL(href); const via = url.searchParams.get('waypoints')?.split('|') ?? [];
    expect(via.length).toBeLessThanOrEqual(3);
    destinations.push(...via, url.searchParams.get('destination')!);
  }
  expect(destinations).toHaveLength(50);
  await page.getByRole('button',{name:'Close directions'}).click();
  await page.reload();
  await expect(page.getByText(/Start: Verified starting address/)).toBeVisible();
  await page.getByRole('button',{name:'Choose Accounts',exact:true}).click();
  await page.getByPlaceholder('Search Accounts').fill('Route account 51');
  await page.getByRole('button', {name:/Route account 51/}).click();
  await expect(page.getByText('Routes support up to 50 stores. Remove a store before adding another.')).toBeVisible();
});

test('missing store remains accounted for and blocks partial optimization', async ({page}) => {
  await setup(page,27,true);
  await expect(page.getByText('1 selected store is unavailable. Your selection has been kept.')).toBeVisible();
  await expect(page.getByRole('button',{name:'optimize',exact:true})).toBeDisabled();
  await page.getByRole('button',{name:'Remove unavailable store 1'}).click();
  await expect(page.getByText('26 / 50 stores')).toBeVisible();
  await expect(page.getByRole('button',{name:'optimize',exact:true})).toBeEnabled();
});

test('saves all 50 store IDs and displays the saved route', async ({page}) => {
  await setup(page,50);
  let saved: {id:string; name:string; stopIds:string[]; createdAt:string} | null = null;
  await page.route('**/api/territory/saved-routes', async route => {
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON();
      saved = {...body,id:'saved-route-test',createdAt:new Date().toISOString()};
      await route.fulfill({status:201,json:{route:saved}});
    } else await route.fulfill({json:{routes:saved?[saved]:[]}});
  });
  page.once('dialog',dialog=>void dialog.accept('Route completeness test'));
  await page.getByRole('button',{name:'save',exact:true}).click();
  await expect(page.getByText('Route saved', {exact:true})).toBeVisible();
  expect(saved!.stopIds).toHaveLength(50);
  await page.getByRole('button',{name:'Saved Routes',exact:true}).click();
  await expect(page.getByText('Route completeness test')).toBeVisible();
  await page.getByRole('button',{name:/Route completeness test/}).click();
  await expect(page.getByRole('button',{name:/^Remove Route account/})).toHaveCount(50);
});

test('failed address leaves the existing route intact and can be corrected', async ({page})=>{
  await setup(page,27);
  await page.route('**/api/territory/optimize-route',route=>route.fulfill({status:400,json:{error:'Starting address could not be found.'}}));
  await page.locator('summary').filter({hasText:'Starting location'}).click();
  await page.getByLabel('Starting location',{exact:true}).fill('Invalid address');
  await page.getByRole('button',{name:'Apply',exact:true}).click();
  await expect(page.getByRole('alert').filter({hasText:'Starting address could not be found.'})).toBeVisible();
  await expect(page.getByRole('button',{name:/^Remove Route account/})).toHaveCount(27);
  await expect(page.getByRole('button',{name:'Apply',exact:true})).toBeEnabled();
});
