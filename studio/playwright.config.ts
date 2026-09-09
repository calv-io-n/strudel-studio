import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests', testMatch: 'pages.spec.ts', workers: 1, timeout: 60_000,
  outputDir: './test-results', reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:5175', viewport: { width: 1440, height: 1100 }, screenshot: 'only-on-failure',
    launchOptions: { executablePath: process.env.STUDIO_CHROMIUM, args: ['--autoplay-policy=no-user-gesture-required'] } },
  webServer: { command: 'npm run studio:preview -- --host 127.0.0.1 --port 5175 --strictPort', url: 'http://127.0.0.1:5175', reuseExistingServer: false },
});
