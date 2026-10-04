import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: [
    ['list'],
    ['html', { open: 'never' }],
    ['junit', { outputFile: 'test-results/junit.xml' }],
  ],
  use: {
    baseURL: 'https://emicalculator.net',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    acceptDownloads: true,
  },
  projects: [
    // Pure-logic tests: no browser, no network. Run in milliseconds.
    { name: 'unit', testMatch: /tests\/unit\/.*\.spec\.ts/ },
    { name: 'chromium', testMatch: /tests\/ui\/.*\.spec\.ts/, use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', testMatch: /tests\/ui\/.*\.spec\.ts/, use: { ...devices['Desktop Firefox'] } },
    { name: 'mobile-chrome', testMatch: /tests\/ui\/.*\.spec\.ts/, grep: /@smoke/, use: { ...devices['Pixel 7'] } },
  ],
});
