import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { installAudioCapture } from './audio-capture';
import { encodeWav, decodeWav } from '../shared/wav';
const forbidden = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('studio.quick-start.opt-out', 'true'));
  const requests: string[] = []; forbidden.set(page, requests);
  page.on('request', request => { const url = new URL(request.url()); if (url.pathname.startsWith('/api/') || /^wss?:$/.test(url.protocol) || ['localhost', '127.0.0.1'].includes(url.hostname) && url.origin !== 'http://127.0.0.1:5185') requests.push(url.href); });
  page.on('websocket', socket => requests.push(socket.url()));
});
test.afterEach(async ({ page }) => { expect(forbidden.get(page)).toEqual([]); });
const wave = Buffer.from(encodeWav(Float32Array.from({ length: 4410 }, (_, i) => Math.sin(i / 10) * .2), Float32Array.from({ length: 4410 }, (_, i) => Math.sin(i / 10) * .2), 44100).buffer);
async function start(page: Page, route = '/') { await page.goto(route); await expect(page.locator('#saved-projects')).toHaveValue('Neon-Drive'); if (route === '/') await page.locator('[data-play-target=tab]').click(); }
async function records(page: Page, store: string) { return page.evaluate(async store => { const db = await new Promise<IDBDatabase>((resolve, reject) => { const r = indexedDB.open('strudel-studio'); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); }); return new Promise<any[]>((resolve, reject) => { const r = db.transaction(store).objectStore(store).getAll(); r.onsuccess = () => { resolve(r.result); db.close(); }; r.onerror = () => reject(r.error); }); }, store); }
/** Runs a command palette entry by name, the route to project, export and settings actions. */
async function command(page: Page, name: string) {
  if (name === 'Import samples from GitHub or files') { await command(page, 'Open Sample Catalogue'); if (!await page.locator('.import-page-link').isVisible()) await page.locator('#add-sounds summary').click(); await page.locator('.import-page-link').click(); return; }
  if (name === 'Audio input settings') { await page.locator(await page.locator('#audio-settings').isVisible() ? '#audio-settings' : '#input-alert-settings').click(); return; }
  if (name === 'Recording settings') { await openRecordBar(page); await page.locator('#record-settings').click(); return; }
 await page.keyboard.press('Control+K'); await page.locator('#command-palette input').fill(name); await page.keyboard.press('Enter'); await expect(page.locator('#command-palette')).toBeHidden(); }
async function closeSheet(page: Page) { await page.keyboard.press('Escape'); await expect(page.locator('#sheet')).toBeHidden(); }
async function openRecordBar(page: Page) { if (await page.locator('#record-bar').isHidden()) await page.locator('#record-toggle').click(); await expect(page.locator('#record-bar')).toBeVisible(); }
async function playComposition(page: Page) { await page.locator('[data-play-target=composition]').click(); await page.locator('#composition-play').click(); }
async function importWave(page: Page, bytes = wave) { await command(page, 'Import samples from GitHub or files'); await page.locator('[data-files]').setInputFiles({ name: 'test-tone.wav', mimeType: 'audio/wav', buffer: bytes }); await page.locator('[data-import]').click(); await expect(page.locator('[data-import-status]')).toContainText('Import finished'); }

test('static startup, synth starter produces audio, save survives reload, no backend or remote samples', async ({ page }) => {
  await installAudioCapture(page);
  const requests: string[] = [], sockets: string[] = [], errors: string[] = [];
  page.on('request', r => requests.push(r.url())); page.on('websocket', s => sockets.push(s.url())); page.on('pageerror', e => errors.push(e.stack ?? e.message));
  await page.route(/^https?:\/\/(?!127\.0\.0\.1:5185)/, r => r.abort());
  await start(page); expect(await records(page, 'projects')).toHaveLength(1); expect(await records(page, 'assets')).toHaveLength(0);
  for (const id of ['Neon-Drive']) {
    await page.locator('#saved-projects').selectOption(id);
    await page.evaluate(() => window.neonCapture.start()); await playComposition(page);
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
  await start(page); await page.locator('#project-name').fill('Keep this draft'); await command(page, 'Import samples from GitHub or files');
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
  const download = page.waitForEvent('download'); await command(page, 'Download project backup'); const file = await download; const path = await file.path(); expect(path).toBeTruthy();
  await page.locator('#backup-file').setInputFiles(path!); await expect(page.locator('#saved-projects')).toHaveValue('DEMO-Neon-Drive-restored'); expect(await records(page, 'projects')).toHaveLength(2); expect(await records(page, 'assets')).toHaveLength(1);
  await page.reload(); await expect(page.locator('#saved-projects')).toHaveValue('DEMO-Neon-Drive-restored');
});

test('static renderer exports audible synth WAV', async ({ page }) => {
  await start(page); await command(page, 'Export full song render');
  const download = page.waitForEvent('download'); await page.locator('#render-audio').click(); const file = await download; const decoded = decodeWav(await readFile((await file.path())!));
  expect(decoded.left.some(v => Math.abs(v) > .001)).toBeTruthy(); await expect(page.locator('#export-status')).toContainText('Rendered');
});

test('Web MIDI permission is requested only by action; denial leaves virtual controls usable', async ({ page }) => {
  await page.addInitScript(() => { (window as any).midiRequests = 0; Object.defineProperty(navigator, 'requestMIDIAccess', { value: async () => { (window as any).midiRequests++; throw new DOMException('Denied', 'NotAllowedError'); } }); });
  await start(page); expect(await page.evaluate(() => (window as any).midiRequests)).toBe(0);
  await command(page, 'MIDI & on-screen controller'); await page.locator('#midi-settings-connection [data-midi-enable]').click(); await expect(page.locator('#midi-settings-connection [data-midi-status]')).toContainText('denied');
  await page.locator('[data-control=knob-0]').fill('50'); await expect(page.locator('[data-value=knob-0]')).toHaveText('50');
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
  await start(page); await command(page, 'MIDI & on-screen controller'); await page.locator('#midi-settings-connection [data-midi-enable]').click(); await expect(page.locator('#midi-settings-connection [data-midi-status]')).toContainText('MIDI ·'); await expect(page.locator('#midi-settings-connection [data-midi-inputs]')).toContainText('Connected');
  await page.evaluate(() => { window.neonCapture.start(); (window as any).testMidi.note(true); }); await expect.poll(() => page.evaluate(() => window.neonCapture.frames)).toBeGreaterThan(12000); const audio = await page.evaluate(() => { (window as any).testMidi.note(false); return window.neonCapture.finish(); }); expect(audio.peak).toBeGreaterThan(.001);
  await expect(page.locator('#device-activity')).toContainText('Note 60');
  await page.evaluate(() => (window as any).testMidi.connected(false)); await expect(page.locator('#midi-settings-connection [data-midi-inputs]')).toContainText('Waiting for device');
  await page.evaluate(() => (window as any).testMidi.connected(true)); await expect(page.locator('#midi-settings-connection [data-midi-inputs]')).toContainText('Connected');
  await closeSheet(page); await page.locator('#saved-projects').selectOption('Neon-Drive'); await page.locator('#save-now').click(); await page.reload(); await expect(page.locator('#saved-projects')).toHaveValue('Neon-Drive'); await command(page, 'MIDI & on-screen controller'); await expect(page.locator('#midi-settings-connection [data-midi-inputs]')).toContainText('Connected');
});

test('composition Record and Stop append audio to the selected placement without new tabs', async ({ page }) => {
  await fakeInput(page); await start(page); await page.locator('[data-play-target=composition]').click(); await page.locator('#record-toggle').click(); await page.locator('#record-destination').selectOption('existing'); await page.locator('#record-close').click();
  await openRecordBar(page); await page.locator('#record-track').selectOption('track-2');
  await page.locator('#record-toggle').click(); await expect(page.locator('#record-status')).toContainText('recording');
  await expect(page.locator('[data-pending-tab]')).toHaveCount(0); await expect(page.locator('.pending-region')).toBeVisible();
  await page.waitForTimeout(450); await page.locator('#composition-stop').click(); await page.locator('#composition-stop').click();
  await expect(page.locator('#record-retry')).toHaveText('Keep take', { timeout: 15000 }); await page.locator('#record-retry').click(); await expect(page.locator('#record-status')).toContainText('Audio saved in pattern', { timeout: 15000 });
  const saved = (await records(page, 'projects')).find(p => p.sessionId === 'Neon-Drive');
  expect(saved.tabs).toHaveLength(4); expect(saved.clips).toHaveLength(6);
  expect(saved.tabs.find((t:any)=>t.name==='Chords').code).toContain('// Recorded audio');
  await page.reload(); expect((await records(page, 'assets')).filter(a => a.provider === 'recording')).toHaveLength(2);
});

test('storage exhaustion preserves the saved project and draft, then retry succeeds', async ({ page }) => {
  await start(page);
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.put;
    (window as any).restorePut = () => { IDBObjectStore.prototype.put = original; };
    IDBObjectStore.prototype.put = function(...args: Parameters<IDBObjectStore['put']>) { if (this.name === 'projects') { this.transaction.abort(); throw new DOMException('Quota exceeded', 'QuotaExceededError'); } return original.apply(this, args); };
  });
  await page.locator('#project-name').fill('Retain this unsaved draft'); await page.locator('#save-now').click(); await expect(page.locator('#saved-state')).toContainText('Not saved');
  expect((await records(page, 'projects')).find(p => p.sessionId === 'Neon-Drive').name).toBe('DEMO: Neon Drive'); await expect(page.locator('#project-name')).toHaveValue('Retain this unsaved draft');
  await page.evaluate(() => (window as any).restorePut()); await page.locator('#save-now').click(); await expect(page.locator('#saved-state')).toHaveText('Saved in this browser'); await page.reload(); await expect(page.locator('#project-name')).toHaveValue('Retain this unsaved draft');
});

test('composition edits, MIDI presets, and import-route themes remain usable', async ({ page }) => {
  await start(page); await page.locator('[data-drawer=composition]').click(); if (!await page.locator('#composition-content').isVisible()) await page.locator('[data-drawer=composition]').click();
  await page.locator('#snap').selectOption('0.25'); await page.getByRole('button', { name: 'Mute Track 1', exact: true }).click(); await expect(page.getByRole('button', { name: 'Unmute Track 1', exact: true })).toBeVisible(); await page.locator('#save-now').click(); await expect(page.locator('#saved-state')).toHaveText('Saved in this browser'); await page.reload(); await expect(page.locator('#snap')).toHaveValue('0.25'); expect((await records(page, 'projects')).find(p => p.sessionId === 'Neon-Drive').tracks[0].muted).toBe(true);
  await page.getByRole('tab', { name: 'MIDI instrument', exact: true }).click(); await page.locator('#instrument-apply').click(); await page.locator('#save-midi-preset').click(); await page.locator('#edit-name').fill('Starter keys'); await page.locator('#edit-dialog button[value=confirm]').click(); await expect.poll(async () => (await records(page, 'presets')).length).toBe(1);
  await page.locator('#dark-mode').check(); await command(page, 'Import samples from GitHub or files'); await expect(page.locator('#sample-import-page')).toBeVisible(); expect(await page.locator('#sample-import-page').evaluate(el => getComputedStyle(el).backgroundColor)).toBe('rgb(25, 29, 36)');
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
  await start(page); await command(page, 'Open Sample Catalogue');
  await expect(page.locator('#catalogue-packs')).toContainText('Not installed'); expect(remote).toEqual([]);
  await page.getByRole('button', { name: 'Install pack', exact: true }).click();
  await expect(page.locator('#catalogue-packs')).toContainText('Installed in this browser'); expect(remote).toHaveLength(6);
  const before = (await records(page, 'assets')).map(a => a.id).sort(); expect(before).toEqual(manifest.assets.map((a: any) => a.id).sort());
  await page.locator('#sounds-close').click(); await page.locator('#saved-projects').selectOption('Drum-Basics');
  await command(page, 'Export full song render');
  const download = page.waitForEvent('download'); await page.locator('#render-audio').click(); const file = await download;
  const rendered = decodeWav(await readFile((await file.path())!)); expect(rendered.rate).toBe(48000); expect(rendered.bits).toBe(24); expect(rendered.left.some(n => Math.abs(n) > .01)).toBeTruthy();
  await command(page, 'Open Sample Catalogue'); await page.getByRole('button', { name: 'Remove pack', exact: true }).click();
  await expect(page.locator('dialog[open]')).toContainText('Drum Basics'); await page.getByRole('button', { name: 'Remove downloaded pack', exact: true }).click();
  await expect.poll(async () => (await records(page, 'assets')).filter(a => a.missing).length).toBe(6);
  await page.getByRole('button', { name: 'Install pack', exact: true }).click(); await expect(page.locator('#catalogue-packs')).toContainText('Installed in this browser');
  expect((await records(page, 'assets')).map(a => a.id).sort()).toEqual(before); await page.reload(); expect((await records(page, 'assets')).filter(a => !a.missing)).toHaveLength(6);
});

test('OPFS and IndexedDB fallback retain float precision through import and backup', async ({ page }) => {
  await start(page);
  const samples = Float32Array.from({ length: 150000 }, (_, i) => Math.sin(i / 10) * 1e-6);
  const high = Buffer.from(encodeWav(samples, samples, 48000, { format: 'float32' }).buffer);
  await command(page, 'Import samples from GitHub or files'); await page.locator('[data-files]').setInputFiles({ name: 'precision.wav', mimeType: 'audio/wav', buffer: high });
  await page.locator('[data-import]').click(); await expect(page.locator('[data-import-status]')).toContainText('Import finished');
  const a = (await records(page, 'assets'))[0]; expect(a.precision.working).toBe('float32'); expect(a.precision.rate).toBe(48000);
  const pointers = await records(page, 'audio'); expect(pointers[0].storage).toBe('opfs');
  await page.getByRole('link', { name: 'Back to Studio', exact: false }).click(); await page.locator('#save-now').click();
  const pending = page.waitForEvent('download'); await command(page, 'Download project backup'); const backup = await pending;
  await page.locator('#backup-file').setInputFiles((await backup.path())!); await expect(page.locator('#saved-projects')).toHaveValue('DEMO-Neon-Drive-restored');
  await page.reload(); expect((await records(page, 'assets'))[0].id).toBe(a.id);
  // With OPFS absent, the identical import contract uses IndexedDB Blobs.
  await page.evaluate(() => { Object.defineProperty(navigator.storage, 'getDirectory', { configurable: true, value: undefined }); });
  await command(page, 'Import samples from GitHub or files'); samples[0] = .2;
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

for (const mode of ['dry', 'wet'] as const) test(`${mode} input take uses edited effects once in tab playback and composition render`, async ({ page }) => {
  await installAudioCapture(page); await fakeInput(page); await start(page); await page.locator('#add-track').click();
  await page.getByRole('tab', { name: 'Audio input', exact: true }).click(); await command(page, 'Audio input settings'); await page.locator('#audio-track').selectOption({ label: 'Track 3' }); await closeSheet(page);
  await page.locator('#editor .cm-content:visible').fill('AUDIO.gain(slider(0.25, 0, 1))'); await page.locator('#audio-apply').click();
  await page.locator('#audio-connect').click(); await expect(page.locator('#audio-state')).toContainText('Armed'); expect(await page.locator('#audio-monitor').isChecked()).toBe(false);
  await openRecordBar(page);  await command(page, 'Recording settings'); await page.locator('#record-mode').selectOption(mode); await closeSheet(page);
  await page.locator('#record-toggle').click(); await expect(page.locator('#record-status')).toContainText('recording'); await page.waitForTimeout(600);
  await page.locator('#record-toggle').click(); await expect(page.locator('#record-retry')).toHaveText('Keep take', { timeout: 15000 }); await page.locator('#record-retry').click(); await expect(page.locator('#record-status')).toContainText('Audio saved in pattern', { timeout: 15000 });
  await expect.poll(async () => (await records(page, 'assets')).filter(a => a.provider === 'recording').length).toBe(mode === 'wet' ? 2 : 1);
  await expect(page.locator('#record-status')).toContainText('Audio saved in pattern');
  let saved = (await records(page, 'projects')).find(p => p.sessionId === 'Neon-Drive'); expect(saved.tabs.some((t: any) => t.code.includes('// Recorded audio'))).toBeTruthy();
  const wet = (await records(page, 'assets')).find(a => a.recording?.mode === mode); if (mode === 'wet') expect(wet.recording.dryAssetId).toBeTruthy();
  const capturedPeak = await page.evaluate(async id => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => { const r = indexedDB.open('strudel-studio'); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
    let blob: any = await new Promise(resolve => { const r = db.transaction('audio').objectStore('audio').get(id); r.onsuccess = () => resolve(r.result); }); db.close();
    if (blob.storage === 'opfs') blob = await (await (await (await navigator.storage.getDirectory()).getDirectoryHandle('studio-audio')).getFileHandle(blob.file)).getFile();
    const context = new AudioContext(); const buffer = await context.decodeAudioData(await blob.arrayBuffer()); await context.close(); return buffer.getChannelData(0).reduce((peak, n) => Math.max(peak, Math.abs(n)), 0);
  }, wet.id);
  expect(capturedPeak).toBeGreaterThan(mode === 'wet' ? .018 : .09); expect(capturedPeak).toBeLessThan(mode === 'wet' ? .035 : .11);
  await page.locator('#save-now').click(); await page.reload();
  await page.evaluate(async ({ asset, mode }) => {
    const db = await new Promise<IDBDatabase>(resolve => { const r=indexedDB.open('strudel-studio'); r.onsuccess=()=>resolve(r.result); });
    const p:any = await new Promise(resolve => { const r=db.transaction('projects').objectStore('projects').get('Neon-Drive'); r.onsuccess=()=>resolve(r.result); });
    const tab=p.tabs.find((t:any)=>t.name==='Lead'); tab.audioAssetId=asset.id; tab.anchors=[]; tab.appliedAnchors=[]; tab.code=`s("studio_${asset.id.replaceAll('-', '')}").gain(1)`; delete tab.appliedCode;
    p.activeTabId=tab.id; p.clips=[{id:'legacy-take',tabId:tab.id,trackId:'track-3',start:0,length:Math.max(.25,Math.ceil(asset.duration*p.bpm/240*4)/4),takeId:asset.id,muted:false}];
    p.clips[0].trackId=p.tracks[2].id;
    await new Promise<void>(resolve=>{const tx=db.transaction('projects','readwrite');tx.objectStore('projects').put(p,'Neon-Drive');tx.oncomplete=()=>resolve();}); db.close(); localStorage.removeItem('studio.pending-session');
  }, {asset:wet, mode});
  await page.reload(); saved=(await records(page,'projects')).find(p=>p.sessionId==='Neon-Drive');
  const takeTab = saved.tabs.find((t: any) => t.audioAssetId === wet.id);
  await page.getByRole('tab', { name: takeTab.name, exact: true }).click(); await page.locator('#take-code').click();
  const content = page.locator('.tab-editor:not([hidden]) .cm-content'); await content.focus();
  await page.keyboard.press('Control+Home'); await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowDown'); await page.keyboard.press('Home'); await page.keyboard.press('Control+Shift+End');
  await page.keyboard.insertText(`s("studio_${wet.id.replaceAll('-', '')}").gain(0.5)`);
  await page.locator('#save-now').click(); await expect(page.locator('#saved-state')).toHaveText('Saved in this browser');
  await page.reload(); await expect(page.locator('#take-play')).toBeVisible();
  await page.evaluate(() => window.neonCapture.start()); await page.locator('#take-play').click();
  await page.waitForTimeout(250); await expect(page.locator('#play')).toBeDisabled(); await page.waitForTimeout(2500);
  const preview = await page.evaluate(() => window.neonCapture.finish()); await page.locator('#stop').click();
  expect(preview.peak).toBeGreaterThan(.009); expect(preview.peak).toBeLessThan(.018);
  // A sub-second take must not play again in the following pattern cycles.
  expect(Math.max(...preview.bins.slice(2).map((b: any) => b.peak))).toBeLessThan(.001);
  // Solo the captured track, keeping accompaniment out of the exported signal.
  const clip = (await records(page, 'projects')).find(p => p.sessionId === 'Neon-Drive').clips.find((c: any) => c.takeId);
  const track = saved.tracks.find((t: any) => t.id === clip.trackId);
  await page.getByRole('button', { name: `Solo ${track.name}`, exact: true }).click(); await page.locator('#save-now').click(); await expect.poll(async () => (await records(page, 'projects')).find(p => p.sessionId === 'Neon-Drive').soloTrackId).toBe(clip.trackId);
  await command(page, 'Return to range start'); await page.evaluate(() => window.neonCapture.start()); await playComposition(page); await page.waitForTimeout(1400);
  const composed = await page.evaluate(() => window.neonCapture.finish()); await page.locator('#composition-stop').click();
  expect(composed.peak).toBeGreaterThan(.009); expect(composed.peak).toBeLessThan(.018);
  await command(page, 'Export full song render'); await page.locator('#export-format').selectOption('float32');
  const pending = page.waitForEvent('download'); await page.locator('#render-audio').click(); const file = await pending;
  const rendered = decodeWav(await readFile((await file.path())!)); const peak = rendered.left.reduce((p, n) => Math.max(p, Math.abs(n)), 0);
  expect(peak).toBeGreaterThan(.009); expect(peak).toBeLessThan(.018); expect(rendered.bits).toBe(32);
});

test('input drafts retain working processing; live input blocks export until explicitly excluded', async ({ page }) => {
  await fakeInput(page); await start(page); await page.getByRole('tab', { name: 'Audio input', exact: true }).click();
  await page.locator('#editor .cm-content:visible').fill('AUDIO.gain(0.4)'); await page.locator('#audio-apply').click();
  await page.locator('#editor .cm-content:visible').fill('AUDIO.reverse()'); await page.locator('#audio-apply').click(); await expect(page.locator('#notice')).toContainText('Unsupported AUDIO modifier');
  await page.locator('#save-now').click(); expect((await records(page, 'projects'))[0].audioInput.appliedCode).toBe('AUDIO.gain(0.4)');
  await command(page, 'Export full song render'); await page.locator('#render-audio').click();
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
  await page.locator('#editor .cm-content:visible').focus(); await page.keyboard.press('Control+Home'); await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowDown'); await page.keyboard.press('Home'); await page.keyboard.press('Control+Shift+End'); await page.keyboard.insertText(`s("studio_${id.replaceAll('-', '')}").gain(1)`);
  await command(page, 'Export full song render'); await page.locator('#export-source').selectOption('tab'); await page.locator('#export-cycles').fill('1'); await page.locator('#export-format').selectOption('float32');
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
  await openRecordBar(page); await page.locator('#record-toggle').click(); await expect(page.locator('#record-status')).toContainText('denied'); expect((await records(page, 'projects'))[0].clips).toHaveLength(0);
  await page.evaluate(() => { navigator.mediaDevices.getUserMedia = (window as any).getInput; });
  await page.locator('#record-toggle').click(); await expect(page.locator('#record-status')).toContainText('recording'); await page.waitForTimeout(500);
  await expect(page.locator('#composition-position')).not.toHaveText('0.00'); await page.locator('#record-toggle').click();
  await expect(page.locator('#record-retry')).toHaveText('Keep take', { timeout: 15000 }); await page.locator('#record-retry').click(); await expect(page.locator('#record-status')).toContainText('Audio saved in pattern', { timeout: 15000 });
  const project = (await records(page, 'projects'))[0]; expect(project.tracks).toHaveLength(2); expect(project.clips).toHaveLength(0); expect(project.tabs[0].code).toContain('// Recorded audio');
});

test('existing pattern recording joins playback and stops before an existing clip', async ({ page }) => {
  await fakeInput(page); await start(page); await playComposition(page); await page.waitForTimeout(600);
  const before = (Number((await page.locator('#composition-position').textContent())!.replace('Beat ', '')) - 1) / 4;
  await openRecordBar(page); await page.locator('#record-destination').selectOption('existing'); await page.locator('#record-track').selectOption('track-2'); await page.locator('#record-toggle').click(); await expect(page.locator('#record-status')).toContainText('recording');
  await expect(page.locator('#record-retry')).toHaveText('Keep take', { timeout: 15000 }); await page.locator('#record-retry').click(); await expect(page.locator('#record-status')).toContainText('Audio saved in pattern', { timeout: 15000 });
  const project = (await records(page, 'projects'))[0], asset = (await records(page,'assets')).find(a=>a.recording?.mode==='wet');
  expect(asset.recording.offsetCycles).toBeGreaterThan(before); expect(project.clips).toHaveLength(6);
  expect(project.tracks).toHaveLength(2);
});

test('recording save failure retains audio and retry places exactly one pattern', async ({ page }) => {
  await fakeInput(page); await start(page); await page.locator('#add-track').click(); await openRecordBar(page);
  await page.locator('#record-toggle').click(); await expect(page.locator('#record-status')).toContainText('recording'); await page.waitForTimeout(400);
  await page.evaluate(() => { const put = IDBObjectStore.prototype.put; (window as any).restoreTakeWrites = () => IDBObjectStore.prototype.put = put; IDBObjectStore.prototype.put = function(value, key) { if (this.name === 'projects' && value.tabs.some((t: any) => t.code.includes('// Recorded audio'))) throw new DOMException('Full', 'QuotaExceededError'); return put.call(this, value, key); }; });
  await page.locator('#record-toggle').click(); await expect(page.locator('#record-retry')).toBeVisible({ timeout: 15000 });
  await page.locator('#record-retry').click(); await expect(page.locator('#record-status')).toContainText('retained');
  expect((await records(page, 'projects'))[0].tabs.filter((t: any) => t.code.includes('// Recorded audio'))).toHaveLength(0); expect((await records(page, 'assets')).filter(a => a.provider === 'recording')).toHaveLength(0);
  await page.evaluate(() => (window as any).restoreTakeWrites()); await page.locator('#record-retry').click();
  await expect(page.locator('#record-status')).toContainText('Audio saved in pattern'); expect((await records(page, 'projects'))[0].tabs.filter((t: any) => t.code.includes('// Recorded audio'))).toHaveLength(1);
});

test('reload recovers an interrupted recording and effects testing keeps the saved take intact', async ({ page }) => {
  await installAudioCapture(page); await fakeInput(page); await start(page); await page.locator('#add-track').click(); await openRecordBar(page);
  await page.locator('#record-toggle').click(); await expect(page.locator('#record-status')).toContainText('recording'); await page.waitForTimeout(650);
  await expect.poll(async () => (await records(page, 'pending')).filter(value => value instanceof Object).length).toBeGreaterThan(1);
  await page.reload(); await expect(page.locator('#record-status')).toContainText('Recovered interrupted recording'); await openRecordBar(page); await page.locator('#record-retry').click();
  await expect(page.locator('#record-status')).toContainText('Interrupted recording saved');
  const take = (await records(page, 'assets')).find(a => a.recording?.mode === 'wet'); expect(take.recording.incomplete).toBe(true);
  await page.getByRole('tab', { name: 'Audio input', exact: true }).click();
  await expect(page.locator('#audio-toolbar #audio-record')).toHaveCount(0);
  await page.locator('#editor .cm-content:visible').fill('AUDIO.gain(0.1).lpf(3000)'); await page.locator('#audio-apply').click();
  await command(page, 'Audio input settings'); await page.locator('#audio-test-take').selectOption(take.id); await page.evaluate(() => window.neonCapture.start()); await page.locator('#audio-test-play').click(); await page.waitForTimeout(300); await page.locator('#audio-test-stop').click();
  const preview = await page.evaluate(() => window.neonCapture.finish()); expect(preview.peak).toBeGreaterThan(.005); expect(preview.peak).toBeLessThan(.02);
  expect((await records(page, 'assets')).find(a => a.id === take.id).contentHash).toBe(take.contentHash);
});


test('cancelled input permission does not create a take or stop the next recording', async ({ page }) => {
  await fakeInput(page); await start(page); await page.locator('#add-track').click(); await openRecordBar(page);
  await page.evaluate(() => { const get = navigator.mediaDevices.getUserMedia; (window as any).originalInput = get; navigator.mediaDevices.getUserMedia = () => new Promise((_resolve, reject) => { (window as any).rejectInput = reject; }); });
  await page.locator('#record-toggle').click(); await expect(page.locator('#record-toggle')).toHaveText('Cancel'); await page.waitForFunction(() => typeof (window as any).rejectInput === 'function'); await page.locator('#record-toggle').click();
  await expect(page.locator('#record-status')).toContainText('cancelled');
  await page.evaluate(() => { navigator.mediaDevices.getUserMedia = (window as any).originalInput; });
  await page.locator('#record-toggle').click(); await expect(page.locator('#record-status')).toContainText('recording');
  await page.evaluate(() => (window as any).rejectInput(new DOMException('Denied after cancellation', 'NotAllowedError'))); await page.waitForTimeout(300);
  await expect(page.locator('#record-status')).toContainText('recording'); await page.locator('#record-toggle').click();
  await expect(page.locator('#play')).toBeEnabled();
  await expect(page.locator('#record-retry')).toHaveText('Keep take', { timeout: 15000 }); await page.locator('#record-retry').click(); await expect(page.locator('#record-status')).toContainText('Audio saved in pattern', { timeout: 15000 });
});

test('two tabs can save unchanged content and a stale unchanged tab loads the newer session', async ({ page, context }) => {
  await start(page); await page.locator('#save-now').click();
  const second = await context.newPage(); await start(second);
  await second.locator('#save-now').click(); await page.locator('#save-now').click();
  await expect(page.locator('#saved-state')).toHaveText('Saved in this browser');
  await expect(page.locator('#notice')).not.toContainText('changed in another tab');
  await second.locator('#project-name').fill('Edited in second tab'); await second.locator('#save-now').click();
  await expect.poll(async () => (await records(page, 'projects')).find(p => p.sessionId === 'Neon-Drive').name).toBe('Edited in second tab');
  await page.locator('#save-now').click(); await expect(page.locator('#project-name')).toHaveValue('Edited in second tab');
  const revision = (await records(page, 'projects'))[0].revision;
  await page.locator('#save-now').click(); await second.locator('#save-now').click(); await page.waitForTimeout(200);
  expect((await records(page, 'projects'))[0].revision).toBe(revision);
  await second.close();
});

test('different edits in two tabs keep both versions and each tab reloads its own session', async ({ page, context }) => {
  await start(page); await page.locator('#save-now').click(); const second = await context.newPage(); await start(second);
  await page.locator('#project-name').fill('First version'); await page.locator('#save-now').click();
  await expect.poll(async () => (await records(page, 'projects'))[0].name).toBe('First version');
  await second.locator('#project-name').fill('Second version'); await second.locator('#save-now').click();
  await expect(second.locator('#saved-state')).toHaveText('Saved as conflict copy');
  await expect.poll(async () => (await records(page, 'projects')).length).toBe(2);
  const saved = await records(page, 'projects'); expect(saved.map(p => p.name).sort()).toEqual(['First version', 'Second version (conflict copy)']);
  const copiedId = await second.locator('#saved-projects').inputValue(); expect(copiedId).not.toBe('Neon-Drive');
  await second.locator('#save-now').click(); await second.reload(); await expect(second.locator('#saved-projects')).toHaveValue(copiedId);
  await page.reload(); await expect(page.locator('#project-name')).toHaveValue('First version'); expect(await records(page, 'projects')).toHaveLength(2);
  await second.close();
});

test('a duplicated browser tab owns a separate draft key', async ({ page }) => {
  await start(page); await page.locator('#save-now').click();
  const id = await page.evaluate(() => sessionStorage.getItem('studio.tab'));
  const opened = page.waitForEvent('popup'); await page.evaluate(() => window.open(location.href)); const duplicate = await opened;
  await expect(duplicate.locator('#saved-projects')).toHaveValue('Neon-Drive');
  expect(await duplicate.evaluate(() => sessionStorage.getItem('studio.tab'))).not.toBe(id);
  await duplicate.close();
});

test('queued saves preserve an edit made while a storage lock delays saving', async ({ page }) => {
  await start(page); await page.locator('#save-now').click();
  await page.evaluate(() => new Promise<void>(resolve => { void navigator.locks.request('strudel-workspace-write', () => new Promise<void>(release => { (window as any).releaseSaveLock = release; resolve(); })); }));
  await page.locator('#project-name').fill('First pending edit'); await page.locator('#save-now').click();
  await page.locator('#project-name').fill('Latest pending edit'); await page.locator('#save-now').click();
  await page.evaluate(() => (window as any).releaseSaveLock());
  await expect.poll(async () => (await records(page, 'projects'))[0].name).toBe('Latest pending edit');
  await page.reload(); await expect(page.locator('#project-name')).toHaveValue('Latest pending edit'); expect(await records(page, 'projects')).toHaveLength(1);
});

test('a legacy stale draft is recovered as one copy without overwriting newer saved work', async ({ page, context }) => {
  await start(page); await page.locator('#project-name').fill('Original draft'); await page.locator('#save-now').click();
  await expect.poll(async () => (await records(page, 'projects'))[0].name).toBe('Original draft');
  const stale = (await records(page, 'projects'))[0];
  const second = await context.newPage(); await start(second); await second.locator('#project-name').fill('Newer saved work'); await second.locator('#save-now').click();
  await expect.poll(async () => (await records(page, 'projects'))[0].name).toBe('Newer saved work');
  await page.evaluate(stale => localStorage.setItem('studio.pending-session', JSON.stringify(stale)), stale);
  await page.reload(); await expect(page.locator('#project-name')).toHaveValue('Original draft (conflict copy)');
  expect((await records(page, 'projects')).find(p => p.sessionId === 'Neon-Drive').name).toBe('Newer saved work');
  await page.reload(); await expect(page.locator('#project-name')).toHaveValue('Original draft (conflict copy)'); expect(await records(page, 'projects')).toHaveLength(2);
  await second.close();
});
