import { test, expect, type Page, type WebSocketRoute } from '@playwright/test';
import { newProject } from '../shared/model';
import { installAudioCapture } from './audio-capture';

async function edit(page: Page, code: string) {
  await page.getByRole('tab', { name: 'MIDI instrument', exact: true }).click();
  await page.locator('#editor-midi-instrument .cm-content').fill(code);
}
async function peak(page: Page) {
  await page.evaluate(() => window.neonCapture.start());
  await page.waitForTimeout(400);
  return page.evaluate(() => window.neonCapture.finish().peak);
}

test('dedicated instrument applies MIDI effects, learns controls, keeps good code, and preserves MIDI slider mappings', async ({ page, request }) => {
  await request.put('/api/recovery', { data: newProject() });
  await installAudioCapture(page);
  let socket: WebSocketRoute;
  await page.routeWebSocket('**/api/midi', ws => { socket = ws; ws.connectToServer(); });
  let sequence = 0;
  const midi = (bytes: number[]) => socket.send(JSON.stringify({ type: 'midi', source: 'studio:virtual', route: 'simulation', sequence: ++sequence, receivedAt: Date.now(), bytes }));
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/'); await expect(page.locator('#connection')).toHaveText('Studio connected');
  const code = 'MIDI.s("sine").gain(slider(0.4,0,1)).lpf(1200).room(0.2)';
  await edit(page, code);
  await page.getByRole('button', { name: 'Apply instrument', exact: true }).click();
  await expect(page.locator('#instrument-state')).toHaveText('Ready for MIDI');
  midi([144, 60, 100]); midi([144, 64, 90]);
  expect(await peak(page)).toBeGreaterThan(.01);
  const gain = page.getByRole('slider', { name: 'gain inline slider', exact: true });
  await gain.focus(); await page.getByRole('button', { name: 'MIDI Learn', exact: true }).click();
  midi([176, 20, 51]); await expect(page.locator('#learn-status')).toContainText('Connected CC 20');
  midi([176, 20, 51]); midi([176, 20, 0]);
  await expect(gain).toHaveValue('0');
  await page.waitForTimeout(1000);
  expect(await peak(page)).toBeLessThan(.005);
  midi([128, 60, 0]); midi([128, 64, 0]);
  await edit(page, 'MIDI.s("sine").gain(0.4)');
  await page.getByRole('button', { name: 'Apply instrument', exact: true }).click();
  await expect(page.locator('#instrument-state')).toHaveText('Ready for MIDI');
  await edit(page, 'MIDI.s(');
  await page.getByRole('button', { name: 'Apply instrument', exact: true }).click();
  await expect(page.locator('#instrument-state')).toHaveClass(/error/);
  midi([144, 67, 100]); expect(await peak(page)).toBeGreaterThan(.01); midi([128, 67, 0]);
  await page.reload(); await expect(page.locator('#connection')).toHaveText('Studio connected');
  await expect(page.locator('#editor-midi-instrument .cm-content')).toHaveText('MIDI.s(');
  // Reload keeps the last applied version even with an invalid saved draft.
  await page.getByRole('button', { name: 'Stop instrument', exact: true }).click();
  midi([144, 65, 100]); expect(await peak(page)).toBeGreaterThan(.01); midi([128, 65, 0]);
  await edit(page, code); await page.getByRole('button', { name: 'Apply instrument', exact: true }).click();
  await expect(page.getByLabel('Instrument note source')).toHaveCount(0);
  await page.getByRole('tab', { name: 'Pattern 1', exact: true }).click();
  midi([144, 65, 100]); expect(await peak(page)).toBeGreaterThan(.01); midi([128, 65, 0]);
  await page.getByRole('tab', { name: 'MIDI instrument', exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test('sound assignment preserves MIDI effects and session instrument selection', async ({ page, request }) => {
  const first = await (await request.post('/api/projects', { data: newProject() })).json();
  const second = await (await request.post('/api/projects', { data: newProject() })).json();
  await request.put('/api/recovery', { data: first });
  await page.goto('/'); await expect(page.locator('#connection')).toHaveText('Studio connected');
  await edit(page, 'MIDI.s("triangle").lpf(1200).room(0.4)');
  await page.getByRole('button', { name: 'Apply instrument', exact: true }).click();
  await page.getByRole('button', { name: 'Sample library', exact: true }).click();
  await page.locator('[data-assign-midi="sine"]').click();
  await page.getByRole('button', { name: 'Close library', exact: true }).click();
  await expect(page.locator('#editor-midi-instrument .cm-content')).toContainText('.s("sine").lpf(1200).room(0.4)');
  await page.getByLabel('Sessions', { exact: true }).selectOption(second.sessionId);
  await page.getByRole('tab', { name: 'MIDI instrument', exact: true }).click();
  await expect(page.locator('#editor-midi-instrument .cm-content')).toContainText('.s("triangle")');
  await page.getByLabel('Sessions', { exact: true }).selectOption(first.sessionId);
  await page.getByRole('tab', { name: 'MIDI instrument', exact: true }).click();
  await expect(page.locator('#editor-midi-instrument .cm-content')).toContainText('.s("sine").lpf(1200).room(0.4)');
  await edit(page, 'MIDI.s("sine").s("square")');
  await page.getByRole('button', { name: 'Sample library', exact: true }).click();
  await page.locator('[data-assign-midi="triangle"]').click();
  await expect(page.locator('#sounds-panel')).toBeHidden();
  await expect(page.locator('#editor-midi-instrument .cm-content')).toHaveText('MIDI.s("sine").s("square")');
  await expect(page.locator('#notice')).toContainText('one literal');
});


test('changing or clearing the instrument stops the previous sound and preview cannot steal MIDI voices', async ({ page, request }) => {
  await request.put('/api/recovery', { data: newProject() });
  await installAudioCapture(page);
  let socket: WebSocketRoute;
  await page.routeWebSocket('**/api/midi', ws => { socket = ws; ws.connectToServer(); });
  let sequence = 0;
  const midi = (on: boolean) => socket.send(JSON.stringify({ type: 'midi', source: 'studio:virtual', route: 'simulation', sequence: ++sequence, receivedAt: Date.now(), bytes: [on ? 144 : 128, 60, on ? 100 : 0] }));
  await page.goto('/'); await expect(page.locator('#connection')).toHaveText('Studio connected');
  await edit(page, 'MIDI.s("triangle").gain(0.4)');
  await page.getByRole('button', { name: 'Apply instrument', exact: true }).click();
  midi(true); expect(await peak(page)).toBeGreaterThan(.01);
  await edit(page, 'MIDI.s("sine").gain(0)');
  await page.getByRole('button', { name: 'Apply instrument', exact: true }).click();
  await expect(page.locator('#instrument-state')).toHaveText('Ready for MIDI');
  await page.waitForTimeout(150);
  expect(await peak(page)).toBeLessThan(.005);
  midi(false); midi(true); expect(await peak(page)).toBeLessThan(.005); midi(false);
  await page.getByRole('button', { name: 'Sample library', exact: true }).click();
  await page.locator('[data-preview-sound="square"]').click();
  await page.getByRole('button', { name: 'Close library', exact: true }).click();
  await edit(page, 'MIDI.s("sine").gain(0.4)');
  await page.getByRole('button', { name: 'Apply instrument', exact: true }).click();
  midi(true); expect(await peak(page)).toBeGreaterThan(.01);
  await page.getByRole('button', { name: 'MIDI', exact: true }).click();
  await page.getByRole('button', { name: 'Clear sound assignment', exact: true }).click();
  await expect(page.locator('#midi-assignment')).toContainText('muted');
  await page.waitForTimeout(150);
  expect(await peak(page)).toBeLessThan(.005);
  midi(false); midi(true); expect(await peak(page)).toBeLessThan(.005); midi(false);
  await page.reload(); await expect(page.locator('#connection')).toHaveText('Studio connected');
  await expect(page.locator('#instrument-state')).toContainText('muted');
  midi(true); expect(await peak(page)).toBeLessThan(.005); midi(false);
});


test('MIDI effect presets save across sessions and reload with their sliders', async ({ page, request }) => {
  const first = await (await request.post('/api/projects', { data: newProject() })).json();
  const second = await (await request.post('/api/projects', { data: newProject() })).json();
  await request.put('/api/recovery', { data: first });
  await page.goto('/'); await expect(page.locator('#connection')).toHaveText('Studio connected');
  const code = 'MIDI.s("sine").lpf(slider(1200,100,8000,1)).room(0.3)';
  await edit(page, code); await page.getByRole('button', { name: 'Apply instrument', exact: true }).click();
  await page.getByRole('button', { name: 'Save preset…', exact: true }).click();
  await page.locator('#edit-name').fill('Soft keys');
  await page.locator('#edit-dialog button[value="confirm"]').click();
  await expect(page.locator('#notice')).toContainText('Saved preset');
  const preset = (await (await request.get('/api/midi/presets')).json()).find((p: any) => p.name === 'Soft keys');
  expect(preset.code).toBe(code);
  await page.getByLabel('Sessions', { exact: true }).selectOption(second.sessionId);
  await page.getByRole('tab', { name: 'MIDI instrument', exact: true }).click();
  await page.getByLabel('MIDI preset', { exact: true }).selectOption(preset.id);
  await expect(page.locator('#notice')).toContainText('Loaded preset');
  await expect(page.locator('#editor-midi-instrument .cm-content')).toContainText('.room(0.3)');
  await expect(page.getByRole('slider', { name: 'lpf inline slider', exact: true })).toHaveValue('1200');
  await page.reload(); await expect(page.locator('#connection')).toHaveText('Studio connected');
  await expect(page.getByLabel('MIDI preset').locator('option', { hasText: 'Soft keys' })).toHaveCount(1);
  await expect(page.getByRole('slider', { name: 'lpf inline slider', exact: true })).toHaveValue('1200');
});


test('switching presets silences held notes without needing a note-off or a separate load action', async ({ page, request }) => {
  const loud = await (await request.post('/api/midi/presets', { data: { name: 'Held tone', code: 'MIDI.s("triangle").gain(0.4)' } })).json();
  const silent = await (await request.post('/api/midi/presets', { data: { name: 'Silent tone', code: 'MIDI.s("sine").gain(0)' } })).json();
  await request.put('/api/recovery', { data: newProject() });
  await installAudioCapture(page);
  let socket: WebSocketRoute;
  await page.routeWebSocket('**/api/midi', ws => { socket = ws; ws.connectToServer(); });
  let sequence = 0;
  const midi = (on: boolean, pitch = 60) => socket.send(JSON.stringify({ type: 'midi', source: 'studio:virtual', route: 'simulation', sequence: ++sequence, receivedAt: Date.now(), bytes: [on ? 144 : 128, pitch, on ? 100 : 0] }));
  await page.goto('/'); await expect(page.locator('#connection')).toHaveText('Studio connected');
  await page.getByRole('tab', { name: 'MIDI instrument', exact: true }).click();
  await page.getByLabel('MIDI preset', { exact: true }).selectOption(loud.id);
  await expect(page.locator('#notice')).toContainText('Loaded preset · Held tone');
  midi(true); midi(true, 64); expect(await peak(page)).toBeGreaterThan(.01);
  await page.getByLabel('MIDI preset', { exact: true }).selectOption(silent.id);
  await expect(page.locator('#notice')).toContainText('Loaded preset · Silent tone');
  await page.waitForTimeout(150); expect(await peak(page)).toBeLessThan(.005);
  midi(false); midi(false, 64); midi(true); expect(await peak(page)).toBeLessThan(.005);
  await page.getByLabel('MIDI preset', { exact: true }).selectOption(loud.id);
  await expect(page.locator('#notice')).toContainText('Loaded preset · Held tone');
  midi(false); midi(true); expect(await peak(page)).toBeGreaterThan(.01);
  midi(false); await page.waitForTimeout(150); expect(await peak(page)).toBeLessThan(.005);
});


test('all MIDI output sounds and clearing are available in the dedicated instrument tab', async ({ page, request }) => {
  const { encodeWav } = await import('../shared/wav');
  const frames = Float32Array.from({ length: 44100 }, (_, i) => Math.sin(i * .06) * .2);
  const wav = Buffer.from(encodeWav(frames, frames, 44100).buffer);
  await request.put('/api/recovery', { data: newProject() });
  await installAudioCapture(page);
  let socket: WebSocketRoute;
  await page.routeWebSocket('**/api/midi', ws => { socket = ws; ws.connectToServer(); });
  await page.goto('/'); await expect(page.locator('#connection')).toHaveText('Studio connected');
  await page.getByRole('button', { name: 'Sample library', exact: true }).click();
  await page.locator('#add-sounds').evaluate((el: HTMLDetailsElement) => { el.open = true; });
  await page.locator('[data-files]').setInputFiles({ name: 'MIDI sample fixture.wav', mimeType: 'audio/wav', buffer: wav });
  await page.getByRole('button', { name: 'Import selected', exact: true }).click();
  await expect(page.locator('[data-review]')).toContainText('Imported');
  await page.getByRole('button', { name: 'Close library', exact: true }).click();
  await page.getByRole('button', { name: 'MIDI', exact: true }).click();
  await expect(page.locator('#devices-content #midi-assignment')).toHaveCount(0);
  await page.getByRole('button', { name: 'Edit instrument', exact: true }).click();
  const output = page.getByLabel('MIDI output sound', { exact: true });
  await expect(output).toBeVisible();
  await expect(page.locator('#instrument-toolbar #clear-midi-sound')).toBeVisible();
  await expect(page.getByLabel('MIDI preset', { exact: true })).toBeVisible();
  await edit(page, 'MIDI.s("triangle").lpf(slider(1200,100,8000,1)).room(0.1)');
  await page.getByRole('button', { name: 'Apply instrument', exact: true }).click();
  const sliderId = await page.getByRole('slider', { name: 'lpf inline slider', exact: true }).getAttribute('data-slider-id');
  await output.selectOption('sine');
  await expect(page.locator('#editor-midi-instrument .cm-content')).toContainText('MIDI.s("sine")');
  await page.getByLabel('Find MIDI output sound', { exact: true }).fill('MIDI sample fixture');
  const asset = (await (await request.get('/api/samples')).json()).find((a: any) => a.label === 'MIDI sample fixture');
  const name = `studio_${asset.id.replaceAll('-', '')}`;
  await expect(output.locator('optgroup[label="Library sounds"] option')).toHaveCount(1);
  await output.selectOption(name);
  await expect(output).toHaveValue(name);
  await expect(page.locator('#instrument-state')).toHaveText('Ready for MIDI');
  await expect(page.getByRole('slider', { name: 'lpf inline slider', exact: true })).toHaveAttribute('data-slider-id', sliderId!);
  await expect(page.locator('#editor-midi-instrument .cm-content')).toContainText('.room(0.1)');
  await expect(page.locator('#sounds-panel')).toBeHidden();
  socket!.send(JSON.stringify({ type: 'midi', source: 'studio:virtual', route: 'simulation', sequence: 1, receivedAt: Date.now(), bytes: [144, 60, 100] }));
  expect(await peak(page)).toBeGreaterThan(.001);
  socket!.send(JSON.stringify({ type: 'midi', source: 'studio:virtual', route: 'simulation', sequence: 2, receivedAt: Date.now(), bytes: [128, 60, 0] }));
  await page.reload(); await expect(page.locator('#connection')).toHaveText('Studio connected');
  await expect(output).toHaveValue(name);
  await page.getByRole('button', { name: 'Clear sound assignment', exact: true }).click();
  await expect(page.locator('#midi-assignment')).toContainText('muted');
  await expect(output).toHaveValue('');
});

test('rapid MIDI sweeps retain pickup and update the latest slider value without rebuilding bindings', async ({ page, request }) => {
  const { reconcileSliders } = await import('../shared/sliders');
  const project = newProject();
  const code = 'MIDI.s("sine").gain(slider(0.4,0,1))';
  const sliders = reconcileSliders(code, []);
  const anchors = sliders.map(({ id, from, fingerprint }) => ({ id, from, fingerprint }));
  project.midiInstrument = { enabled: true, mode: 'midi', code, appliedCode: code, anchors, appliedAnchors: anchors };
  project.bindings.push({ id: crypto.randomUUID(), profileId: 'virtual', channel: 1, kind: 'cc', number: 20, target: { kind: 'slider', tabId: '@midi', sliderId: sliders[0].id }, pickup: true, enabled: true });
  await request.put('/api/recovery', { data: project });
  await installAudioCapture(page);
  await page.addInitScript(() => {
    const Original = window.WebSocket;
    window.WebSocket = class extends Original {
      constructor(url: string | URL, protocols?: string | string[]) {
        super(url, protocols);
        if (String(url).endsWith('/api/midi')) (window as any).midiTestSocket = this;
      }
    };
  });
  await page.goto('/'); await expect(page.locator('#connection')).toHaveText('Studio connected');
  await page.getByRole('tab', { name: 'MIDI instrument', exact: true }).click();
  await page.getByRole('button', { name: 'Apply instrument', exact: true }).click();
  const result = await page.evaluate(async () => {
    const gain = document.querySelector('#editor-midi-instrument .inline-slider');
    const binding = document.querySelector('#bindings > *');
    let mutations = 0;
    const observer = new MutationObserver(records => { mutations += records.length; });
    observer.observe(document.querySelector('#bindings')!, { childList: true, subtree: true });
    let sequence = 0;
    const send = (bytes: number[]) => (window as any).midiTestSocket.dispatchEvent(new MessageEvent('message', { data: JSON.stringify({ type: 'midi', source: 'studio:virtual', route: 'simulation', sequence: ++sequence, receivedAt: Date.now(), bytes }) }));
    send([144, 60, 100]);
    await new Promise(resolve => setTimeout(resolve, 100));
    send([176, 20, 51]);
    for (let i = 0; i < 512; i++) send([176, 20, i % 128]);
    send([176, 20, 0]);
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    observer.disconnect();
    return { mutations, sameGain: gain === document.querySelector('#editor-midi-instrument .inline-slider'), sameBinding: binding === document.querySelector('#bindings > *') };
  });
  expect(result).toEqual({ mutations: 0, sameGain: true, sameBinding: true });
  await expect(page.getByRole('slider', { name: 'gain inline slider', exact: true })).toHaveValue('0');
  await page.waitForTimeout(150);
  expect(await peak(page)).toBeLessThan(.005);
  await expect.poll(async () => (await (await request.get('/api/recovery')).json()).midiInstrument.appliedCode).toContain('slider(0,');
  // Separate display frames must also keep pickup, including changes in direction.
  for (const value of [1, 20, 90, 127, 60, 0]) {
    await page.evaluate(value => (window as any).midiTestSocket.dispatchEvent(new MessageEvent('message', { data: JSON.stringify({ type: 'midi', source: 'studio:virtual', route: 'simulation', sequence: 1000 + value, receivedAt: Date.now(), bytes: [176, 20, value] }) })), value);
    await expect(page.getByRole('slider', { name: 'gain inline slider', exact: true })).toHaveValue(String(Math.round(value / 127 * 1000) / 1000));
  }

});

test('MIDI keys recall saved presets, consume selector notes and survive reload', async ({ page, request }) => {
  await request.put('/api/recovery', { data: newProject() });
  const saved = await request.post('/api/midi/presets', { data: { name: `Key preset ${Date.now()}`, code: 'MIDI.s("square").gain(0)' } });
  const preset = await saved.json();
  await installAudioCapture(page);
  let socket: WebSocketRoute;
  await page.routeWebSocket('**/api/midi', ws => { socket = ws; ws.connectToServer(); });
  let sequence = 0;
  const midi = (bytes: number[]) => socket.send(JSON.stringify({ type: 'midi', source: 'studio:virtual', route: 'simulation', sequence: ++sequence, receivedAt: Date.now(), bytes }));
  await page.goto('/'); await expect(page.locator('#connection')).toHaveText('Studio connected');
  await page.getByRole('tab', { name: 'MIDI instrument', exact: true }).click();
  await page.getByLabel('MIDI preset', { exact: true }).selectOption(preset.id);
  await page.getByRole('button', { name: 'Map preset to MIDI key', exact: true }).click();
  midi([144, 36, 100]); midi([128, 36, 0]);
  await expect(page.locator('#preset-learn-status')).toContainText('key 36');
  await page.screenshot({ path: 'studio/test-results/midi-preset-mapping.png' });
  await expect.poll(async () => (await (await request.get('/api/recovery')).json()).bindings.some((b: any) => b.target.kind === 'midi-preset' && b.target.presetId === preset.id)).toBe(true);
  await edit(page, 'MIDI.s("sine").gain(0.5)');
  await page.getByRole('button', { name: 'Apply instrument', exact: true }).click();
  midi([144, 60, 100]); expect(await peak(page)).toBeGreaterThan(.01);
  midi([144, 36, 100]);
  await expect(page.locator('#editor-midi-instrument .cm-content')).toHaveText(preset.code);
  await page.waitForTimeout(150); expect(await peak(page)).toBeLessThan(.005);
  midi([128, 36, 0]);
  await expect.poll(async () => (await (await request.get('/api/recovery')).json()).midiInstrument.appliedCode).toBe(preset.code);
  await page.reload(); await expect(page.locator('#connection')).toHaveText('Studio connected');
  await edit(page, 'MIDI.s("triangle").gain(0.3)');
  await page.getByRole('button', { name: 'Apply instrument', exact: true }).click();
  // Even with the sound library open, preset selection keys retain their mapping.
  await page.getByRole('button', { name: 'Sample library', exact: true }).click();
  midi([144, 36, 100]); midi([128, 36, 0]);
  await expect(page.locator('#editor-midi-instrument .cm-content')).toHaveText(preset.code);
  await expect(page.locator('#bindings')).toContainText(preset.name);
});
