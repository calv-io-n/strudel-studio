import { test, expect } from '@playwright/test';
import { newProject } from '../shared/model';

test.beforeEach(async ({ request }) => {
  const p = newProject(); p.name = 'Usability'; p.tabs[0].code = '$beat: note("c2*4").s("triangle")\n  .gain(0.2)\n\n$bass: note("<a2 f2>").s("sawtooth")\n';
  await request.put('/api/recovery', { data: p });
});

test('Ctrl+S and the Save button save the session and report it', async ({ page }) => {
  await page.goto('/'); await expect(page.locator('#connection')).toHaveText('Studio connected');
  await expect(page.locator('#save-now')).toBeVisible();
  await page.locator('.cm-content').focus(); await page.keyboard.press('Control+End'); await page.keyboard.type('// edit');
  await page.keyboard.press('Control+s');
  await expect(page.locator('#notice')).toContainText('Saved Usability');
  await expect(page.locator('#saved-state')).toHaveText('Session saved');
  expect(page.url()).toMatch(/^http:\/\/(localhost|127\.0\.0\.1):\d+\//); // still on the app: the browser's own Save dialog did not take over
  await page.locator('.cm-content').focus(); await page.keyboard.type(' more');
  await page.locator('#save-now').click();
  await expect(page.locator('#notice')).toContainText('Saved Usability');
  await expect(page.locator('#saved-state')).toHaveText('Session saved');
});

test('Insert from the library lands after the statement at the caret instead of splitting it', async ({ page }) => {
  await page.goto('/'); await expect(page.locator('#connection')).toHaveText('Studio connected');
  const code = page.locator('.cm-content'); await code.focus(); await page.keyboard.press('Control+Home');
  for (let i = 0; i < 16; i++) await page.keyboard.press('ArrowRight'); // caret inside "c2*4"
  await page.getByRole('button', { name: 'Sample library', exact: true }).click();
  await expect(page.locator('#sounds-panel')).toBeVisible();
  await page.locator('#sound-search').fill('bus');
  await page.locator('[data-use-sound="bus"]').click();
  await expect(page.locator('#sounds-panel')).toBeHidden();
  const text = await code.innerText();
  expect(text).toContain('$beat: note("c2*4").s("triangle")\n  .gain(0.2)');
  expect(text.indexOf('$: s("bus")')).toBeGreaterThan(text.indexOf('.gain(0.2)'));
  expect(text.indexOf('$: s("bus")')).toBeLessThan(text.indexOf('$bass'));
});

test('library search resets when reopened and counts show shown of total', async ({ page }) => {
  await page.goto('/'); await expect(page.locator('#connection')).toHaveText('Studio connected');
  await page.getByRole('button', { name: 'Sample library', exact: true }).click();
  await expect(page.locator('#asset-count')).toHaveText(/^\d+ sounds$/);
  await page.locator('#sound-search').fill('noise');
  await expect(page.locator('#asset-count')).toHaveText(/^\d+ of \d+ sounds$/);
  await page.getByRole('button', { name: 'Close library', exact: true }).click();
  await expect(page.locator('#sounds-panel')).toBeHidden();
  await page.getByRole('button', { name: 'Sample library', exact: true }).click();
  await expect(page.locator('#sound-search')).toHaveValue('');
  await expect(page.locator('#asset-count')).toHaveText(/^\d+ sounds$/);
});

test('library overlays the previous view and restores interaction when closed', async ({ page }) => {
  await page.goto('/'); await expect(page.locator('#connection')).toHaveText('Studio connected');
  await page.getByRole('button', { name: 'Virtual MIDI', exact: true }).click();
  await expect(page.locator('#midi-content')).toBeVisible();
  await page.locator('.cm-content').getByText('"sawtooth"', { exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Sample library' })).toBeVisible();
  await expect(page.locator('#midi-content')).toBeVisible();
  expect(await page.locator('#drawer').evaluate(el => (el as HTMLElement).inert)).toBe(true);
  await expect(page.locator('#library-destination')).toContainText('Replace “sawtooth”');
  await page.getByRole('button', { name: 'Close library' }).click();
  await expect(page.locator('#sounds-panel')).toBeHidden();
  await expect(page.locator('#midi-content')).toBeVisible();
});

test('capture waits for the first note instead of counting down immediately', async ({ page }) => {
  await page.goto('/'); await expect(page.locator('#connection')).toHaveText('Studio connected');
  await page.locator('.cm-content').focus(); await page.keyboard.press('Control+Home');
  for (let i = 0; i < 7; i++) await page.keyboard.press('ArrowRight');
  for (let i = 0; i < 12; i++) await page.keyboard.press('Shift+ArrowRight');
  await page.getByRole('button', { name: 'Play MIDI', exact: true }).click();
  await page.getByRole('button', { name: 'Capture notes', exact: true }).click();
  await expect(page.locator('[data-state]')).toContainText('play a note to start');
  await page.waitForTimeout(1200);
  await expect(page.locator('[data-state]')).toContainText('play a note to start');
  await page.getByRole('button', { name: 'Virtual MIDI', exact: true }).click();
  const key = page.getByRole('button', { name: 'E4', exact: true });
  await key.hover(); await page.mouse.down(); await page.waitForTimeout(150); await page.mouse.up();
  await expect(page.locator('[data-state]')).toContainText('1 note captured');
  await expect(page.locator('[data-proposed]')).toContainText('note(64)');
  await page.getByRole('button', { name: 'Stop take', exact: true }).click();
  await page.getByRole('button', { name: 'Discard', exact: true }).click();
});
