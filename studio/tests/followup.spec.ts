import { installAudioCapture } from './audio-capture';
import { decodeWav } from '../shared/wav';
import { test, expect, type Page } from '@playwright/test';
async function boot(page: Page) {
  await page.addInitScript(() => localStorage.setItem('studio.quick-start.opt-out', 'true'));
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/'); await expect(page.locator('#saved-projects')).toHaveValue('Neon-Drive');
  expect(errors).toEqual([]);
}
async function command(page: Page, name: string) { await page.locator('#palette-open').click(); await page.locator('#command-palette input').fill(name); await page.keyboard.press('Enter'); }
const defaults = ['Open pattern tab', 'Open Sample Catalogue', 'MIDI & on-screen controller', 'Audio input', 'Export full song render…', 'Quick start guide', 'Import .strudel file…', 'Import GitHub Samples'];
test('Search pins all eight workflows and closed-pattern selection has no duplicates', async ({ page }) => {
  await boot(page); await page.locator('#palette-open').click();
  expect((await page.locator('.palette-name').allTextContents()).slice(0, 8)).toEqual(defaults);
  await page.keyboard.press('Enter'); await expect(page.locator('.palette-empty')).toContainText('already open');
  await page.keyboard.press('Escape'); await page.getByRole('button', { name: 'Close Lead', exact: true }).click();
  await command(page, 'Open pattern tab'); await expect(page.locator('.palette-name')).toHaveText(['Open Lead']); await page.keyboard.press('Enter');
  await expect(page.getByRole('tab', { name: 'Lead', exact: true })).toHaveCount(1);
  await page.reload(); await page.locator('#palette-open').click(); expect((await page.locator('.palette-name').allTextContents()).slice(0, 8)).toEqual(defaults);
  await page.locator('#command-palette input').fill('Sample Catalogue'); await expect(page.locator('.palette-name')).toHaveText(['Open Sample Catalogue']);
});
test('Search remains discoverable without device capabilities and opens settings without permission', async ({ page }) => {
  await page.addInitScript(() => { Object.defineProperty(navigator, 'mediaDevices', { value: undefined }); Object.defineProperty(navigator, 'requestMIDIAccess', { value: undefined }); });
  await boot(page); await command(page, 'Audio input'); await expect(page.locator('[data-sheet=audio]')).toBeVisible();
  await page.keyboard.press('Escape'); await command(page, 'MIDI & on-screen controller'); await expect(page.locator('[data-sheet=midi]')).toBeVisible();
  await expect(page.locator('#route-status')).toContainText(/Browser controls|unavailable/);
});
test('outside gestures dismiss one overlay, retain edit drafts, and never click through to transport', async ({ page }) => {
  await boot(page); await page.getByRole('tab', { name: 'Rhythm', exact: true }).dblclick();
  const dialog = page.locator('#edit-dialog'); await expect(dialog).toBeVisible(); await page.locator('#edit-name').fill('Rhythm draft');
  const box = (await page.locator('#edit-name').boundingBox())!;
  await page.mouse.move(box.x + 20, box.y + 10); await page.mouse.down(); await page.mouse.move(2, 2); await page.mouse.up(); await expect(dialog).toBeVisible();
  const play = (await page.locator('#play').boundingBox())!; await page.mouse.click(play.x + 5, play.y + 5); await expect(dialog).toBeHidden(); await expect(page.locator('#transport-state')).toContainText('Stopped');
  await page.getByRole('tab', { name: 'Rhythm', exact: true }).dblclick(); await expect(page.locator('#edit-name')).toHaveValue('Rhythm draft'); await page.keyboard.press('Escape');
  await command(page, 'MIDI & on-screen controller'); await page.getByRole('button', { name: 'How to connect a MIDI keyboard' }).click();
  await expect(page.locator('#quick-start')).toBeVisible(); await page.mouse.click(2, 2); await expect(page.locator('#quick-start')).toBeHidden(); await expect(page.locator('#sheet')).toBeVisible();
  await page.mouse.click(2, 2); await expect(page.locator('#sheet')).toBeHidden(); await expect(page.locator('#drawer')).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('studio.quick-start.opt-out'))).toBe('true');
});
test('slider values and function-name binding remain separate and mappings survive reload', async ({ page }) => {
  await page.addInitScript(() => {
    const input: any = { id: 'knobs', name: 'Knobs', state: 'connected', onmidimessage: null };
    Object.defineProperty(navigator, 'requestMIDIAccess', { value: async () => ({ inputs: new Map([['knobs', input]]), onstatechange: null }) });
    (window as any).turnKnob = (value: number) => input.onmidimessage?.({ data: new Uint8Array([176, 20, value]) });
  });
  await boot(page); await command(page, 'MIDI & on-screen controller'); await page.locator('#reconnect').click(); await page.locator('#available-ports').selectOption('Knobs [knobs]'); await page.locator('#add-profile').click(); await page.keyboard.press('Escape');
  const slider = page.locator('.tab-editor:not([hidden]) .inline-slider').first(); await slider.focus(); await page.keyboard.press('ArrowRight'); await slider.click();
  await expect(page.locator('#mapping-context')).toHaveCount(0); await expect(page.locator('.context-menu')).toBeHidden(); await expect(page.locator('#midi-learning')).toBeHidden();
  const fn = page.locator('.tab-editor:not([hidden]) [data-input-function=slider]').first(); await fn.click(); await page.getByRole('menuitem', { name: 'Unbind MIDI control', exact: true }).click(); await fn.click(); await page.getByRole('menuitem', { name: 'Bind MIDI control', exact: true }).click();
  await expect(page.locator('#midi-learning')).toBeVisible(); await page.locator('#cancel-learn').click(); await page.evaluate(() => (window as any).turnKnob(50)); await expect(fn).not.toHaveClass(/input-assigned/);
  await fn.click(); await page.getByRole('menuitem', { name: 'Bind MIDI control', exact: true }).click(); await page.evaluate(() => (window as any).turnKnob(50)); await expect(fn).toHaveClass(/input-assigned/);
  // Cross pickup in both directions before checking the mapped endpoint.
  await page.evaluate(() => { (window as any).turnKnob(0); (window as any).turnKnob(127); (window as any).turnKnob(0); }); await expect(slider).toHaveValue(await slider.getAttribute('min') ?? '0');
  await page.locator('#save-now').click(); await expect(page.locator('#saved-state')).toHaveText('Saved in this browser'); await page.reload(); await expect(fn).toHaveClass(/input-assigned/);
  await fn.click(); await page.getByRole('menuitem', { name: 'Unbind MIDI control', exact: true }).click(); await expect(fn).not.toHaveClass(/input-assigned/);
});
test('metronome stays gold in both themes and neutral when switched off', async ({ page }) => {
  await boot(page); const toggle = page.locator('#count-in'); await toggle.click(); await page.mouse.move(0, 0); await expect(toggle).toHaveCSS('color', 'rgb(145, 99, 0)');
  await page.locator('#dark-mode').check(); await expect(toggle).toHaveCSS('color', 'rgb(239, 195, 74)'); await toggle.click(); await expect(page.locator('#metronome-loop')).toBeVisible(); await expect(toggle).toHaveAttribute('data-mode', 'continuous'); await toggle.click(); await expect(toggle).toHaveCSS('color', 'rgb(154, 166, 183)');
  await expect(toggle).toHaveAttribute('aria-description', 'Off');
});

test('continuous metronome clicks after the lead-in and Stop silences it without changing the mode', async ({ page }) => {
  await installAudioCapture(page); await boot(page);
  const content = page.locator('.tab-editor:not([hidden]) .cm-content'); await content.focus(); await page.keyboard.press('Control+Home'); await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowDown'); await page.keyboard.press('Home'); await page.keyboard.press('Control+Shift+End'); await page.keyboard.insertText('silence');
  await page.locator('#bpm').fill('240'); await page.locator('#bpm').press('Tab'); await page.locator('#count-in').click(); await page.locator('#count-in').click();
  await page.locator('#play').click(); await expect(page.locator('#count-in-beat')).toBeEmpty({ timeout: 5000 });
  await page.evaluate(() => window.neonCapture.start()); await page.waitForTimeout(1300); const playing = await page.evaluate(() => window.neonCapture.finish()); expect(playing.peak).toBeGreaterThan(.01);
  const wav = decodeWav(Buffer.from(playing.wav, 'base64')); const onsets: number[] = [];
  for (let i = 0; i < wav.left.length; i++) if (Math.abs(wav.left[i]) > .01 && (!onsets.length || i / wav.rate - onsets.at(-1)! > .15)) onsets.push(i / wav.rate);
  expect(onsets.length).toBeGreaterThanOrEqual(4); expect(onsets[2] - onsets[1]).toBeCloseTo(.25, 1);
  await page.locator('#stop').click(); await page.waitForTimeout(150); await page.evaluate(() => window.neonCapture.start()); await page.waitForTimeout(400); expect((await page.evaluate(() => window.neonCapture.finish())).peak).toBeLessThan(.00001);
  await page.reload(); await expect(page.locator('#count-in')).toHaveAttribute('data-mode', 'continuous'); await expect(page.locator('#metronome-loop')).toBeVisible();
});
test('GitHub sample import opens directly from default Search without downloading', async ({ page }) => {
  const remote: string[] = []; page.on('request', r => { if (/api.github.com|raw.githubusercontent.com/.test(r.url())) remote.push(r.url()); });
  await boot(page); await command(page, 'Import GitHub Samples'); await expect(page.locator('#sample-import-page')).toBeVisible(); await expect(page.getByLabel('Public GitHub link')).toBeFocused(); expect(remote).toEqual([]);
});
test('starter display name updates without replacing edited music or user-renamed demos', async ({ page }) => {
  await page.route('**/starter/manifest.json', async route => {
    const response = await route.fetch(), manifest = await response.json();
    const legacy = manifest.projects.find((p: any) => p.sessionId === 'Neon-Drive');
    legacy.name = 'Neon Drive'; legacy.tabs[0].code += '\n// My edited music';
    await page.evaluate(async project => {
      const db = await new Promise<IDBDatabase>(resolve => { const r = indexedDB.open('strudel-studio'); r.onsuccess = () => resolve(r.result); });
      await new Promise<void>(resolve => { const tx = db.transaction(['projects', 'settings'], 'readwrite'); tx.objectStore('projects').put(project, 'Neon-Drive'); tx.objectStore('settings').put(1, 'synth-starter-version'); tx.oncomplete = () => resolve(); }); db.close();
    }, legacy);
    await route.fulfill({ response });
  });
  await boot(page); await expect(page.locator('#project-name')).toHaveValue('DEMO: Neon Drive');
  await expect(page.locator('#saved-projects option:checked')).toHaveText('DEMO: Neon Drive');
  await page.getByRole('tab', { name: 'Rhythm', exact: true }).click(); await expect(page.locator('.tab-editor:not([hidden]) .cm-content')).toContainText('My edited music');
  await page.locator('#project-name').fill('My Neon remix'); await page.locator('#save-now').click(); await expect(page.locator('#saved-state')).toHaveText('Saved in this browser'); await page.reload(); await expect(page.locator('#project-name')).toHaveValue('My Neon remix');
});

test('transient menus, new-pattern drafts and native clip/color dialogs share outside dismissal', async ({ page }) => {
  await boot(page); await page.locator('#new-tab').click(); await page.locator('#new-pattern-name').fill('Pending idea'); await page.mouse.click(5, 70); await expect(page.locator('#new-pattern')).toBeHidden();
  await page.locator('#new-tab').click(); await expect(page.locator('#new-pattern-name')).toHaveValue('Pending idea'); await page.keyboard.press('Escape');
  await page.getByRole('tab', { name: 'Rhythm', exact: true }).click({ button: 'right' }); await expect(page.locator('.context-menu')).toBeVisible(); await page.mouse.click(5, 70); await expect(page.locator('.context-menu')).toBeHidden();
  await page.getByRole('tab', { name: 'Rhythm', exact: true }).click({ button: 'right' }); await page.getByRole('menuitem', { name: 'Color…', exact: true }).click(); await expect(page.getByRole('dialog', { name: 'Color for Rhythm' })).toBeVisible(); await page.mouse.click(2, 2); await expect(page.getByRole('dialog', { name: 'Color for Rhythm' })).toHaveCount(0);
  await page.locator('[data-clip]').first().click(); await expect(page.locator('#clip-dialog')).toBeVisible(); const original = await page.locator('#clip-length').inputValue(); await page.locator('#clip-length').fill('7'); await page.mouse.click(2, 2); await expect(page.locator('#clip-dialog')).toBeHidden();
  await page.locator('[data-clip]').first().click(); await expect(page.locator('#clip-length')).toHaveValue('7'); await page.keyboard.press('Escape');
  await command(page, 'Delete session'); await expect(page.locator('#edit-dialog')).toBeVisible(); await page.mouse.click(2, 2); await expect(page.locator('#saved-projects')).toHaveValue('Neon-Drive'); expect(original).not.toBe('7');
  await command(page, 'Open Sample Catalogue'); await expect(page.locator('#sounds-panel')).toBeVisible(); await page.mouse.click(2, 2); await expect(page.locator('#sounds-panel')).toBeHidden();
});

test('tutorial videos have focused assets, deliberate playback and pause when dismissed', async ({ page }) => {
  await boot(page); await command(page, 'Quick start guide');
  for (const topic of ['Record MIDI', 'Map a knob', 'Tempo', 'Arrange']) {
    await page.getByRole('link', { name: topic, exact: true }).click();
    const videos = page.locator('#quick-start section:not([hidden]) video');
    for (const video of await videos.all()) {
      expect(await video.evaluate((el: HTMLVideoElement) => el.paused && el.muted && el.controls)).toBe(true);
      await video.evaluate((el: HTMLVideoElement) => el.load());
      await expect.poll(() => video.evaluate((el: HTMLVideoElement) => el.readyState)).toBeGreaterThanOrEqual(1);
      expect(await video.evaluate((el: HTMLVideoElement) => el.videoWidth / el.videoHeight)).toBeGreaterThan(1.5);
    }
  }
  const video = page.locator('#quick-start section:not([hidden]) video').first(); await video.evaluate((el: HTMLVideoElement) => el.play()); await page.mouse.click(2, 2); await expect(page.locator('#quick-start')).toBeHidden(); await expect.poll(() => video.evaluate((el: HTMLVideoElement) => el.paused)).toBe(true);
});
