import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { installAudioCapture } from './audio-capture';
import { encodeWav, decodeWav } from '../shared/wav';
const forbidden = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page }) => {
  const requests: string[] = []; forbidden.set(page, requests);
  page.on('request', request => { const url = new URL(request.url()); if (url.pathname.startsWith('/api/') || /^wss?:$/.test(url.protocol) || ['localhost', '127.0.0.1'].includes(url.hostname) && url.origin !== 'http://127.0.0.1:5185') requests.push(url.href); });
  page.on('websocket', socket => requests.push(socket.url()));
});
test.afterEach(async ({ page }) => { expect(forbidden.get(page)).toEqual([]); });
const wave = Buffer.from(encodeWav(Float32Array.from({ length: 4410 }, (_, i) => Math.sin(i / 10) * .2), Float32Array.from({ length: 4410 }, (_, i) => Math.sin(i / 10) * .2), 44100).buffer);
async function start(page: Page, route = '/') { await page.goto(route); await expect(page.locator('#saved-projects')).toHaveValue('Neon-Drive'); }
async function records(page: Page, store: string) { return page.evaluate(async store => { const db = await new Promise<IDBDatabase>((resolve, reject) => { const r = indexedDB.open('strudel-studio'); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); }); return new Promise<any[]>((resolve, reject) => { const r = db.transaction(store).objectStore(store).getAll(); r.onsuccess = () => { resolve(r.result); db.close(); }; r.onerror = () => reject(r.error); }); }, store); }
async function importWave(page: Page, bytes = wave) { await page.locator('.import-nav').click(); await page.locator('[data-files]').setInputFiles({ name: 'test-tone.wav', mimeType: 'audio/wav', buffer: bytes }); await page.locator('[data-import]').click(); await expect(page.locator('[data-import-status]')).toContainText('Import finished'); }

test('static startup, synth starter produces audio, save survives reload, no backend or remote samples', async ({ page }) => {
  await installAudioCapture(page);
  const requests: string[] = [], sockets: string[] = [], errors: string[] = [];
  page.on('request', r => requests.push(r.url())); page.on('websocket', s => sockets.push(s.url())); page.on('pageerror', e => errors.push(e.stack ?? e.message));
  await page.route(/^https?:\/\/(?!127\.0\.0\.1:5185)/, r => r.abort());
  await start(page); expect(await records(page, 'projects')).toHaveLength(1); expect(await records(page, 'assets')).toHaveLength(0);
  for (const id of ['Neon-Drive']) {
    await page.locator('#saved-projects').selectOption(id);
    await page.evaluate(() => window.neonCapture.start()); await page.locator('#composition-play').click();
    await expect.poll(() => page.evaluate(() => window.neonCapture.frames)).toBeGreaterThan(24000);
    const audio = await page.evaluate(() => window.neonCapture.finish()); expect(audio.peak).toBeGreaterThan(.001);
    await page.locator('#composition-stop').click();
  }
  await page.locator('#project-name').fill('My browser song'); await page.locator('#save-now').click(); await expect(page.locator('#saved-state')).toHaveText('Saved in this browser');
  await page.reload(); await expect(page.locator('#project-name')).toHaveValue('My browser song'); expect(await records(page, 'projects')).toHaveLength(1);
  expect(requests.filter(url => /^https?:/.test(url) && (!url.startsWith('http://127.0.0.1:5185/') || url.includes('/api/')))).toEqual([]); expect(sockets).toEqual([]); expect(errors).toEqual([]);
});

test('GitHub page imports directly, deduplicates, preserves draft, and survives reload', async ({ page }) => {
  const sha = 'a'.repeat(40), tree = 'b'.repeat(40), remote: string[] = [];
  await page.route('https://api.github.com/**', async route => { remote.push(route.request().url()); const url = route.request().url(); await route.fulfill({ json: url.includes('/git/trees/') ? { tree: [{ type: 'blob', mode: '100644', path: 'tone.wav', size: wave.length }], truncated: false } : url.includes('/commits/') ? { sha, commit: { tree: { sha: tree } } } : { default_branch: 'main' } }); });
  await page.route('https://raw.githubusercontent.com/**', async route => { remote.push(route.request().url()); await route.fulfill({ body: wave, contentType: 'audio/wav' }); });
  await start(page); await page.locator('#project-name').fill('Keep this draft'); await page.locator('.import-nav').click();
  await expect(page.getByRole('heading', { name: 'Bring your own sounds.' })).toBeVisible();
  await page.locator('[data-url]').fill('https://github.com/test/kit'); await page.locator('[data-discover]').click(); await expect(page.locator('[data-github-status]')).toContainText('1 samples');
  await page.locator('[data-download]').click(); await expect(page.locator('[data-github-status]')).toContainText('1 downloaded');
  await page.locator('[data-import]').click(); await expect(page.locator('[data-import-status]')).toContainText('Import finished'); expect(await records(page, 'assets')).toHaveLength(1);
  expect(remote).toContain(`https://raw.githubusercontent.com/test/kit/${sha}/tone.wav`);
  await page.locator('[data-download]').click(); await expect(page.locator('[data-github-status]')).toContainText('1 downloaded'); await page.locator('[data-import]').click(); await expect(page.locator('[data-review]')).toContainText('Already imported'); expect(await records(page, 'assets')).toHaveLength(1);
  await page.getByRole('link', { name: 'Back to Studio', exact: false }).click(); await expect(page.locator('#project-name')).toHaveValue('Keep this draft');
  await page.locator('#save-now').click(); await page.reload(); await expect(page.locator('#project-name')).toHaveValue('Keep this draft'); expect(await records(page, 'assets')).toHaveLength(1);
});

test('GitHub failures and cancellation remain recoverable; corrupt upload does not enter library', async ({ page }) => {
  await page.route('https://api.github.com/**', r => r.fulfill({ status: 403, json: { message: 'rate limit' } }));
  await start(page, '/#/samples/import'); await page.locator('[data-url]').fill('https://github.com/test/kit'); await page.locator('[data-discover]').click(); await expect(page.locator('[data-github-status]')).toContainText('rate limit');
  await page.unroute('https://api.github.com/**'); await page.route('https://api.github.com/**', async r => { await new Promise(resolve => setTimeout(resolve, 250)); await r.fulfill({ json: {} }).catch(() => {}); });
  await page.locator('[data-discover]').click(); await page.getByRole('button', { name: 'Cancel GitHub request' }).click(); await expect(page.locator('[data-github-status]')).toContainText(/cancel|abort/i);
  await page.locator('[data-files]').setInputFiles({ name: 'broken.wav', mimeType: 'audio/wav', buffer: Buffer.from('not audio') }); await page.locator('[data-import]').click(); await expect(page.locator('[data-import-status]')).toContainText('Import finished'); expect(await records(page, 'assets')).toHaveLength(0);
});

test('project backups preserve imported audio and restore without overwriting a session', async ({ page }) => {
  await start(page); await importWave(page); await page.getByRole('link', { name: 'Back to Studio', exact: false }).click(); await page.locator('#save-now').click();
  await page.locator('.project-menu > summary').click();
  const download = page.waitForEvent('download'); await page.locator('#backup-project').click(); const file = await download; const path = await file.path(); expect(path).toBeTruthy();
  await page.locator('#backup-file').setInputFiles(path!); await expect(page.locator('#saved-projects')).toHaveValue('Neon-Drive-restored'); expect(await records(page, 'projects')).toHaveLength(2); expect(await records(page, 'assets')).toHaveLength(1);
  await page.reload(); await expect(page.locator('#saved-projects')).toHaveValue('Neon-Drive-restored');
});

test('static renderer exports audible synth WAV', async ({ page }) => {
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

test('composition Record and Stop create a new take tab on the selected track automatically', async ({ page }) => {
  await fakeInput(page); await start(page); await page.locator('#add-track').click();
  await page.locator('#record-track').selectOption({ label: 'Track 3' });
  await page.locator('#audio-record').click(); await expect(page.locator('#record-status')).toContainText('Recording');
  await expect(page.locator('#sounds-panel')).toBeHidden(); await expect(page.locator('#recording-clip')).toBeVisible();
  await page.waitForTimeout(450); await page.locator('#composition-stop').click(); await page.locator('#composition-stop').click();
  await expect(page.locator('#record-status')).toContainText('saved to the timeline', { timeout: 15000 });
  await expect(page.getByRole('tab', { name: 'Audio take 1', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#take-play')).toBeVisible(); await expect(page.locator('#editor')).toBeHidden();
  const saved = (await records(page, 'projects')).find(p => p.sessionId === 'Neon-Drive');
  expect(saved.tracks).toHaveLength(3); expect(saved.tabs.filter((t: any) => t.audioAssetId)).toHaveLength(1);
  expect(saved.clips.find((c: any) => c.takeId).trackId).toBe(saved.tracks[2].id);
  await page.reload(); await expect(page.getByRole('tab', { name: 'Audio take 1', exact: true })).toBeVisible();
  expect((await records(page, 'assets')).filter(a => a.provider === 'recording')).toHaveLength(2);
});

test('storage exhaustion preserves the saved project and draft, then retry succeeds', async ({ page }) => {
  await start(page);
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.put;
    (window as any).restorePut = () => { IDBObjectStore.prototype.put = original; };
    IDBObjectStore.prototype.put = function(...args: Parameters<IDBObjectStore['put']>) { if (this.name === 'projects') { this.transaction.abort(); throw new DOMException('Quota exceeded', 'QuotaExceededError'); } return original.apply(this, args); };
  });
  await page.locator('#project-name').fill('Retain this unsaved draft'); await page.locator('#save-now').click(); await expect(page.locator('#saved-state')).toContainText('Not saved');
  expect((await records(page, 'projects')).find(p => p.sessionId === 'Neon-Drive').name).toBe('Neon Drive'); await expect(page.locator('#project-name')).toHaveValue('Retain this unsaved draft');
  await page.evaluate(() => (window as any).restorePut()); await page.locator('#save-now').click(); await expect(page.locator('#saved-state')).toHaveText('Saved in this browser'); await page.reload(); await expect(page.locator('#project-name')).toHaveValue('Retain this unsaved draft');
});

test('composition edits, MIDI presets, and import-route themes remain usable', async ({ page }) => {
  await start(page); await page.locator('[data-drawer=composition]').click(); if (!await page.locator('#composition-content').isVisible()) await page.locator('[data-drawer=composition]').click();
  await page.locator('#snap').selectOption('0.25'); await page.getByRole('button', { name: 'Mute Track 1', exact: true }).click(); await expect(page.getByRole('button', { name: 'Unmute Track 1', exact: true })).toBeVisible(); await page.locator('#save-now').click(); await expect(page.locator('#saved-state')).toHaveText('Saved in this browser'); await page.reload(); await expect(page.locator('#snap')).toHaveValue('0.25'); expect((await records(page, 'projects')).find(p => p.sessionId === 'Neon-Drive').tracks[0].muted).toBe(true);
  await page.getByRole('tab', { name: 'MIDI instrument', exact: true }).click(); await page.locator('#instrument-apply').click(); await page.locator('#save-midi-preset').click(); await page.locator('#edit-name').fill('Starter keys'); await page.locator('#edit-dialog button[value=confirm]').click(); await expect.poll(async () => (await records(page, 'presets')).length).toBe(1);
  await page.locator('#dark-mode').check(); await page.locator('.import-nav').click(); await expect(page.locator('#sample-import-page')).toBeVisible(); expect(await page.locator('#sample-import-page').evaluate(el => getComputedStyle(el).backgroundColor)).toBe('rgb(32, 35, 41)');
  await page.setViewportSize({ width: 390, height: 844 }); expect(await page.locator('#sample-import-page').evaluate(el => el.scrollWidth <= el.clientWidth)).toBeTruthy();
});

async function mockStarter(page: Page) {
  const manifest = JSON.parse(await readFile(new URL('../client/public/starter/manifest.json', import.meta.url), 'utf8'));
  await page.route('https://raw.githubusercontent.com/calv-io-n/strudel/**', async route => {
    const id = route.request().url().split('/').pop()!;
    await route.fulfill({ body: await readFile(new URL(`../client/public/starter/${id}`, import.meta.url)), contentType: 'audio/wav' });
  });
  return manifest;
}

test('catalogue is opt-in; install, sampled render, removal and reinstall retain identities', async ({ page }) => {
  const manifest = await mockStarter(page), remote: string[] = [];
  page.on('request', r => { if (r.url().startsWith('https://raw.githubusercontent.com/')) remote.push(r.url()); });
  await start(page); await page.locator('#sounds-toggle').click();
  await expect(page.locator('#catalogue-packs')).toContainText('Not installed'); expect(remote).toEqual([]);
  await page.getByRole('button', { name: 'Install pack', exact: true }).click();
  await expect(page.locator('#catalogue-packs')).toContainText('Installed in this browser'); expect(remote).toHaveLength(6);
  const before = (await records(page, 'assets')).map(a => a.id).sort(); expect(before).toEqual(manifest.assets.map((a: any) => a.id).sort());
  await page.locator('#sounds-close').click(); await page.locator('#saved-projects').selectOption('Drum-Basics');
  await page.locator('.project-menu > summary').click(); await page.locator('[data-drawer=export]').click();
  const download = page.waitForEvent('download'); await page.locator('#render-audio').click(); const file = await download;
  const rendered = decodeWav(await readFile((await file.path())!)); expect(rendered.rate).toBe(48000); expect(rendered.bits).toBe(24); expect(rendered.left.some(n => Math.abs(n) > .01)).toBeTruthy();
  await page.locator('#sounds-toggle').click(); await page.getByRole('button', { name: 'Remove pack', exact: true }).click();
  await expect(page.locator('dialog[open]')).toContainText('Drum Basics'); await page.getByRole('button', { name: 'Remove downloaded pack', exact: true }).click();
  await expect.poll(async () => (await records(page, 'assets')).filter(a => a.missing).length).toBe(6);
  await page.getByRole('button', { name: 'Install pack', exact: true }).click(); await expect(page.locator('#catalogue-packs')).toContainText('Installed in this browser');
  expect((await records(page, 'assets')).map(a => a.id).sort()).toEqual(before); await page.reload(); expect((await records(page, 'assets')).filter(a => !a.missing)).toHaveLength(6);
});

test('OPFS and IndexedDB fallback retain float precision through import and backup', async ({ page }) => {
  await start(page);
  const samples = Float32Array.from({ length: 150000 }, (_, i) => Math.sin(i / 10) * 1e-6);
  const high = Buffer.from(encodeWav(samples, samples, 48000, { format: 'float32' }).buffer);
  await page.locator('.import-nav').click(); await page.locator('[data-files]').setInputFiles({ name: 'precision.wav', mimeType: 'audio/wav', buffer: high });
  await page.locator('[data-import]').click(); await expect(page.locator('[data-import-status]')).toContainText('Import finished');
  const a = (await records(page, 'assets'))[0]; expect(a.precision.working).toBe('float32'); expect(a.precision.rate).toBe(48000);
  const pointers = await records(page, 'audio'); expect(pointers[0].storage).toBe('opfs');
  await page.getByRole('link', { name: 'Back to Studio', exact: false }).click(); await page.locator('#save-now').click();
  await page.locator('.project-menu > summary').click(); const pending = page.waitForEvent('download'); await page.locator('#backup-project').click(); const backup = await pending;
  await page.locator('#backup-file').setInputFiles((await backup.path())!); await expect(page.locator('#saved-projects')).toHaveValue('Neon-Drive-restored');
  await page.reload(); expect((await records(page, 'assets'))[0].id).toBe(a.id);
  // With OPFS absent, the identical import contract uses IndexedDB Blobs.
  await page.evaluate(() => { Object.defineProperty(navigator.storage, 'getDirectory', { configurable: true, value: undefined }); });
  await page.locator('.import-nav').click(); samples[0] = .2;
  const fallback = Buffer.from(encodeWav(samples, samples, 48000, { format: 'float32' }).buffer);
  await page.locator('[data-files]').setInputFiles({ name: 'fallback.wav', mimeType: 'audio/wav', buffer: fallback }); await page.locator('[data-import]').click();
  await expect(page.locator('[data-import-status]')).toContainText('Import finished'); expect(await records(page, 'assets')).toHaveLength(2);
});

async function fakeInput(page: Page) {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      const context = new AudioContext(), oscillator = context.createOscillator(), gain = context.createGain(), destination = context.createMediaStreamDestination();
      oscillator.frequency.value = 880; gain.gain.value = .1; oscillator.connect(gain).connect(destination); oscillator.start(); await context.resume();
      (window as any).fakeInputStream = destination.stream; return destination.stream;
    };
    navigator.mediaDevices.enumerateDevices = async () => [];
  });
}

for (const mode of ['dry', 'wet'] as const) test(`${mode} input take survives reload and renders the applied gain once without hardware`, async ({ page }) => {
  await fakeInput(page); await start(page); await page.locator('#add-track').click();
  await page.getByRole('tab', { name: 'Audio input', exact: true }).click(); await page.locator('#audio-track').selectOption({ label: 'Track 3' });
  await page.locator('#editor .cm-content:visible').fill('AUDIO.gain(slider(0.25, 0, 1))'); await page.locator('#audio-apply').click();
  await page.locator('#audio-connect').click(); await expect(page.locator('#audio-state')).toContainText('Armed'); expect(await page.locator('#audio-monitor').isChecked()).toBe(false);
  await page.locator('#record-track').selectOption({ label: 'Track 3' }); await page.locator('#record-options > summary').click(); await page.locator('#record-mode').selectOption(mode);
  await page.locator('#audio-record').click(); await expect(page.locator('#record-status')).toContainText('Recording'); await page.waitForTimeout(600);
  await page.locator('#audio-record').click(); await expect(page.locator('#record-status')).toContainText('saved to the timeline', { timeout: 15000 });
  await expect.poll(async () => (await records(page, 'assets')).filter(a => a.provider === 'recording').length).toBe(mode === 'wet' ? 2 : 1);
  await expect(page.locator('#record-status')).toContainText('saved to the timeline');
  const saved = (await records(page, 'projects')).find(p => p.sessionId === 'Neon-Drive'); expect(saved.clips.some((c: any) => c.takeId)).toBeTruthy();
  const wet = (await records(page, 'assets')).find(a => a.recording?.mode === mode); if (mode === 'wet') expect(wet.recording.dryAssetId).toBeTruthy();
  const capturedPeak = await page.evaluate(async id => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => { const r = indexedDB.open('strudel-studio'); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
    let blob: any = await new Promise(resolve => { const r = db.transaction('audio').objectStore('audio').get(id); r.onsuccess = () => resolve(r.result); }); db.close();
    if (blob.storage === 'opfs') blob = await (await (await (await navigator.storage.getDirectory()).getDirectoryHandle('studio-audio')).getFileHandle(blob.file)).getFile();
    const context = new AudioContext(); const buffer = await context.decodeAudioData(await blob.arrayBuffer()); await context.close(); return buffer.getChannelData(0).reduce((peak, n) => Math.max(peak, Math.abs(n)), 0);
  }, wet.id);
  expect(capturedPeak).toBeGreaterThan(mode === 'wet' ? .018 : .09); expect(capturedPeak).toBeLessThan(mode === 'wet' ? .035 : .11);
  await page.locator('#save-now').click(); await page.reload();
  // Solo the captured track, keeping accompaniment out of the exported signal.
  const clip = (await records(page, 'projects')).find(p => p.sessionId === 'Neon-Drive').clips.find((c: any) => c.takeId);
  const track = saved.tracks.find((t: any) => t.id === clip.trackId);
  await page.getByRole('button', { name: `Solo ${track.name}`, exact: true }).click(); await page.locator('#save-now').click(); await expect.poll(async () => (await records(page, 'projects')).find(p => p.sessionId === 'Neon-Drive').soloTrackId).toBe(clip.trackId);
  await page.locator('.project-menu > summary').click(); await page.locator('[data-drawer=export]').click(); await page.locator('#export-format').selectOption('float32');
  const pending = page.waitForEvent('download'); await page.locator('#render-audio').click(); const file = await pending;
  const rendered = decodeWav(await readFile((await file.path())!)); const peak = rendered.left.reduce((p, n) => Math.max(p, Math.abs(n)), 0);
  expect(peak).toBeGreaterThan(.018); expect(peak).toBeLessThan(.035); expect(rendered.bits).toBe(32);
});

test('input drafts retain working processing; live input blocks export until explicitly excluded', async ({ page }) => {
  await fakeInput(page); await start(page); await page.getByRole('tab', { name: 'Audio input', exact: true }).click();
  await page.locator('#editor .cm-content:visible').fill('AUDIO.gain(0.4)'); await page.locator('#audio-apply').click();
  await page.locator('#editor .cm-content:visible').fill('AUDIO.reverse()'); await page.locator('#audio-apply').click(); await expect(page.locator('#notice')).toContainText('Unsupported AUDIO modifier');
  await page.locator('#save-now').click(); expect((await records(page, 'projects'))[0].audioInput.appliedCode).toBe('AUDIO.gain(0.4)');
  await page.locator('.project-menu > summary').click(); await page.locator('[data-drawer=export]').click(); await page.locator('#render-audio').click();
  await expect(page.locator('#export-status')).toContainText('Live audio input cannot be rendered');
  await page.locator('#export-exclude-input').check(); const pending = page.waitForEvent('download'); await page.locator('#render-audio').click(); await pending;
});

test('static headers apply to main, render frame and workers; no audio is shipped', async ({ request }) => {
  for (const path of ['/', '/render.html']) { const response = await request.get(path); expect(response.headers()['content-security-policy']).toContain("worker-src 'self' blob:"); expect(response.headers()['permissions-policy']).toContain('microphone=(self)'); }
  expect((await request.get('/starter/00000000-0000-4000-8000-000000000001.wav')).status()).toBe(404);
});

test('quiet float source survives import through full-song encoding below the PCM16 floor', async ({ page }) => {
  await start(page);
  const low = Float32Array.from({ length: 4410 }, (_, i) => Math.sin(i / 10) * 1e-6);
  await importWave(page, Buffer.from(encodeWav(low, low, 44100, { format: 'float32' }).buffer));
  const id = (await records(page, 'assets'))[0].id;
  await page.getByRole('link', { name: 'Back to Studio', exact: false }).click();
  await page.locator('#editor .cm-content:visible').fill(`s("studio_${id.replaceAll('-', '')}").gain(1)`);
  await page.locator('.project-menu > summary').click(); await page.locator('[data-drawer=export]').click(); await page.locator('#export-source').selectOption('tab'); await page.locator('#export-cycles').fill('1'); await page.locator('#export-format').selectOption('float32');
  const pending = page.waitForEvent('download'); await page.locator('#render-audio').click(); const file = await pending;
  const audio = decodeWav(await readFile((await file.path())!)); const peak = audio.left.reduce((peak, n) => Math.max(peak, Math.abs(n)), 0);
  expect(peak).toBeGreaterThan(5e-7); expect(peak).toBeLessThan(2e-6); expect(audio.rate).toBe(48000);
});

async function blankComposition(page: Page) {
  await page.locator('#add-session').click(); await page.locator('#edit-name').fill('Blank recording');
  await page.locator('#edit-dialog button[value="confirm"]').click();
  await expect(page.locator('#saved-projects')).toHaveValue('Blank-recording');
  await expect(page.locator('#composition-play')).toBeDisabled();
}

test('recording works in an empty timeline and permission denial leaves no take', async ({ page }) => {
  await fakeInput(page); await start(page); await blankComposition(page);
  await page.evaluate(() => { (window as any).getInput = navigator.mediaDevices.getUserMedia; navigator.mediaDevices.getUserMedia = async () => { throw new DOMException('Microphone denied', 'NotAllowedError'); }; });
  await page.locator('#audio-record').click(); await expect(page.locator('#record-status')).toContainText('denied'); expect((await records(page, 'projects'))[0].clips).toHaveLength(0);
  await page.evaluate(() => { navigator.mediaDevices.getUserMedia = (window as any).getInput; });
  await page.locator('#audio-record').click(); await expect(page.locator('#record-status')).toContainText('Recording'); await page.waitForTimeout(500);
  await expect(page.locator('#composition-position')).not.toHaveText('0.00'); await page.locator('#audio-record').click();
  await expect(page.locator('#record-status')).toContainText('saved to the timeline', { timeout: 15000 });
  const project = (await records(page, 'projects'))[0]; expect(project.tracks).toHaveLength(2); expect(project.clips).toHaveLength(1);
});

test('recording joins playing composition at its playhead and stops before an existing clip', async ({ page }) => {
  await fakeInput(page); await start(page); await page.locator('#composition-play').click(); await page.waitForTimeout(600);
  const before = Number(await page.locator('#composition-position').textContent());
  await page.locator('#audio-record').click(); await expect(page.locator('#record-status')).toContainText('Recording');
  await expect(page.locator('#record-status')).toContainText('saved to the timeline', { timeout: 15000 });
  const project = (await records(page, 'projects'))[0], clip = project.clips.find((c: any) => c.takeId);
  expect(clip.start + clip.takeLeadSeconds * project.bpm / 240).toBeGreaterThan(before);
  expect(clip.start + clip.length).toBeLessThanOrEqual(4);
  expect(project.tracks).toHaveLength(2);
});

test('recording save failure retains audio and retry places exactly one pattern', async ({ page }) => {
  await fakeInput(page); await start(page); await page.locator('#add-track').click(); await page.locator('#record-track').selectOption({ label: 'Track 3' });
  await page.locator('#audio-record').click(); await expect(page.locator('#record-status')).toContainText('Recording'); await page.waitForTimeout(400);
  await page.evaluate(() => { const put = IDBObjectStore.prototype.put; (window as any).restoreTakeWrites = () => IDBObjectStore.prototype.put = put; IDBObjectStore.prototype.put = function(value, key) { if (this.name === 'projects' && value.tabs.some((t: any) => t.audioAssetId)) throw new DOMException('Full', 'QuotaExceededError'); return put.call(this, value, key); }; });
  await page.locator('#audio-record').click(); await expect(page.locator('#record-retry')).toBeVisible({ timeout: 15000 });
  expect((await records(page, 'projects'))[0].tabs.filter((t: any) => t.audioAssetId)).toHaveLength(0); expect((await records(page, 'assets')).filter(a => a.provider === 'recording')).toHaveLength(0);
  await page.evaluate(() => (window as any).restoreTakeWrites()); await page.locator('#record-retry').click();
  await expect(page.locator('#record-status')).toContainText('saved to the timeline'); expect((await records(page, 'projects'))[0].tabs.filter((t: any) => t.audioAssetId)).toHaveLength(1);
});

test('reload recovers an interrupted recording and effects testing keeps the saved take intact', async ({ page }) => {
  await installAudioCapture(page); await fakeInput(page); await start(page); await page.locator('#add-track').click(); await page.locator('#record-track').selectOption({ label: 'Track 3' });
  await page.locator('#audio-record').click(); await expect(page.locator('#record-status')).toContainText('Recording'); await page.waitForTimeout(650);
  await expect.poll(async () => (await records(page, 'pending')).filter(value => value instanceof Object).length).toBeGreaterThan(1);
  await page.reload(); await expect(page.locator('#record-status')).toContainText('Recovered interrupted recording'); await page.locator('#record-retry').click();
  await expect(page.locator('#record-status')).toContainText('Interrupted recording saved');
  const take = (await records(page, 'assets')).find(a => a.recording?.mode === 'wet'); expect(take.recording.incomplete).toBe(true);
  await page.getByRole('tab', { name: 'Audio input', exact: true }).click();
  await expect(page.locator('#audio-toolbar #audio-record')).toHaveCount(0);
  await page.locator('#editor .cm-content:visible').fill('AUDIO.gain(0.1).lpf(3000)'); await page.locator('#audio-apply').click();
  await page.locator('#audio-test-take').selectOption(take.id); await page.evaluate(() => window.neonCapture.start()); await page.locator('#audio-test-play').click(); await page.waitForTimeout(300); await page.locator('#audio-test-stop').click();
  const preview = await page.evaluate(() => window.neonCapture.finish()); expect(preview.peak).toBeGreaterThan(.005); expect(preview.peak).toBeLessThan(.02);
  expect((await records(page, 'assets')).find(a => a.id === take.id).contentHash).toBe(take.contentHash);
});


test('cancelled input permission does not create a take or stop the next recording', async ({ page }) => {
  await fakeInput(page); await start(page); await page.locator('#add-track').click(); await page.locator('#record-track').selectOption({ label: 'Track 3' });
  await page.evaluate(() => { const get = navigator.mediaDevices.getUserMedia; (window as any).originalInput = get; navigator.mediaDevices.getUserMedia = () => new Promise((_resolve, reject) => { (window as any).rejectInput = reject; }); });
  await page.locator('#audio-record').click(); await expect(page.locator('#audio-record')).toHaveText('Cancel connection'); await page.locator('#audio-record').click();
  await expect(page.locator('#record-status')).toContainText('cancelled');
  await page.evaluate(() => { navigator.mediaDevices.getUserMedia = (window as any).originalInput; });
  await page.locator('#audio-record').click(); await expect(page.locator('#record-status')).toContainText('Recording');
  await page.evaluate(() => (window as any).rejectInput(new DOMException('Denied after cancellation', 'NotAllowedError'))); await page.waitForTimeout(300);
  await expect(page.locator('#record-status')).toContainText('Recording'); await page.locator('#audio-record').click();
  await expect(page.locator('#record-status')).toContainText('saved to the timeline', { timeout: 15000 });
});
