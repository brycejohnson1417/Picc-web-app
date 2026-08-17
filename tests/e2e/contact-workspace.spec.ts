import { expect, test } from '@playwright/test';

const store = {
  id: 'store-1',
  notionPageId: 'account-page-1',
  name: 'Harbor House',
  status: 'Customer',
  statusKey: 'customer',
  statusColor: '#1f9d55',
  statusColorName: 'green',
  pinKind: 'customer',
  repNames: ['Mina Torres'],
  repEmails: ['mina@piccplatform.com'],
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
  email: 'orders@harbor.example',
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
      reps: [{ value: 'Mina Torres', count: 1 }],
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
        name: 'Mara Vega',
        roleTitle: 'Buyer',
        email: 'mara@harbor.example',
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
      primaryContactName: 'Mara Vega',
      primaryContactBuyer: 'Mara Vega',
      primaryContactEmail: 'mara@harbor.example',
      primaryContactPhone: '+1 (347) 555-0198',
      rep: 'Mina Torres',
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

test('accounts stay dense, keep the alphabet rail clear, and create a follow-up', async ({ page }) => {
  let followUpPayload: unknown;
  await page.route('**/api/territory/check-in', async (route) => {
    followUpPayload = route.request().postDataJSON();
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, syncWarning: null }) });
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/accounts');

  const accountCard = page.getByRole('button', { name: /Harbor House.*Customer.*Mina Torres/s });
  await expect(accountCard).toBeVisible();
  await expect(accountCard).not.toContainText('88 Test Street');
  await expect(accountCard).toContainText('6 days');
  await expect(accountCard).toContainText('Pay days avg.');
  await expect(accountCard).toContainText('Nabis rank');

  const rail = page.getByRole('navigation', { name: 'Jump to account letter' });
  const [cardBox, railBox] = await Promise.all([accountCard.boundingBox(), rail.boundingBox()]);
  expect(cardBox).not.toBeNull();
  expect(railBox).not.toBeNull();
  expect(cardBox!.x + cardBox!.width).toBeLessThanOrEqual(railBox!.x);
  if (process.env.PICC_EVIDENCE_DIR) {
    await page.screenshot({ path: `${process.env.PICC_EVIDENCE_DIR}/accounts-mobile-contact-foundation.png`, fullPage: true });
  }

  await page.getByRole('button', { name: 'New follow-up' }).click();
  await page.getByPlaceholder('Search account or rep').fill('Harbor');
  await page.getByRole('button', { name: /Harbor House.*Mina Torres/s }).click();
  await page.getByRole('button', { name: 'Tomorrow' }).click();
  await page.getByPlaceholder('What needs to happen next?').fill('Review the next order');
  await page.getByRole('button', { name: 'Set follow-up' }).click();

  await expect(page.getByText('Follow-up set')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'New follow-up' })).toBeHidden();
  expect(followUpPayload).toMatchObject({
    store: { id: 'store-1', notionPageId: 'account-page-1', name: 'Harbor House' },
    followUpNeeded: true,
    followUpReason: 'Review the next order',
  });
});

test('account details exposes direct actions and prompts for a follow-up after Gmail opens', async ({ page }) => {
  await page.route('**/api/settings/follow-up-preferences', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ preference: { defaultEmailDays: 11, defaultTextDays: 4, defaultCallDays: 2 } }) });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/accounts');
  await page.getByRole('button', { name: /Harbor House.*Customer.*Mina Torres/s }).click();

  await expect(page.getByText('Associated Contacts')).toBeVisible();
  const email = page.getByRole('link', { name: 'Email Mara Vega' });
  const text = page.getByRole('link', { name: 'Text Mara Vega' });
  const call = page.getByRole('link', { name: 'Call Mara Vega' });
  await expect(email).toHaveAttribute('href', /https:\/\/mail\.google\.com\/mail\/\?view=cm&fs=1&to=mara%40harbor\.example/);
  await expect(text).toHaveAttribute('href', 'sms:+13475550198');
  await expect(call).toHaveAttribute('href', 'tel:+13475550198');

  await page.evaluate(() => {
    document.addEventListener(
      'click',
      (event) => {
        const target = event.target as Element | null;
        if (target?.closest('a[href^="https://mail.google.com/mail/"]')) event.preventDefault();
      },
      true,
    );
  });
  await email.click();

  await expect(page.getByRole('heading', { name: 'Set follow-up?' })).toBeVisible();
  await expect(page.getByText('Gmail opened for Mara Vega.')).toBeVisible();
  const expectedDefaultDate = await page.evaluate(() => { const date = new Date(); date.setHours(12, 0, 0, 0); date.setDate(date.getDate() + 11); return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-'); });
  await expect(page.getByLabel('Follow-up date')).toHaveValue(expectedDefaultDate);
  if (process.env.PICC_EVIDENCE_DIR) {
    await page.screenshot({ path: `${process.env.PICC_EVIDENCE_DIR}/account-contact-actions-follow-up.png`, fullPage: true });
  }
  await page.getByRole('button', { name: 'Not now' }).click();
  await expect(page.getByRole('heading', { name: 'Set follow-up?' })).toBeHidden();
});

test('add contact supports multiple CRM roles and requires explicit replacement of occupied slots', async ({ page }) => {
  const payloads: Array<Record<string, unknown>> = [];
  await page.route('**/api/contacts', async (route) => {
    const payload = route.request().postDataJSON() as Record<string, unknown>;
    payloads.push(payload);
    if (!payload.overwriteRoles) {
      await route.fulfill({
        status: 409,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 'role_collision',
          contact: null,
          collisions: [{
            role: 'PRIMARY_CONTACT',
            label: 'Primary Contact',
            existingContacts: [{ id: 'existing-contact', name: 'Existing Buyer' }],
          }],
        }),
      });
      return;
    }
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({
        status: 'created_verified',
        accountPageId: store.notionPageId,
        contact: { id: 'created-contact', name: 'Jordan Lee', position: 'Buyer', email: 'jordan@example.com', phone: null },
      }),
    });
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/accounts');
  await page.getByRole('button', { name: 'Add contact' }).click();
  await page.getByRole('button', { name: /Harbor House.*New York, NY/s }).click();
  await page.getByLabel('Full name *').fill('Jordan Lee');
  await page.getByLabel('Role / position *').fill('Buyer');
  await page.getByLabel('Primary Contact').check();
  await page.getByLabel('Billing Contact').check();
  await page.getByRole('button', { name: 'Save contact' }).click();

  await expect(page.getByText('Primary Contact: Existing Buyer')).toBeVisible();
  await expect(page.getByText('Nothing has been overwritten yet.')).toBeVisible();
  await page.getByLabel('Billing Contact').uncheck();
  await expect(page.getByRole('button', { name: 'Replace and save' })).toBeHidden();
  await page.getByLabel('Billing Contact').check();
  await page.getByRole('button', { name: 'Save contact' }).click();
  await expect(page.getByRole('button', { name: 'Replace and save' })).toBeVisible();
  await page.getByRole('button', { name: 'Replace and save' }).click();
  await expect(page.getByRole('dialog', { name: 'Add contact' }).getByText('Contact created and linked to the account in Notion.')).toBeVisible();
  expect(payloads).toHaveLength(3);
  expect(payloads[0]).toMatchObject({ roles: ['PRIMARY_CONTACT', 'BILLING_CONTACT'], overwriteRoles: false });
  expect(payloads[1]).toMatchObject({ roles: ['PRIMARY_CONTACT', 'BILLING_CONTACT'], overwriteRoles: false });
  expect(payloads[2]).toMatchObject({ roles: ['PRIMARY_CONTACT', 'BILLING_CONTACT'], overwriteRoles: true });
});

test('reviews Gmail suggestions before quick-adding a prefilled contact', async ({ page }) => {
  await page.route('**/api/integrations/gmail/suggestions', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        mailboxEmail: 'rep@picc.co',
        suggestions: [{ name: 'Taylor Morgan', email: 'taylor@example.com', messageCount: 4, lastInteractionAt: '2026-08-13T16:00:00.000Z' }],
      }),
    });
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/contacts');
  await page.getByRole('button', { name: 'Find suggested contacts in Gmail' }).click();
  await expect(page.getByText('Taylor Morgan')).toBeVisible();
  await expect(page.getByText('4 recent emails')).toBeVisible();
  await page.getByRole('link', { name: 'Quick add' }).click();

  const dialog = page.getByRole('dialog', { name: 'Add contact' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel('Full name *')).toHaveValue('Taylor Morgan');
  await expect(dialog.getByLabel('Email')).toHaveValue('taylor@example.com');
});

test('keeps the contacts directory light and readable under dark device preferences', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto('/contacts');

  const table = page.getByRole('table');
  const header = table.locator('thead');
  const desktopSurface = page.getByTestId('crm-directory-desktop');

  await expect(table).toBeVisible();
  await expect(desktopSurface).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await expect(desktopSurface).toHaveCSS('color', 'rgb(24, 33, 45)');
  await expect(header).toHaveCSS('background-color', 'rgb(241, 245, 249)');
  const nextPageButton = page.getByRole('button', { name: 'Next', exact: true });
  await expect(nextPageButton).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await nextPageButton.evaluate((button) => button.removeAttribute('disabled'));
  await nextPageButton.hover();
  await expect(nextPageButton).toHaveCSS('background-color', 'rgb(243, 246, 250)');
  if (process.env.PICC_EVIDENCE_DIR) {
    await page.screenshot({ path: `${process.env.PICC_EVIDENCE_DIR}/contacts-light-surface-desktop.png`, fullPage: true });
  }

  await page.setViewportSize({ width: 390, height: 844 });
  const mobileSurface = page.getByTestId('crm-directory-mobile');
  const mobileRecordSurface = mobileSurface.locator(':scope > *').first();
  await expect(mobileSurface).toHaveCSS('color', 'rgb(24, 33, 45)');
  await expect(mobileRecordSurface).toBeVisible();
  await expect(mobileRecordSurface).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  if (process.env.PICC_EVIDENCE_DIR) {
    await page.screenshot({ path: `${process.env.PICC_EVIDENCE_DIR}/contacts-light-surface-mobile.png`, fullPage: true });
  }
});

test('lets the signed-in rep inspect and explicitly disconnect their Gmail', async ({ page }) => {
  let connected = true;
  await page.route('**/api/integrations/gmail', async (route) => {
    if (route.request().method() === 'DELETE') {
      connected = false;
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        configuration: { configured: true, redirectUri: 'https://app.example/api/integrations/gmail/callback' },
        connection: connected ? { mailboxEmail: 'rep@picc.co', status: 'SUCCESS', lastSyncedAt: '2026-08-14T16:00:00.000Z', lastError: null, updatedAt: '2026-08-14T16:00:00.000Z' } : null,
      }),
    });
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/settings#connected-services');
  await expect(page.getByText('rep@picc.co')).toBeVisible();
  await page.getByRole('button', { name: 'Disconnect' }).click();
  await expect(page.getByRole('button', { name: 'Confirm disconnect' })).toBeVisible();
  await page.getByRole('button', { name: 'Confirm disconnect' }).click();
  await expect(page.getByText('Not connected')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Connect my Gmail' })).toBeVisible();
});

test('shows Gmail setup errors in Settings and lets the rep retry', async ({ page }) => {
  let attempts = 0;
  await page.route('**/api/integrations/gmail', async (route) => {
    attempts += 1;
    if (attempts === 1) {
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Gmail setup is temporarily unavailable. Ask an administrator to finish setup, then try again.' }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ configuration: { configured: true, redirectUri: null }, connection: null }),
    });
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/settings#connected-services');
  const setupError = page.getByText('Gmail setup is temporarily unavailable. Ask an administrator to finish setup, then try again.');
  await expect(setupError).toBeVisible();
  if (process.env.PICC_EVIDENCE_DIR) {
    await setupError.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${process.env.PICC_EVIDENCE_DIR}/gmail-setup-error-mobile.png` });
  }
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByText('Not connected')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Connect my Gmail' })).toBeVisible();
  if (process.env.PICC_EVIDENCE_DIR) {
    await page.screenshot({ path: `${process.env.PICC_EVIDENCE_DIR}/gmail-setup-recovered-mobile.png` });
  }
});

test('saves action defaults and can explicitly send a daily debrief now', async ({ page }) => {
  let preference = { defaultEmailDays: 7, defaultTextDays: 3, defaultCallDays: 1, resurfaceAfterDays: 30, dailyBriefingEnabled: false, dailyBriefingTime: '08:00', timezone: 'America/New_York', briefingRecipientEmail: 'rep@picc.co' };
  let savedPayload: typeof preference | null = null;
  await page.route('**/api/settings/follow-up-preferences', async (route) => {
    if (route.request().method() === 'PATCH') {
      savedPayload = route.request().postDataJSON() as typeof preference;
      preference = savedPayload;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ preference }) });
  });
  await page.route('**/api/settings/follow-up-preferences/send-preview', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'sent', recipientEmail: 'rep@picc.co' }) });
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/settings#follow-up-defaults');
  await page.getByLabel('After email').fill('9');
  await page.getByLabel('Daily debrief email').check();
  await page.getByRole('button', { name: 'Send debrief now' }).click();
  await expect(page.getByText('Daily debrief sent')).toBeVisible();
  expect(savedPayload).toMatchObject({ defaultEmailDays: 9, dailyBriefingEnabled: true, briefingRecipientEmail: 'rep@picc.co' });
});
