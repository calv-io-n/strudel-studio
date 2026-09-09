import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { installAudioCapture } from './audio-capture';
import { encodeWav, decodeWav } from '../shared/wav';
const wave = Buffer.from(encodeWav(Float32Array.from({ length: 4410 }, (_, i) => Math.sin(i / 10) * .2), Float32Array.from({ length: 4410 }, (_, i) => Math.sin(i / 10) * .2), 44100).buffer);
async function start(page: Page, route = '/') { await page.goto(route); await expect(page.locator('#saved-projects')).toHaveValue('Drum-Basics'); }
async function records(page: Page, store: string) { return page.evaluate(async store => { const db = await new Promise<IDBDatabase>((resolve, reject) => { const r = indexedDB.open('strudel-studio', 1); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); }); return new Promise<any[]>((resolve, reject) => { const r = db.transaction(store).objectStore(store).getAll(); r.onsuccess = () => { resolve(r.result); db.close(); }; r.onerror = () => reject(r.error); }); }, store); }
async function importWave(page: Page) { await page.locator('.import-nav').click(); await page.locator('[data-files]').setInputFiles({ name: 'test-tone.wav', mimeType: 'audio/wav', buffer: wave }); await page.locator('[data-import]').click(); await expect(page.locator('[data-import-status]')).toContainText('Import finished'); }

test('static startup, both starters produce audio, save survives reload, no backend or remote samples', async ({ page }) => {
  await installAudioCapture(page);
  const requests: string[] = [], sockets: string[] = [], errors: string[] = [];
  page.on('request', r => requests.push(r.url())); page.on('websocket', s => sockets.push(s.url())); page.on('pageerror', e => errors.push(e.stack ?? e.message));
  await page.route(/^https?:\/\/(?!127\.0\.0\.1:5175)/, r => r.abort());
  await start(page); expect(await records(page, 'projects')).toHaveLength(2); expect(await records(page, 'assets')).toHaveLength(6);
  for (const id of ['Drum-Basics', 'Neon-Drive']) {
    await page.locator('#saved-projects').selectOption(id);
    await page.evaluate(() => window.neonCapture.start()); await page.locator('#composition-play').click();
    await expect.poll(() => page.evaluate(() => window.neonCapture.frames)).toBeGreaterThan(24000);
    const audio = await page.evaluate(() => window.neonCapture.finish()); expect(audio.peak).toBeGreaterThan(.001);
    await page.locator('#composition-stop').click();
  }
  await page.locator('#project-name').fill('My browser song'); await page.locator('#save-now').click(); await expect(page.locator('#saved-state')).toHaveText('Saved in this browser');
  await page.reload(); await expect(page.locator('#project-name')).toHaveValue('My browser song'); expect(await records(page, 'projects')).toHaveLength(2);
  expect(requests.filter(url => /^https?:/.test(url) && (!url.startsWith('http://127.0.0.1:5175/') || url.includes('/api/')))).toEqual([]); expect(sockets).toEqual([]); expect(errors).toEqual([]);
});

test('GitHub page imports directly, deduplicates, preserves draft, and survives reload', async ({ page }) => {
  const sha = 'a'.repeat(40), tree = 'b'.repeat(40), remote: string[] = [];
  await page.route('https://api.github.com/**', async route => { remote.push(route.request().url()); const url = route.request().url(); await route.fulfill({ json: url.includes('/git/trees/') ? { tree: [{ type: 'blob', mode: '100644', path: 'tone.wav', size: wave.length }], truncated: false } : url.includes('/commits/') ? { sha, commit: { tree: { sha: tree } } } : { default_branch: 'main' } }); });
  await page.route('https://raw.githubusercontent.com/**', async route => { remote.push(route.request().url()); await route.fulfill({ body: wave, contentType: 'audio/wav' }); });
  await start(page); await page.locator('#project-name').fill('Keep this draft'); await page.locator('.import-nav').click();
  await expect(page.getByRole('heading', { name: 'Bring your own sounds.' })).toBeVisible();
  await page.locator('[data-url]').fill('https://github.com/test/kit'); await page.locator('[data-discover]').click(); await expect(page.locator('[data-github-status]')).toContainText('1 samples');
  await page.locator('[data-download]').click(); await expect(page.locator('[data-github-status]')).toContainText('1 downloaded');
  await page.locator('[data-import]').click(); await expect(page.locator('[data-import-status]')).toContainText('Import finished'); expect(await records(page, 'assets')).toHaveLength(7);
  expect(remote).toContain(`https://raw.githubusercontent.com/test/kit/${sha}/tone.wav`);
  await page.locator('[data-download]').click(); await expect(page.locator('[data-github-status]')).toContainText('1 downloaded'); await page.locator('[data-import]').click(); await expect(page.locator('[data-review]')).toContainText('Already imported'); expect(await records(page, 'assets')).toHaveLength(7);
  await page.getByRole('link', { name: 'Back to Studio', exact: false }).click(); await expect(page.locator('#project-name')).toHaveValue('Keep this draft');
  await page.locator('#save-now').click(); await page.reload(); await expect(page.locator('#project-name')).toHaveValue('Keep this draft'); expect(await records(page, 'assets')).toHaveLength(7);
});

test('GitHub failures and cancellation remain recoverable; corrupt upload does not enter library', async ({ page }) => {
  await page.route('https://api.github.com/**', r => r.fulfill({ status: 403, json: { message: 'rate limit' } }));
  await start(page, '/#/samples/import'); await page.locator('[data-url]').fill('https://github.com/test/kit'); await page.locator('[data-discover]').click(); await expect(page.locator('[data-github-status]')).toContainText('rate limit');
  await page.unroute('https://api.github.com/**'); await page.route('https://api.github.com/**', async r => { await new Promise(resolve => setTimeout(resolve, 250)); await r.fulfill({ json: {} }).catch(() => {}); });
  await page.locator('[data-discover]').click(); await page.getByRole('button', { name: 'Cancel GitHub request' }).click(); await expect(page.locator('[data-github-status]')).toContainText(/cancel|abort/i);
  await page.locator('[data-files]').setInputFiles({ name: 'broken.wav', mimeType: 'audio/wav', buffer: Buffer.from('not audio') }); await page.locator('[data-import]').click(); await expect(page.locator('[data-import-status]')).toContainText('Import finished'); expect(await records(page, 'assets')).toHaveLength(6);
});

test('project backups preserve imported audio and restore without overwriting a session', async ({ page }) => {
  await start(page); await importWave(page); await page.getByRole('link', { name: 'Back to Studio', exact: false }).click(); await page.locator('#save-now').click();
  await page.locator('.project-menu > summary').click();
  const download = page.waitForEvent('download'); await page.locator('#backup-project').click(); const file = await download; const path = await file.path(); expect(path).toBeTruthy();
  await page.locator('#backup-file').setInputFiles(path!); await expect(page.locator('#saved-projects')).toHaveValue('Drum-Basics-restored'); expect(await records(page, 'projects')).toHaveLength(3); expect(await records(page, 'assets')).toHaveLength(7);
  await page.reload(); await expect(page.locator('#saved-projects')).toHaveValue('Drum-Basics-restored');
});

test('static renderer exports audible sampled WAV', async ({ page }) => {
  await start(page); await page.locator('.project-menu > summary').click(); await page.locator('[data-drawer=export]').click();
  const download = page.waitForEvent('download'); await page.locator('#render-audio').click(); const file = await download; const decoded = decodeWav(await readFile((await file.path())!));
  expect(decoded.left.some(v => Math.abs(v) > .001)).toBeTruthy(); await expect(page.locator('#export-status')).toContainText('Rendered');
});

test('Web MIDI permission is requested only by action; denial leaves virtual controls usable', async ({ page }) => {
  await page.addInitScript(() => { (window as any).midiRequests = 0; Object.defineProperty(navigator, 'requestMIDIAccess', { value: async () => { (window as any).midiRequests++; throw new DOMException('Denied', 'NotAllowedError'); } }); });
  await start(page); expect(await page.evaluate(() => (window as any).midiRequests)).toBe(0);
  await page.locator('[data-drawer=devices]').click(); await page.locator('#reconnect').click(); await expect(page.locator('#bridge-status')).toContainText('denied');
  await page.locator('.project-menu > summary').click(); await page.locator('[data-drawer=midi]').click(); await page.locator('[data-control=knob-0]').fill('50'); await expect(page.locator('[data-value=knob-0]')).toHaveText('50');
});

test('Web MIDI input connects, plays, reconnects, and retains selection across sessions and reload', async ({ page }) => {
  await installAudioCapture(page);
  await page.addInitScript(() => {
    const input: any = { id: 'keyboard-1', name: 'Test Keyboard', state: 'connected', onmidimessage: null };
    const access: any = { inputs: new Map([['keyboard-1', input]]), onstatechange: null };
    Object.defineProperty(navigator, 'requestMIDIAccess', { value: async () => access });
    const query = navigator.permissions.query.bind(navigator.permissions);
    navigator.permissions.query = ((descriptor: PermissionDescriptor) => descriptor.name === ('midi' as PermissionName) ? Promise.resolve({ state: 'granted' } as PermissionStatus) : query(descriptor)) as typeof navigator.permissions.query;
    (window as any).testMidi = { note: (on: boolean) => input.onmidimessage?.({ data: new Uint8Array([on ? 144 : 128, 60, on ? 100 : 0]) }), connected: (yes: boolean) => { input.state = yes ? 'connected' : 'disconnected'; access.onstatechange?.(); } };
  });
  await start(page); await page.locator('[data-drawer=devices]').click(); await page.locator('#reconnect').click(); await page.locator('#available-ports').selectOption('Test Keyboard [keyboard-1]'); await page.locator('#add-profile').click(); await expect(page.locator('.device-connection')).toContainText('Connected');
  await page.evaluate(() => { window.neonCapture.start(); (window as any).testMidi.note(true); }); await expect.poll(() => page.evaluate(() => window.neonCapture.frames)).toBeGreaterThan(12000); const audio = await page.evaluate(() => { (window as any).testMidi.note(false); return window.neonCapture.finish(); }); expect(audio.peak).toBeGreaterThan(.001);
  await expect(page.locator('#device-activity')).toContainText('Note 60');
  await page.evaluate(() => (window as any).testMidi.connected(false)); await expect(page.locator('.device-connection')).toContainText('Waiting for device');
  await page.evaluate(() => (window as any).testMidi.connected(true)); await expect(page.locator('.device-connection')).toContainText('Connected');
  await page.locator('#saved-projects').selectOption('Neon-Drive'); await page.locator('#save-now').click(); await page.reload(); await expect(page.locator('#saved-projects')).toHaveValue('Neon-Drive'); await page.locator('[data-drawer=devices]').click(); await expect(page.locator('.device-connection')).toContainText('Connected');
});

test('recording saves real captured audio to browser storage and survives reload', async ({ page }) => {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      const context = new AudioContext(), oscillator = context.createOscillator(), gain = context.createGain(), destination = context.createMediaStreamDestination();
      oscillator.frequency.value = 880; gain.gain.value = .1; oscillator.connect(gain).connect(destination); oscillator.start(); await context.resume();
      return destination.stream;
    };
    navigator.mediaDevices.enumerateDevices = async () => [];
  });
  await start(page); await page.locator('#sounds-toggle').click(); await page.locator('#add-sounds > summary').click();
  await page.getByRole('button', { name: 'Record audio', exact: true }).click(); await page.getByRole('button', { name: 'Record audio take', exact: true }).click();
  await expect(page.locator('[data-status]')).toContainText('Recording'); await page.waitForTimeout(400);
  await page.getByRole('button', { name: 'Stop recording', exact: true }).click(); await expect(page.locator('[data-save]')).toBeEnabled(); await page.locator('[data-save]').click();
  await expect.poll(async () => (await records(page, 'assets')).filter(a => a.provider === 'recording').length).toBe(1);
  const recording = (await records(page, 'assets')).find(a => a.provider === 'recording'); expect(recording.duration).toBeGreaterThan(.1);
  await page.locator('#sounds-close').click(); await page.locator('#save-now').click(); await page.reload(); await expect(page.locator('#saved-projects')).toHaveValue('Drum-Basics'); expect((await records(page, 'assets')).some(a => a.id === recording.id)).toBeTruthy();
});

test('storage exhaustion preserves the saved project and draft, then retry succeeds', async ({ page }) => {
  await start(page);
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.put;
    (window as any).restorePut = () => { IDBObjectStore.prototype.put = original; };
    IDBObjectStore.prototype.put = function(...args: Parameters<IDBObjectStore['put']>) { if (this.name === 'projects') { this.transaction.abort(); throw new DOMException('Quota exceeded', 'QuotaExceededError'); } return original.apply(this, args); };
  });
  await page.locator('#project-name').fill('Retain this unsaved draft'); await page.locator('#save-now').click(); await expect(page.locator('#saved-state')).toContainText('Not saved');
  expect((await records(page, 'projects')).find(p => p.sessionId === 'Drum-Basics').name).toBe('Drum Basics'); await expect(page.locator('#project-name')).toHaveValue('Retain this unsaved draft');
  await page.evaluate(() => (window as any).restorePut()); await page.locator('#save-now').click(); await expect(page.locator('#saved-state')).toHaveText('Saved in this browser'); await page.reload(); await expect(page.locator('#project-name')).toHaveValue('Retain this unsaved draft');
});

test('composition edits, MIDI presets, and import-route themes remain usable', async ({ page }) => {
  await start(page); await page.locator('[data-drawer=composition]').click(); if (!await page.locator('#composition-content').isVisible()) await page.locator('[data-drawer=composition]').click();
  await page.locator('#snap').selectOption('0.25'); await page.getByRole('button', { name: 'Mute Track 1', exact: true }).click(); await expect(page.getByRole('button', { name: 'Unmute Track 1', exact: true })).toBeVisible(); await page.locator('#save-now').click(); await expect(page.locator('#saved-state')).toHaveText('Saved in this browser'); await page.reload(); await expect(page.locator('#snap')).toHaveValue('0.25'); expect((await records(page, 'projects')).find(p => p.sessionId === 'Drum-Basics').tracks[0].muted).toBe(true);
  await page.getByRole('tab', { name: 'MIDI instrument', exact: true }).click(); await page.locator('#instrument-apply').click(); await page.locator('#save-midi-preset').click(); await page.locator('#edit-name').fill('Starter keys'); await page.locator('#edit-dialog button[value=confirm]').click(); await expect.poll(async () => (await records(page, 'presets')).length).toBe(1);
  await page.locator('#dark-mode').check(); await page.locator('.import-nav').click(); await expect(page.locator('#sample-import-page')).toBeVisible(); expect(await page.locator('#sample-import-page').evaluate(el => getComputedStyle(el).backgroundColor)).toBe('rgb(32, 35, 41)');
  await page.setViewportSize({ width: 390, height: 844 }); expect(await page.locator('#sample-import-page').evaluate(el => el.scrollWidth <= el.clientWidth)).toBeTruthy();
});
