import { defineConfig } from '@playwright/test';
import path from 'node:path';
import os from 'node:os';
const directory = path.join(os.tmpdir(), `strudel-browser-${process.pid}`);
export default defineConfig({
  testDir: './tests', testMatch: '*.spec.ts', workers: 1, timeout: 45_000,
  outputDir: './test-results', reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:5175', viewport: { width: 1440, height: 1100 }, screenshot: 'only-on-failure',
    launchOptions: { executablePath: process.env.STUDIO_CHROMIUM, args: ['--autoplay-policy=no-user-gesture-required'] } },
  webServer: { command: 'npm run studio:app', url: 'http://127.0.0.1:5175/api/status', reuseExistingServer: false,
    env: { STUDIO_PORT: '5175', STUDIO_FIXTURE_GENERATION: '1', STUDIO_DISABLE_MIDI: process.env.STUDIO_E2E_ALSA === '1' ? '0' : '1', STUDIO_DATA_DIR: path.join(directory, 'projects'), STUDIO_SAMPLE_DIR: path.join(directory, 'samples') } },
});
