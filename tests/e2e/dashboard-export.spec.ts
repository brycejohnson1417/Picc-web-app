import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test('dashboard still downloads a PDF after export code loads on demand', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto('/dashboard');
  const exportButton = page.getByRole('button', { name: 'Download PDF', exact: true });
  await expect(exportButton).toBeEnabled();
  const downloadPromise = page.waitForEvent('download');
  await exportButton.click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^Nabis_Sales_Report_.*\.pdf$/);
  const path = await download.path();
  expect(path).toBeTruthy();
  const bytes = await readFile(path!);
  expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
  expect(bytes.length).toBeGreaterThan(10_000);
  await expect(exportButton).toBeEnabled();
});
