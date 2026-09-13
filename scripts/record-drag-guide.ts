import { chromium, expect } from '@playwright/test';
import { mkdir, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

// Run against a local dev server. Every session lives in a disposable browser context.
// FFMPEG must support MJPEG image2pipe input and the libvpx encoder.
const baseURL = process.env.STUDIO_GUIDE_URL ?? 'http://127.0.0.1:5192';
const ffmpeg = process.env.FFMPEG ?? 'ffmpeg';
const output = path.resolve('studio/client/public/help');
const frames = await mkdtemp(path.join(tmpdir(), 'strudel-drag-guide-'));
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.STUDIO_CHROMIUM });
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  await page.goto(baseURL);
  await expect(page.locator('#saved-projects')).toHaveValue('Neon-Drive');
  await page.locator('#add-session').click();
  await page.locator('#edit-name').fill('Your first composition');
  await page.locator('#edit-dialog button[value="confirm"]').click();
  await expect(page.locator('#project-name')).toHaveValue('Your first composition');
  await page.locator('#tabs [data-tab]').first().click();
  if (!await page.locator('#composition-content').isVisible()) await page.locator('[data-drawer="composition"]').click();
  await expect(page.locator('.lane')).toHaveCount(2);
  await expect(page.locator('[data-clip]')).toHaveCount(0);
  // The overlay only makes Playwright's real pointer visible; the app handles all dragging.
  await page.evaluate(() => {
    const pointer = document.createElement('div'); pointer.id = 'recorded-pointer';
    pointer.style.cssText = 'position:fixed;left:0;top:0;width:30px;height:38px;z-index:100;pointer-events:none;filter:drop-shadow(0 2px 2px #0008)';
    pointer.innerHTML = '<svg viewBox="0 0 30 38"><path d="M3 2v29l7-8 6 12 5-3-6-11h11z" fill="white" stroke="#183047" stroke-width="2" stroke-linejoin="round"/></svg>';
    document.body.append(pointer);
    document.addEventListener('pointermove', event => { pointer.style.transform = `translate(${event.clientX}px, ${event.clientY}px)`; });
    document.addEventListener('pointerdown', () => pointer.style.filter = 'drop-shadow(0 0 6px #00c8e8)');
    document.addEventListener('pointerup', () => pointer.style.filter = 'drop-shadow(0 2px 2px #0008)');
  });
  let frame = 0;
  const captured: Buffer[] = [];
  const capture = async () => { captured.push(await page.screenshot({ type: 'jpeg', quality: 92, path: path.join(frames, `${String(frame++).padStart(4, '0')}.jpg`) })); };
  const hold = async (count: number) => { for (let i = 0; i < count; i++) await capture(); };
  const tab = (await page.locator('#tabs [data-tab]').first().boundingBox())!;
  const lane = (await page.locator('.lane').first().boundingBox())!;
  const from = { x: tab.x + tab.width / 2, y: tab.y + tab.height / 2 };
  const to = { x: lane.x + 8, y: lane.y + lane.height / 2 };
  await page.mouse.move(from.x + 120, from.y + 90);
  await page.screenshot({ path: path.join(output, 'drag-pattern-browser.png') });
  await hold(12);
  for (let i = 1; i <= 15; i++) {
    await page.mouse.move(from.x + 120 * (1 - i / 15), from.y + 90 * (1 - i / 15)); await capture();
  }
  await page.mouse.down(); await hold(9);
  for (let i = 1; i <= 36; i++) {
    const t = i / 36, eased = t * t * (3 - 2 * t);
    await page.mouse.move(from.x + (to.x - from.x) * eased + Math.sin(Math.PI * t) * 65, from.y + (to.y - from.y) * eased);
    await capture();
  }
  await expect(page.locator('.lane[data-drop-target="valid"]')).toHaveCount(1);
  await hold(10); await page.mouse.up();
  await expect(page.locator('[data-clip]')).toHaveCount(1);
  await expect(page.locator('[data-clip]')).toContainText('Pattern 1');
  await page.mouse.move(to.x + 290, to.y + 40); await hold(27);
  await page.locator('#save-now').click();
  await page.reload();
  await expect(page.locator('[data-clip]')).toHaveCount(1);
  execFileSync(ffmpeg, ['-y', '-f', 'image2pipe', '-framerate', '15', '-c:v', 'mjpeg', '-i', 'pipe:0', '-c:v', 'libvpx', '-b:v', '1800k', '-pix_fmt', 'yuv420p', path.join(output, 'drag-pattern-browser.webm')], { input: Buffer.concat(captured), stdio: 'pipe' });
  console.log(`Recorded ${frame} actual browser frames. Drag, drop, and saved clip verified.`);
  console.log(`Video: ${path.join(output, 'drag-pattern-browser.webm')}`);
} finally { await browser.close(); }
