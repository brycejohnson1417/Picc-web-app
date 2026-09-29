import { test, expect } from '@playwright/test';

test.use({ viewport: { width: 390, height: 844 } });

test('administrator can connect, explicitly test, and disconnect workspace email', async ({ page }) => {
  let connected = false;
  const sends: string[] = [];
  await page.route('**/api/integrations/mailjet', async (route) => {
    const request = route.request();
    if (request.method() === 'PUT') connected = true;
    if (request.method() === 'DELETE') connected = false;
    if (request.method() === 'POST') {
      sends.push(request.postDataJSON().recipient);
      return route.fulfill({ json: { accepted: true } });
    }
    return route.fulfill({ json: {
      configured: connected, encryptionReady: true,
      fromEmail: connected ? 'sender@example.com' : '', fromName: 'PICC',
      validatedAt: connected ? '2026-09-29T18:00:00Z' : null,
    } });
  });
  await page.goto('/settings');
  const card = page.locator('section[aria-labelledby="mailjet-title"]');
  await card.getByRole('button', { name: 'Connect Mailjet' }).click();
  await card.getByLabel('API key', { exact: true }).fill('fixture-key');
  await card.getByRole('button', { name: 'Cancel', exact: true }).click();
  await card.getByRole('button', { name: 'Connect Mailjet' }).click();
  await expect(card.getByLabel('API key', { exact: true })).toHaveValue('');
  await card.getByLabel('API key', { exact: true }).fill('fixture-key');
  await card.getByLabel('API secret', { exact: true }).fill('fixture-secret');
  await card.getByLabel('Sender email', { exact: true }).fill('sender@example.com');
  await card.getByRole('button', { name: 'Verify and save' }).click();
  await expect(card.getByRole('status')).toContainText('Mailjet connected');
  expect(sends).toEqual([]);
  await card.getByLabel('Test recipient').fill('review@example.com');
  await card.getByRole('button', { name: 'Send test email', exact: true }).click();
  await expect(card.getByRole('status')).toContainText('accepted the test');
  expect(sends).toEqual(['review@example.com']);
  await card.getByRole('button', { name: 'Disconnect Mailjet' }).click();
  await card.getByRole('button', { name: 'Cancel disconnect' }).click();
  expect(connected).toBe(true);
  await card.getByRole('button', { name: 'Disconnect Mailjet' }).click();
  await card.getByRole('button', { name: 'Confirm disconnect' }).click();
  await expect(card.getByRole('status')).toContainText('Mailjet disconnected');
  expect(connected).toBe(false);
  await expect(page.getByText('Scheduled emails are paused. You can send a debrief manually after an administrator connects Mailjet.')).toBeVisible();
});
