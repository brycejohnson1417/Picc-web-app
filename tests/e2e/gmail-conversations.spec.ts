import { expect, test } from '@playwright/test';

const store = {
  id: 'store-1',
  notionPageId: 'account-page-1',
  name: 'Example Store',
  status: 'Customer',
  statusKey: 'customer',
  statusColor: '#1f9d55',
  statusColorName: 'green',
  pinKind: 'customer',
  repNames: ['Example Rep'],
  repEmails: ['rep@example.com'],
  lat: 40.7128,
  lng: -74.006,
  locationLabel: 'New York, NY',
  locationAddress: '88 Test Street, New York, NY',
  locationSource: 'notion-place',
  locationPrecision: 'exact',
  isApproximate: false,
  lastEditedTime: '2026-08-14T14:00:00.000Z',
  city: 'New York',
  state: 'NY',
  daysOverdue: 6,
  phoneNumber: '+12125550115',
  email: 'orders@example.com',
  referralSource: null,
  isPreferredPartner: true,
  followUpDate: null,
  followUpNeeded: true,
  followUpReason: null,
  notes: null,
  lastCheckIn: null,
};

function storesResponse() {
  return {
    stores: [store],
    filters: {
      statuses: [{ value: 'Customer', count: 1 }],
      reps: [{ value: 'Example Rep', count: 1 }],
      pppStatuses: [],
      headsetConnectionStatuses: [],
      preferredPartners: [{ value: 'preferred', count: 1 }],
      referralSources: [],
      locationAvailability: [],
      vendorDayStatuses: [],
    },
    meta: {
      dataSource: 'notion-live-cache',
      lastEditedMax: store.lastEditedTime,
      recordsRead: 1,
      unresolvedLocationCount: 0,
      geocodedThisRequest: 0,
      syncedAt: '2026-08-14T14:10:00.000Z',
      stale: false,
      syncing: false,
      syncError: null,
    },
  };
}

function storeDetailResponse() {
  return {
    store,
    contacts: [
      {
        id: 'contact-page-1',
        name: 'Example Buyer',
        roleTitle: 'Buyer',
        email: 'mara@example.com',
        phone: '+1 (347) 555-0198',
        status: 'ACTIVE',
        linkedWork: 'Primary contact',
      },
    ],
    checkIns: [],
    vendorDays: { total: 0, upcomingCount: 0, recent: [] },
    crm: {
      contact: null,
      contactEmail: null,
      contactPhone: null,
      primaryContactName: 'Example Buyer',
      primaryContactBuyer: 'Example Buyer',
      primaryContactEmail: 'mara@example.com',
      primaryContactPhone: '+1 (347) 555-0198',
      rep: 'Example Rep',
      accountManager: null,
      piccCreditStatus: null,
      accountStatus: 'Customer',
      lastOrderAmount: null,
      lastContacted: null,
      lastDeliveryDate: null,
      lastSampleOrderDate: null,
      lastOrderDate: null,
      referralSource: null,
      customerSince: null,
      pennyBundlePromoStatus: null,
      pppStatus: null,
      headsetConnectionStatus: null,
      productTracking: null,
      displayTracking: null,
    },
    analytics: { matchedAccountId: null, matchedBy: 'account', monthly: [], recentOrders: [], orders: [] },
    history: { accountUpdates: [] },
  };
}

test.beforeEach(async ({ page }) => {
  await page.route('**/api/territory/stores?**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(storesResponse()) });
  });
  await page.route('**/api/territory/stores/store-1', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(storeDetailResponse()) });
  });
});


test.use({video:'on'});
const conversation = {id:'thread1',subject:'September reorder',snippet:'Can we arrange a delivery?',occurredAt:'2026-09-29T12:00:00Z',messageCount:2,matchedEmails:['mara@example.com'],externalUrl:'https://mail.google.com/mail/u/rep%40example.com/#all/thread1',messages:[]};
const messages = [{id:'m1',from:'Buyer <mara@example.com>',to:'rep@example.com',cc:'second@example.com',direction:'received',occurredAt:'2026-09-29T12:00:00Z',text:'Can we arrange a delivery?\nPlease confirm the order.',truncated:false},{id:'m2',from:'rep@example.com',to:'mara@example.com',cc:'',direction:'sent',occurredAt:'2026-09-29T13:00:00Z',text:'Yes, the order is ready.',truncated:false}];
for (const width of [390,1280]) {
 test(`account conversation reading, pagination, filters and refresh at ${width}px`,async({page})=>{
  let range='';let refreshes=0;
  await page.route('**/api/accounts/*/gmail?**',async route=>{
   const params=new URL(route.request().url()).searchParams;range=params.get('range') ?? ''; refreshes++;
   if(params.has('threadId')) return route.fulfill({json:{thread:{...conversation,messages}}});
   return route.fulfill({json:{threads:[params.has('pageToken')?{...conversation,id:'thread2',subject:'Earlier conversation'}:conversation],nextPageToken:params.has('pageToken')?null:'next',mailboxEmail:'rep@example.com',matchedContactCount:2,checkedAt:new Date().toISOString(),range}});
  });
  await page.setViewportSize({width,height:900});await page.goto('/accounts');
  await page.getByRole('button',{name:/Example Store.*Customer.*Example Rep/s}).click();
  await page.getByRole('button',{name:'Email',exact:true}).click();
  const section=page.getByRole('region',{name:'Gmail conversations'});
  await expect(section.getByText('September reorder',{exact:true})).toBeVisible();
  await section.getByRole('button',{name:/September reorder/}).click();
  await expect(section.getByText('Yes, the order is ready.')).toBeVisible();
  await expect(section.getByRole('link',{name:'Open in Gmail'})).toHaveAttribute('href',/rep%40example.com/);
  await section.screenshot({path:test.info().outputPath(`gmail-${width}.png`)});
  await section.getByRole('button',{name:'Load more'}).click();await expect(section.getByText('Earlier conversation',{exact:true})).toBeVisible();
  await section.getByLabel('Conversation history range').selectOption('all');await expect(section.getByText('Earlier conversation',{exact:true})).toHaveCount(0);expect(range).toBe('all');
  await section.getByRole('button',{name:'Refresh conversations'}).click();await expect(section.getByRole('button',{name:'Refresh conversations'})).toBeEnabled();expect(refreshes).toBeGreaterThan(3);
  expect(await section.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
 });
}
test('Gmail error, retry, no matches and reconnect states are actionable',async({page})=>{
 let mode='error';
 await page.route('**/api/accounts/*/gmail?**',async route=>route.fulfill(mode==='error'?{status:502,json:{error:'Gmail could not load conversations.'}}:mode==='empty'?{json:{threads:[],nextPageToken:null,mailboxEmail:'rep@example.com',matchedContactCount:1,checkedAt:new Date().toISOString(),range:'2y'}}:{status:409,json:{error:'Connect your Gmail in Settings to view conversations.',needsConnection:true}}));
 await page.goto('/accounts');await page.getByRole('button',{name:/Example Store.*Customer.*Example Rep/s}).click();await page.getByRole('button',{name:'Email',exact:true}).click();
 const section=page.getByRole('region',{name:'Gmail conversations'});
 await expect(section.getByRole('alert')).toContainText('could not load');mode='empty';await section.getByRole('button',{name:'Try again'}).click();await expect(section.getByText(/No matching conversations/)).toBeVisible();
 mode='disconnect';await section.getByRole('button',{name:'Refresh conversations'}).click();await expect(section.getByRole('link',{name:'Gmail Settings'})).toHaveAttribute('href','/settings#connected-services');
});

test('contact Timeline reads the same conversation without importing or moving activities',async({page})=>{
 const {PrismaClient}=await import('@prisma/client');
 const dbUrl=process.env.DATABASE_URL;
 if(!dbUrl || !['localhost','127.0.0.1'].includes(new URL(dbUrl).hostname)) throw new Error('Contact browser test requires an isolated localhost database');
 const db=new PrismaClient();
 const key='crm-contacts-v1';const previous=await db.notionCacheSnapshot.findUnique({where:{key}});
 const contactId='22222222222242228222222222222222';
 try {
  const payload=[{id:contactId,name:'Example Buyer',roleTitle:'Buyer',accountName:'Example Store',email:'mara@example.com',phone:'',status:'ACTIVE',linkedWork:'Primary contact',accountPageIds:[],lastEditedTime:new Date().toISOString()}];
  await db.notionCacheSnapshot.upsert({where:{key},create:{key,payload,recordsRead:1,syncedAt:new Date()},update:{payload,recordsRead:1,syncedAt:new Date()}});
  await page.route('**/api/contacts/*/profile',route=>route.fulfill({json:{profile:{activities:[],reminders:[]}}}));
  await page.route('**/api/contacts/*/gmail?**',route=>{
   expect(route.request().method()).toBe('GET');
   return route.fulfill({json:new URL(route.request().url()).searchParams.has('threadId')?{thread:{...conversation,messages}}:{threads:[conversation],nextPageToken:null,mailboxEmail:'rep@example.com',matchedContactCount:1,checkedAt:new Date().toISOString(),range:'2y'}});
  });
  await page.setViewportSize({width:390,height:900});await page.goto(`/contacts/${contactId}`);
  const section=page.getByRole('region',{name:'Gmail conversations'});await expect(section.getByText('September reorder',{exact:true})).toBeVisible();
  await section.getByRole('button',{name:/September reorder/}).click();await expect(section.getByText('Yes, the order is ready.')).toBeVisible();
  await section.screenshot({path:test.info().outputPath('contact-gmail.png')});
 } finally {
  if(previous) await db.notionCacheSnapshot.update({where:{key},data:{payload:previous.payload!,recordsRead:previous.recordsRead,syncedAt:previous.syncedAt,lastEditedMax:previous.lastEditedMax}});
  else await db.notionCacheSnapshot.deleteMany({where:{key}});
  await db.$disconnect();
 }
});
