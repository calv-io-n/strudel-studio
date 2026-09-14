import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { decodeWav } from '../shared/wav';
import { installAudioCapture } from './audio-capture';

async function boot(page: Page, guide = false) {
  if (!guide) await page.addInitScript(() => localStorage.setItem('studio.quick-start.opt-out', 'true'));
  await page.goto('/'); await expect(page.locator('#saved-projects')).toHaveValue('Neon-Drive');
}
async function search(page: Page, text: string) { await page.keyboard.press('Control+k'); await page.locator('#command-palette input').fill(text); }
async function action(page: Page, text: string) { await search(page, text); await page.keyboard.press('Enter'); }
async function replaceBody(page: Page, code: string) {
  const content = page.locator('.tab-editor:not([hidden]) .cm-content'); await content.focus();
  await page.keyboard.press('Control+Home'); await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowDown'); await page.keyboard.press('Home');
  await page.keyboard.press('Control+Shift+End'); await page.keyboard.insertText(code);
}
async function project(page: Page) { return page.evaluate(async () => {
  const db = await new Promise<IDBDatabase>(resolve => { const request = indexedDB.open('strudel-studio'); request.onsuccess = () => resolve(request.result); });
  return new Promise<any>(resolve => { const request = db.transaction('projects').objectStore('projects').get('Neon-Drive'); request.onsuccess = () => { resolve(request.result); db.close(); }; });
}); }
async function midi(page: Page) {
  await page.addInitScript(() => {
    const input: any = { id: 'keyboard', name: 'Test Keys', state: 'connected', onmidimessage: null };
    Object.defineProperty(navigator, 'requestMIDIAccess', { value: async () => ({ inputs: new Map([['keyboard', input]]), onstatechange: null }) });
    (window as any).playNote = (on: boolean) => input.onmidimessage?.({ data: new Uint8Array([on ? 144 : 128, 64, on ? 100 : 0]) });
  });
  await boot(page); await action(page, 'MIDI & on-screen controller'); await page.locator('#reconnect').click();
  await page.locator('#available-ports').selectOption('Test Keys [keyboard]'); await page.locator('#add-profile').click(); await expect(page.locator('.device-connection')).toContainText('Connected'); await page.keyboard.press('Escape');
}

test('Quick Start dismissal, legacy migration, explicit preference and restoration', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('studio.quick-start', 'seen'));
  await boot(page, true); const guide = page.locator('#quick-start'); await expect(guide).toBeVisible();
  await page.keyboard.press('Escape'); await expect(guide).toBeHidden(); await page.reload(); await expect(guide).toBeVisible();
  await page.getByLabel("Don't show this again").check(); await page.getByRole('button', { name: 'Close quick start' }).click();
  await page.reload(); await expect(page.locator('#saved-projects')).toHaveValue('Neon-Drive'); await expect(guide).toBeHidden();
  await action(page, 'Quick start guide'); await expect(guide).toBeVisible(); await page.getByLabel("Don't show this again").uncheck();
  await page.getByRole('button', { name: 'Close quick start' }).click(); await page.reload(); await expect(guide).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('studio.quick-start.opt-out'))).toBe('false');
});

test('managed headers protect tempo while body edits and undo survive global synchronization', async ({ page }) => {
  await boot(page); const content = page.locator('.tab-editor:not([hidden]) .cm-content');
  await expect(content).toContainText('setcpm(168 / 4)');
  await content.focus(); await page.keyboard.press('Control+Home'); await page.keyboard.insertText('BROKEN'); await expect(content).not.toContainText('BROKEN');
  await replaceBody(page, 'note("c4 e4").s("triangle").gain(slider(.2, 0, 1))'); await expect(content).toContainText('note("c4 e4")');
  await page.locator('#bpm').fill('120'); await page.locator('#bpm').press('Tab'); await expect(content).toContainText('setcpm(120 / 4)');
  await page.locator('#save-now').click(); await expect(page.locator('#saved-state')).toHaveText('Saved in this browser');
  const saved = await project(page); expect(saved.version).toBe(7); expect(saved.tabs.every((t: any) => t.code.startsWith('// Tempo: 120 BPM'))).toBe(true);
  await content.focus(); await page.keyboard.press('Control+z'); await expect(content).toContainText('setcpm(120 / 4)'); await expect(content).not.toContainText('note("c4 e4")');
});

test('Search exposes only closed patterns; local rename and tempo override round-trip', async ({ page }) => {
  await boot(page); await search(page, 'Lead'); await expect(page.locator('#palette-results [role=option]')).toHaveCount(0); await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Close Lead', exact: true }).click(); await action(page, 'Open Lead'); await expect(page.getByRole('tab', { name: 'Lead', exact: true })).toHaveAttribute('aria-selected', 'true');
  await search(page, 'Rename'); await expect(page.locator('#palette-results [role=option]')).toHaveCount(0); await page.keyboard.press('Escape');
  const tab = page.getByRole('tab', { name: 'Lead', exact: true }); await tab.focus(); await page.keyboard.press('F2'); await page.locator('#edit-name').fill('Melody'); await page.locator('#edit-dialog button[value=confirm]').click();
  await page.getByRole('tab', { name: 'Melody', exact: true }).click({ button: 'right' }); await page.getByRole('menuitem', { name: 'Pattern tempo…', exact: true }).click();
  await page.locator('#edit-name').fill('84'); await page.locator('#edit-dialog button[value=confirm]').click();
  await expect(page.locator('.tab-editor:not([hidden]) .cm-content')).toContainText('Pattern: 84 BPM');
  await page.locator('#save-now').click(); await expect(page.locator('#saved-state')).toHaveText('Saved in this browser'); await page.reload();
  expect((await project(page)).tabs.find((t: any) => t.name === 'Melody').tempoBpm).toBe(84);
});

test('Test MIDI produces audio without takes, code changes, or composition writes', async ({ page }) => {
  await installAudioCapture(page); await midi(page);
  const before = await page.locator('.tab-editor:not([hidden]) .cm-content').innerText();
  await page.locator('.tab-editor:not([hidden]) [data-input-function=note]').first().click(); await expect(page.getByRole('menuitem', { name: 'Test MIDI', exact: true })).toBeVisible();
  expect(await page.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('studio.midi-take:') || k.startsWith('studio.composition-midi:')))).toEqual([]);
  await page.getByRole('menuitem', { name: 'Test MIDI', exact: true }).click();
  await expect(page.locator('#notice')).toContainText('Test MIDI ·');
  await page.evaluate(() => { window.neonCapture.start(); (window as any).playNote(true); }); await page.waitForTimeout(350);
  const audio = await page.evaluate(() => { (window as any).playNote(false); return window.neonCapture.finish(); }); expect(audio.peak).toBeGreaterThan(.001);
  expect(await page.locator('.tab-editor:not([hidden]) .cm-content').innerText()).toBe(before);
  expect(await page.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('studio.midi-take:') || k.startsWith('studio.composition-midi:')))).toEqual([]);
  await expect(page.locator('.pending-code')).toHaveCount(0);
});

test('pattern MIDI capture retains its destination across tabs and publishes only accepted code', async ({ page }) => {
  await midi(page); await replaceBody(page, 'note("c4").s("triangle").gain(.2)');
  await page.locator('.tab-editor:not([hidden]) [data-input-function=note]').click(); await page.getByRole('menuitem', { name: 'Record MIDI solo', exact: true }).click(); await page.locator('[data-capture=audio]').click();

  await expect(page.locator('.performance-panel [data-destination]')).toContainText('Lead');
  await expect(page.locator('#midi-record')).toHaveCount(0); await expect(page.locator('#record-settings')).toBeHidden();
  await page.locator('#record-toggle').click(); await expect(page.locator('.pending-code')).toContainText('Recording'); await page.waitForTimeout(75); await page.evaluate(() => (window as any).playNote(true)); await page.waitForTimeout(200); await page.evaluate(() => (window as any).playNote(false));
  expect(await page.evaluate(() => { const key = Object.keys(localStorage).find(key => key.startsWith('studio.midi-take:'))!; return JSON.parse(localStorage.getItem(key)!).length; })).toBeLessThan(2);
  await expect(page.locator('.pending-code')).toContainText('Recording'); await expect(page.locator('.performance-review')).toBeHidden(); await page.locator('#stop').click();
  await expect(page.locator('.performance-review')).toBeVisible();
  await expect(page.locator('.pending-code')).toContainText('Ready to review');
  await page.keyboard.press('Escape'); await page.getByRole('tab', { name: 'Rhythm', exact: true }).click();
  await expect(page.locator('#record-bar')).toBeVisible();
  await expect(page.locator('.performance-panel [data-destination]')).toContainText('Lead');
  await page.locator('.performance-panel [data-accept]').click(); await expect(page.locator('.performance-panel')).toBeHidden();
  const saved = await project(page); expect(saved.tabs.find((t: any) => t.name === 'Lead').code).toContain('note(64)'); expect(saved.tabs).toHaveLength(4);
  await expect(page.locator('.pending-code')).toHaveCount(0);
});

test('pattern accompaniment records into the selected phrase without creating variations', async ({ page }) => {
  await installAudioCapture(page); await midi(page); await replaceBody(page, 'note("c4").s("triangle").gain(.2); note("g4").s("sawtooth").gain(.1)');
  await page.locator('.tab-editor:not([hidden]) [data-input-function=note]').first().click(); await page.getByRole('menuitem', { name: 'Record MIDI on pattern', exact: true }).click(); await page.locator('[data-capture=audio]').click();
  await expect(page.locator('#play-target')).toHaveValue('tab'); await expect(page.locator('#midi-record-hint')).toContainText('MIDI → selected note');
  await expect(page.locator('#transport-state')).toContainText('Stopped');
  await page.evaluate(() => window.neonCapture.start()); await page.locator('#record-toggle').click();
  await expect(page.locator('.pending-code')).toContainText('Recording'); await page.waitForTimeout(300);
  expect((await page.evaluate(() => window.neonCapture.finish())).peak).toBeGreaterThan(.001);
  await page.evaluate(() => (window as any).playNote(true)); await page.waitForTimeout(200); await page.evaluate(() => (window as any).playNote(false)); await page.locator('#stop').click();
  await page.locator('.performance-panel [data-accept]').click();
  await expect(page.locator('.performance-panel')).toBeHidden();
  const saved = await project(page), lead = saved.tabs.find((t: any) => t.name === 'Lead');
  expect(lead.code).toContain('note(64)'); expect(lead.code).toContain('note("g4")'); expect(saved.tabs).toHaveLength(4);
  await expect(page.locator('[data-sheet=transcribe]')).toHaveCount(0);
});

test('failed MIDI acceptance retains original code and a retryable take', async ({ page }) => {
  await midi(page); await replaceBody(page, 'note("c4").s("triangle").gain(.2)');
  await page.locator('.tab-editor:not([hidden]) [data-input-function=note]').click(); await page.getByRole('menuitem', { name: 'Record MIDI solo', exact: true }).click(); await page.locator('[data-capture=audio]').click();

  await page.locator('#record-toggle').click(); await expect(page.locator('.pending-code')).toContainText('Recording'); await page.waitForTimeout(75);
  await page.evaluate(() => (window as any).playNote(true)); await page.waitForTimeout(150); await page.evaluate(() => (window as any).playNote(false)); await page.locator('#stop').click();
  await page.evaluate(() => { const put = IDBObjectStore.prototype.put; (window as any).restoreWrites = () => { IDBObjectStore.prototype.put = put; }; IDBObjectStore.prototype.put = function(...args: Parameters<typeof put>) { if (this.name === 'projects') throw new DOMException('Storage full', 'QuotaExceededError'); return Reflect.apply(put, this, args); }; });
  await page.locator('.performance-panel [data-accept]').click(); await expect(page.locator('#notice')).toContainText('Storage full');
  await expect(page.locator('.tab-editor:not([hidden]) .cm-content')).toContainText('note("c4")'); await expect(page.locator('.pending-code')).toContainText('Ready to review');
  await page.evaluate(() => (window as any).restoreWrites()); await page.locator('.performance-panel [data-accept]').click();
  await expect(page.locator('.performance-panel')).toBeHidden(); expect((await project(page)).tabs.find((t: any) => t.name === 'Lead').code).toContain('note(64)');
});

test('beat editing and keyboard trims preserve source phase and reject extension before source zero', async ({ page }) => {
  await boot(page); await page.locator('#snap').selectOption('0.25');
  const first = (await project(page)).clips[0]; let clip = page.locator(`[data-clip="${first.id}"]`);
  await clip.focus(); await page.keyboard.press('Alt+ArrowLeft'); await page.locator('#save-now').click(); await expect(page.locator('#saved-state')).toHaveText('Saved in this browser');
  expect((await project(page)).clips.find((c: any) => c.id === first.id).start).toBe(first.start);
  await clip.focus(); await page.keyboard.press('Alt+ArrowRight'); await page.locator('#save-now').click(); await expect(page.locator('#saved-state')).toHaveText('Saved in this browser');
  let saved = (await project(page)).clips.find((c: any) => c.id === first.id); expect(saved.start).toBe(first.start + .25); expect(saved.length).toBe(first.length - .25); expect(saved.sourceOffset).toBe(.25);
  await clip.click(); await expect(page.locator('#clip-start')).toHaveValue(String(saved.start * 4 + 1)); await expect(page.locator('#clip-length')).toHaveValue(String(saved.length * 4)); await page.keyboard.press('Escape');
  await clip.focus(); await page.keyboard.press('Shift+ArrowLeft'); await page.locator('#save-now').click(); await expect(page.locator('#saved-state')).toHaveText('Saved in this browser');
  saved = (await project(page)).clips.find((c: any) => c.id === first.id); expect(saved.length).toBe(first.length - .5); expect(saved.sourceOffset).toBe(.25);
});

test('source BPM changes trigger spacing consistently in live tab playback and offline render', async ({ page }) => {
  await installAudioCapture(page); await boot(page); await replaceBody(page, 'note("c4").s("triangle").attack(0).decay(.04).sustain(0).release(0).gain(.3)');
  await page.getByRole('tab', { name: 'Lead', exact: true }).click({ button: 'right' }); await page.getByRole('menuitem', { name: 'Pattern tempo…', exact: true }).click();
  await page.locator('#edit-name').fill('84'); await page.locator('#edit-dialog button[value=confirm]').click();
  await page.locator('[data-play-target=tab]').click(); await page.evaluate(() => window.neonCapture.start()); await page.locator('#play').click(); await page.waitForTimeout(3600);
  await page.locator('#stop').click(); const live = await page.evaluate(() => window.neonCapture.finish());
  const liveWav = decodeWav(Buffer.from(live.wav, 'base64'));
  const onsets = (samples: Float32Array, rate: number) => { const times: number[] = []; for (let i = 0; i < samples.length; i++) if (Math.abs(samples[i]) > .005 && (!times.length || i / rate - times[times.length - 1] > .2)) times.push(i / rate); return times; };
  const liveTimes = onsets(liveWav.left, liveWav.rate); expect(liveTimes.length).toBeGreaterThanOrEqual(2); expect(liveTimes[1] - liveTimes[0]).toBeCloseTo(240 / 84, 1);
  await action(page, 'Export full song render'); await page.locator('#export-source').selectOption('tab'); await page.locator('#export-cycles').fill('4'); await page.locator('#export-tail').fill('0'); await page.locator('#export-format').selectOption('float32'); await page.locator('#export-code').selectOption('draft');
  const download = page.waitForEvent('download'); await page.locator('#render-audio').click(); const audio = decodeWav(await readFile((await (await download).path())!));
  expect(audio.left.length / audio.rate).toBeCloseTo(4 * 240 / 168, 3);
  const times = onsets(audio.left, audio.rate); expect(times).toHaveLength(2); expect(times[1] - times[0]).toBeCloseTo(240 / 84, 2);
  // A trimmed placement queries source phase at the source rate, then maps its events back to project time.
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>(resolve => { const r = indexedDB.open('strudel-studio'); r.onsuccess = () => resolve(r.result); });
    await new Promise<void>(resolve => { const tx = db.transaction('projects', 'readwrite'), store = tx.objectStore('projects'), r = store.get('Neon-Drive'); r.onsuccess = () => { const p = r.result, lead = p.tabs.find((t: any) => t.name === 'Lead'); p.clips = [{ id: 'timing-window', tabId: lead.id, trackId: p.tracks[0].id, start: 1, length: 2, sourceOffset: .5, muted: false }]; p.soloTrackId = undefined; p.tracks.forEach((t: any) => t.muted = false); store.put(p, 'Neon-Drive'); }; tx.oncomplete = () => resolve(); }); db.close();
  });
  await page.reload(); await expect(page.locator('#saved-projects')).toHaveValue('Neon-Drive'); await action(page, 'Export full song render'); await page.locator('#export-tail').fill('0'); await page.locator('#export-format').selectOption('float32'); await page.locator('#export-code').selectOption('draft');
  const compositionDownload = page.waitForEvent('download'); await page.locator('#render-audio').click(); const composition = decodeWav(await readFile((await (await compositionDownload).path())!));
  const compositionTimes = onsets(composition.left, composition.rate); expect(compositionTimes).toHaveLength(1); expect(compositionTimes[0]).toBeCloseTo(2 * 240 / 168, 2); expect(composition.left.length / composition.rate).toBeCloseTo(3 * 240 / 168, 3);
});

test('MIDI recovery reopens the shared bar and discard leaves original code intact', async ({ page }) => {
  await midi(page); await replaceBody(page, 'note("c4").s("triangle")');
  await page.locator('.tab-editor:not([hidden]) [data-input-function=note]').click(); await page.getByRole('menuitem', { name: 'Record MIDI solo', exact: true }).click(); await page.locator('[data-capture=audio]').click();
  await page.locator('#record-toggle').click(); await expect(page.locator('.pending-code')).toContainText('Recording'); await page.waitForTimeout(75); await page.evaluate(() => (window as any).playNote(true)); await page.waitForTimeout(150); await page.evaluate(() => (window as any).playNote(false)); await page.locator('#stop').click();
  await page.reload(); await expect(page.locator('#record-bar')).toBeVisible(); await expect(page.locator('.performance-panel [data-state]')).toContainText('Recovered');
  await page.locator('.performance-panel [data-discard]').click(); await expect(page.locator('.pending-code')).toHaveCount(0);
  await expect(page.locator('.tab-editor:not([hidden]) .cm-content')).toContainText('note("c4")');
});

test('highlighted sound audio appends to the same pattern through the shared recorder', async ({ page }) => {
  await installAudioCapture(page); await midi(page);
  await page.locator('.tab-editor:not([hidden]) [data-input-function=note]').first().click(); await page.getByRole('menuitem', { name: 'Record MIDI solo', exact: true }).click();
  await page.locator('#palette-open').click(); await page.locator('#command-palette input').fill('Open Sample Catalogue'); await page.keyboard.press('Enter'); await page.locator('#add-sounds summary').click();
  await page.getByRole('button', { name: 'Record highlighted sound', exact: true }).click(); await expect(page.locator('#sounds-panel')).toBeHidden();
  await page.locator('#record-toggle').click(); await expect(page.locator('#record-toggle')).toHaveText('Stop'); await page.waitForTimeout(75);
  await page.evaluate(() => (window as any).playNote(true)); await page.waitForTimeout(200); await page.evaluate(() => (window as any).playNote(false));
  await page.locator('#stop').click(); await expect(page.locator('#record-retry')).toHaveText('Keep take'); await page.locator('#record-retry').click(); await expect(page.locator('#record-status')).toContainText('Audio saved in pattern');
  const saved = await project(page); expect(saved.tabs).toHaveLength(4); expect(saved.tabs.find((t:any) => t.name === 'Lead').code).toContain('// Recorded audio');
});

test('metronome toggles gold, counts in both playback targets, and Stop cancels the start', async ({ page }) => {
  await installAudioCapture(page); await boot(page); await page.locator('#bpm').fill('240'); await page.locator('#bpm').press('Tab');
  const toggle = page.getByRole('button', { name: 'Metronome', exact: true });
  await expect(toggle).toHaveAttribute('aria-pressed', 'false'); await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await page.mouse.move(0, 0); const recordRed = await page.locator('#record-toggle').evaluate(el => getComputedStyle(el).color); expect(await toggle.evaluate(el => getComputedStyle(el).color)).not.toBe(recordRed); await expect(toggle).toHaveCSS('color', 'rgb(145, 99, 0)');
  for (const target of ['tab', 'composition']) {
    await page.locator(`[data-play-target=${target}]`).click(); const play = page.locator(target === 'tab' ? '#play' : '#composition-play'), stop = page.locator(target === 'tab' ? '#stop' : '#composition-stop');
    await play.click(); await expect(page.locator('#count-in-beat')).toHaveText('4'); await stop.click(); await page.waitForTimeout(1100); await expect(page.locator('#transport-state')).toContainText('Stopped'); await expect(page.locator('#count-in-beat')).toBeEmpty();
    await page.evaluate(() => window.neonCapture.start()); const start = Date.now(); await play.click(); await expect(page.locator('#transport-state')).toContainText('Count-in'); await expect(page.locator('#count-in-beat')).toBeEmpty({ timeout: 5000 });
    expect(Date.now() - start).toBeGreaterThanOrEqual(950); await expect(page.locator('#transport-state')).toContainText('beat'); await stop.click(); expect((await page.evaluate(() => window.neonCapture.finish())).peak).toBeGreaterThan(.001);
  }
  await page.reload(); await expect(toggle).toHaveAttribute('aria-pressed', 'true'); await toggle.click(); await expect(toggle).toHaveAttribute('data-mode', 'continuous'); await toggle.click(); await expect(toggle).toHaveAttribute('aria-pressed', 'false');
});

test('recording count-in waits before microphone capture and cancels without a take', async ({ page }) => {
  await page.addInitScript(() => { navigator.mediaDevices.getUserMedia = async () => { const context = new AudioContext(), oscillator = context.createOscillator(), destination = context.createMediaStreamDestination(); oscillator.connect(destination); oscillator.start(); await context.resume(); return destination.stream; }; });
  await boot(page); await page.locator('#bpm').fill('240'); await page.locator('#bpm').press('Tab'); await page.locator('#count-in').click(); await page.locator('#record-toggle').click();
  await page.locator('#record-toggle').click(); await expect(page.locator('#count-in-beat')).toHaveText('4'); await expect(page.locator('#record-toggle')).toHaveText('Cancel'); await page.locator('#stop').click();
  await expect(page.locator('#record-status')).toContainText('cancelled'); await page.waitForTimeout(1100); expect((await project(page)).tabs.some((t: any) => t.audioAssetId)).toBe(false);
  await page.locator('#record-toggle').click(); await expect(page.locator('#transport-state')).toContainText('Count-in'); await expect(page.locator('#record-status')).toContainText('recording', { timeout: 5000 }); await page.waitForTimeout(250); await page.locator('#record-toggle').click(); await expect(page.locator('#record-status')).toContainText('Audio saved in pattern', { timeout: 15000 });
});

test('MIDI phrase recording waits for the metronome and ignores notes during the countdown', async ({ page }) => {
  await midi(page); await page.locator('#bpm').fill('240'); await page.locator('#bpm').press('Tab'); await page.locator('#count-in').click();
  await page.locator('.tab-editor:not([hidden]) [data-input-function=note]').first().click(); await page.getByRole('menuitem', { name: 'Record MIDI solo', exact: true }).click(); await page.locator('[data-capture=audio]').click();
  await page.locator('#record-toggle').click(); await expect(page.locator('#count-in-beat')).toHaveText('4'); await page.evaluate(() => { (window as any).playNote(true); (window as any).playNote(false); });
  await expect(page.locator('.pending-code')).toContainText('Preparing'); await expect(page.locator('#count-in-beat')).toBeEmpty({ timeout: 5000 });
  await expect(page.locator('.pending-code')).toContainText('Recording'); await page.waitForTimeout(75); await page.evaluate(() => (window as any).playNote(true)); await page.waitForTimeout(120); await page.evaluate(() => (window as any).playNote(false)); await page.locator('#stop').click();
  expect(await page.evaluate(() => { const key = Object.keys(localStorage).find(key => key.startsWith('studio.midi-take:'))!; return JSON.parse(localStorage.getItem(key)!).notes.length; })).toBe(1); await page.locator('.performance-panel [data-discard]').click();
});

test('MIDI can append instrument notes without requesting microphone access', async ({ page }) => {
  await page.addInitScript(() => { navigator.mediaDevices.getUserMedia = async () => { throw new Error('Microphone must not be requested for MIDI-only recording'); }; });
  await midi(page); await page.locator('#record-toggle').click(); await page.locator('[data-capture=audio]').click(); await page.locator('[data-capture=midi]').click();
  await page.locator('#record-toggle').click(); await expect(page.locator('#record-toggle')).toHaveText('Stop'); await page.waitForTimeout(75);
  await page.evaluate(() => (window as any).playNote(true)); await page.waitForTimeout(250); await page.evaluate(() => (window as any).playNote(false));
  await page.locator('#stop').click(); await page.locator('.performance-panel [data-accept]').click(); await expect(page.locator('.performance-panel')).toBeHidden();
  const saved = await project(page); expect(saved.tabs).toHaveLength(4); expect(saved.tabs.find((t:any) => t.name === 'Lead').code).toContain('// Recorded MIDI');
});

test('legacy audio recovery uses the Record bar without exposing another capture form', async ({ page }) => {
  await boot(page);
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>(resolve => { const r = indexedDB.open('strudel-pending-work', 1); r.onupgradeneeded = () => r.result.createObjectStore('pending'); r.onsuccess = () => resolve(r.result); });
    await new Promise<void>(resolve => {
      const tx = db.transaction('pending', 'readwrite'), store = tx.objectStore('pending');
      store.put({ source: 'internal', bpm: 168, offset: 0, rate: 48000, tabId: 'lead', mode: 'wet', effectsCode: 'AUDIO', destination: { tabId: crypto.randomUUID(), clipId: crypto.randomUUID(), trackId: 'track-1' } }, 'audio:Neon-Drive:meta');
      const left = Float32Array.from({ length: 4800 }, (_, i) => Math.sin(i / 10) * .1);
      store.put({ left, right: left }, 'audio:Neon-Drive:chunk:00000000'); tx.oncomplete = () => resolve();
    }); db.close();
  });
  await page.reload(); await expect(page.locator('#record-bar')).toBeVisible();
  await expect(page.locator('.recording-recovery')).toBeVisible(); await expect(page.locator('.recording-recovery [data-record]')).toHaveCount(0);
  await page.locator('.recording-recovery [data-save]').click(); await expect(page.locator('.recording-recovery')).toBeHidden();
  expect((await project(page)).tabs.some((t: any) => t.audioAssetId)).toBe(true);
});
