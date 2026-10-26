import { test, expect } from '@playwright/test';

test.use({ video: 'on' });

for (const colorScheme of ['dark', 'light'] as const) {
  for (const width of [390, 1280]) {
    test(`Settings fields remain readable: ${colorScheme}, ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ colorScheme });
      await page.addInitScript(() => localStorage.setItem('theme', 'dark'));
      await page.route('**/api/integrations/mailjet', route => route.fulfill({ json: { configured: false, encryptionReady: true, fromEmail: '', fromName: '' } }));
      await page.goto('/settings');
      const card = page.getByRole('region', { name: 'Mailjet', exact: true });
      await card.getByRole('button', { name: 'Connect Mailjet' }).click();
      await card.getByLabel('API key', { exact: true }).fill('example-key');
      await card.getByLabel('Sender email', { exact: true }).fill('sender@example.com');
      await card.screenshot({ path: test.info().outputPath('mailjet-fields.png') });
      const fields = page.locator('input:not([type=checkbox]):not([type=radio]):not([type=hidden]):visible, textarea:visible, select:visible');
      const results = await fields.evaluateAll(elements => elements.map(element => {
        const style = getComputedStyle(element);
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 1;
        const ctx = canvas.getContext('2d')!;
        const rgb = (color: string) => {
          ctx.clearRect(0, 0, 1, 1); ctx.fillStyle = color; ctx.fillRect(0, 0, 1, 1);
          return [...ctx.getImageData(0, 0, 1, 1).data].slice(0, 3);
        };
        const luminance = (color: string) => rgb(color).map(v => v / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4).reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0);
        let background = style.backgroundColor;
        let parent = element.parentElement;
        while (background === 'rgba(0, 0, 0, 0)' && parent) { background = getComputedStyle(parent).backgroundColor; parent = parent.parentElement; }
        const bg = luminance(background);
        const contrast = (color: string) => { const fg = luminance(color); return (Math.max(fg, bg) + .05) / (Math.min(fg, bg) + .05); };
        return { label: element.getAttribute('id') || element.getAttribute('placeholder') || element.tagName, background: bg, contrast: contrast(style.color), placeholder: element.hasAttribute('placeholder') ? contrast(getComputedStyle(element, '::placeholder').color) : null };
      }));
      expect(results.length).toBeGreaterThan(4);
      for (const result of results) {
        expect.soft(result.background, `${result.label}: light surface`).toBeGreaterThan(.7);
        expect.soft(result.contrast, `${result.label}: entered text`).toBeGreaterThanOrEqual(4.5);
        if (result.placeholder !== null) expect.soft(result.placeholder, `${result.label}: placeholder`).toBeGreaterThanOrEqual(4.5);
      }
    });
  }
}
