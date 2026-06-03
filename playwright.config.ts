import { defineConfig, devices } from '@playwright/test';

const port = process.env.PICC_AGENT_DEV_PORT || process.env.PORT || '3010';
const baseURL = process.env.PLAYWRIGHT_BASE_URL || `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  expect: {
    timeout: 10_000,
  },
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'npm run dev:agent',
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      DEMO_MODE: 'true',
      DEMO_ORG_ID: process.env.DEMO_ORG_ID || 'org_picc_demo',
      DEMO_USER_ID: process.env.DEMO_USER_ID || 'demo_user',
      TERRITORY_ORG_ID: process.env.TERRITORY_ORG_ID || 'org_picc_demo',
      PICC_AGENT_DEV_PORT: port,
      PORT: port,
    },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
