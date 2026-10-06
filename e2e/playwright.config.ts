import { defineConfig } from '@playwright/test';

const API_URL = 'http://localhost:4000';
const WEB_URL = 'http://localhost:3000';

export default defineConfig({
  testDir: './tests',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  retries: 0,
  workers: 1,
  globalSetup: './global-setup.ts',
  reporter: [['list']],
  use: {
    baseURL: WEB_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: [
    {
      command: 'node dist/main.js',
      cwd: '../apps/api',
      url: `${API_URL}/api/v1/health`,
      reuseExistingServer: true,
      timeout: 60_000,
    },
    {
      command: 'node node_modules/next/dist/bin/next start -p 3000',
      cwd: '../apps/web',
      url: `${WEB_URL}/login`,
      reuseExistingServer: true,
      timeout: 60_000,
    },
  ],
});
