import { installAudioCapture } from './audio-capture';
import { test, expect } from '@playwright/test';
import { newProject } from '../shared/model';

test('selection arms its expression without editing code', async ({ page, request }) => {
  const project = newProject(); project.tabs[0].code = 'note("c3 e3").s("triangle")';
  await request.put('/api/recovery', { data: project });
  await page.goto('/'); await expect(page.locator('#connection')).toHaveText('Studio connected');
  const editor = page.locator('.cm-content'); await editor.click(); await page.keyboard.press('Control+Home');
  for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowRight');
  for (let i = 0; i < 7; i++) await page.keyboard.press('Shift+ArrowRight');
  await page.getByRole('button', { name: 'Play into selection', exact: true }).click();
  await expect(page.locator('[data-original]')).toHaveText('note("c3 e3")');
  await expect(page.locator('.performance-destination')).toHaveCount(1);
  await expect(editor).toHaveText(project.tabs[0].code);
  await page.getByRole('button', { name: 'Leave performance' }).click();
  await expect(page.locator('.performance-panel')).toBeHidden();
});

test('selected sound auditions virtual notes and global Stop releases them', async ({ page, request }) => {
  const project = newProject(); project.tabs[0].code = 'note("c3").s("sawtooth").gain(0.2)';
  await request.put('/api/recovery', { data: project });
  await installAudioCapture(page);
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/'); await expect(page.locator('#connection')).toHaveText('Studio connected');
  await page.locator('.cm-content').click(); await page.keyboard.press('Control+Home');
  for (let i = 0; i < 10; i++) await page.keyboard.press('Shift+ArrowRight');
  await page.getByRole('button', { name: 'Play into selection', exact: true }).click();
  await page.getByRole('button', { name: 'Audition', exact: true }).click();
  await expect(page.locator('[data-state]')).toContainText('Audition');
  await page.getByRole('button', { name: 'Virtual MIDI', exact: true }).click();
  const key = page.getByRole('button', { name: 'C4', exact: true });
  await page.evaluate(() => window.neonCapture.start());
  await key.dispatchEvent('pointerdown', { pointerId: 1 });
  await page.waitForTimeout(500);
  const recorded = await page.evaluate(() => window.neonCapture.finish());
  expect(recorded.peak).toBeGreaterThan(.001); await key.dispatchEvent('pointerup', { pointerId: 1 });
  await page.getByRole('button', { name: 'Stop', exact: true }).click();
  await expect(page.locator('[data-state]')).toContainText('Stopped');
  await expect(page.locator('.cm-content')).toHaveText(project.tabs[0].code);
  expect(errors).toEqual([]);
});
