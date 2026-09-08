import { test, expect } from '@playwright/test';
import { newProject } from '../shared/model';

test('Sounds defaults to Import and retains unfinished generation across tabs', async ({ page, request }) => {
  await request.put('/api/recovery', { data: newProject() });
  await page.goto('/'); await expect(page.locator('#connection')).toHaveText('Studio connected');
  await page.getByRole('button', { name: 'Sounds', exact: true }).click();
  await expect(page.getByRole('tab', { name: 'Import', exact: true })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('tab', { name: 'Generate', exact: true }).click();
  await page.getByLabel('Describe your next sound').fill('Warm brass');
  await page.getByRole('tab', { name: 'Import', exact: true }).click();
  await page.getByRole('tab', { name: 'Generate', exact: true }).click();
  await expect(page.getByLabel('Describe your next sound')).toHaveValue('Warm brass');
  await expect(page.getByLabel('Search sounds')).toBeVisible();
});

test('highlighted sound records actual audio without microphone permission and saves a reusable take', async ({ page, request }) => {
  const project = newProject(); project.tabs[0].code = 'note(60).s("triangle").gain(0.2)';
  await request.put('/api/recovery', { data: project });
  await page.addInitScript(() => { navigator.mediaDevices.getUserMedia = async () => { throw new Error('Microphone permission must not be requested'); }; });
  await page.goto('/'); await expect(page.locator('#connection')).toHaveText('Studio connected');
  await page.locator('.cm-content').click(); await page.keyboard.press('Control+Home');
  for (let i = 0; i < 8; i++) await page.keyboard.press('Shift+ArrowRight');
  await page.getByRole('button', { name: 'Play into selection', exact: true }).click();
  await page.getByRole('button', { name: 'Record highlighted sound', exact: true }).click();
  await page.getByRole('button', { name: 'Record audio take', exact: true }).click();
  await expect(page.locator('[data-status]')).toContainText('Recording');
  await page.getByRole('button', { name: 'Virtual MIDI', exact: true }).click();
  const key = page.getByRole('button', { name: 'C4', exact: true });
  await key.dispatchEvent('pointerdown', { pointerId: 1 }); await page.waitForTimeout(400); await key.dispatchEvent('pointerup', { pointerId: 1 });
  await page.getByRole('button', { name: 'Stop recording', exact: true }).click();
  await page.getByRole('button', { name: 'End tail', exact: true }).click();
  await expect(page.locator('[data-status]')).toContainText('retained');
  await page.getByLabel('Take name').fill('Live triangle take');
  const saved = page.waitForResponse('/api/recordings');
  await page.getByRole('button', { name: 'Save sound', exact: true }).click();
  const response = await saved; expect(response.ok()).toBe(true);
  const asset = await response.json(); expect(asset.provider).toBe('recording'); expect(asset.duration).toBeGreaterThan(.2);
  const wav = await (await request.get(`/api/samples/${asset.id}/audio`)).body();
  let peak = 0; for (let i = 44; i < wav.length; i += 2) peak = Math.max(peak, Math.abs(wav.readInt16LE(i)));
  expect(peak).toBeGreaterThan(100);
  await expect(page.locator('.cm-content')).toHaveText(project.tabs[0].code);
});

test('external recording permission denial is recoverable and monitoring starts off', async ({ page }) => {
  await page.addInitScript(() => { navigator.mediaDevices.getUserMedia = async () => { throw new DOMException('Microphone permission denied', 'NotAllowedError'); }; });
  await page.goto('/'); await expect(page.locator('#connection')).toHaveText('Studio connected');
  await page.getByRole('button', { name: 'Sounds', exact: true }).click();
  await page.getByRole('button', { name: 'Record audio', exact: true }).click();
  await expect(page.getByLabel('Monitor input')).not.toBeChecked();
  await page.getByRole('button', { name: 'Set up source', exact: true }).click();
  await expect(page.locator('[data-status]')).toContainText('permission denied');
  await expect(page.getByRole('button', { name: 'Set up source', exact: true })).toBeEnabled();
});
