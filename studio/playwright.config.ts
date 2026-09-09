import { fileURLToPath } from 'node:url';
import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests', testMatch: 'pages.spec.ts', workers: 1, timeout: 60_000,
  outputDir: './test-results', reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:5185', viewport: { width: 1440, height: 1100 }, screenshot: 'only-on-failure',
    launchOptions: { executablePath: process.env.STUDIO_CHROMIUM, args: ['--autoplay-policy=no-user-gesture-required'] } },
  webServer: { cwd: fileURLToPath(new URL('../', import.meta.url)), command: 'node scripts/serve-static.mjs', url: 'http://127.0.0.1:5185', reuseExistingServer: false },
});
