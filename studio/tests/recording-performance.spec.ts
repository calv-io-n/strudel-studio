import { writeFile } from 'node:fs/promises';
import { installAudioCapture } from './audio-capture';
import { midiRecovery } from './midi-recovery';
import { test, expect, type Page } from '@playwright/test';

async function setup(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('studio.quick-start.opt-out', 'true');
    const input: any = { id: 'keys', name: 'Performance keys', state: 'connected', onmidimessage: null };
    Object.defineProperty(navigator, 'requestMIDIAccess', { value: async () => ({ inputs: new Map([['keys', input]]), onstatechange: null }) });
    (window as any).sendCC = (value: number) => input.onmidimessage?.({ data: new Uint8Array([176, 20, value]), timeStamp: performance.now() });
    (window as any).midi = (pitch: number, on: boolean, velocity = 100) => input.onmidimessage?.({ data: new Uint8Array([on ? 144 : 128, pitch, on ? velocity : 0]), timeStamp: performance.now() });
    navigator.mediaDevices.getUserMedia = async () => {
      const context = new AudioContext(), source = context.createOscillator(), output = context.createMediaStreamDestination();
      source.frequency.value = 330; source.connect(output); source.start(); await context.resume(); return output.stream;
    };
  });
  await page.goto('/'); await expect(page.locator('#saved-projects')).toHaveValue('Neon-Drive'); await page.locator('[data-play-target=tab]').click();
  await page.locator('[data-play-target=composition]').click();
  await page.locator('#record-toggle').click();
  await page.locator('[data-capture=midi]').click();
  await page.locator('#record-midi-connection [data-midi-enable]').click();
  await expect(page.locator('#record-midi-connection [data-midi-status]')).toContainText('MIDI ·');
  await expect(page.locator('#record-destination')).toHaveValue('new');
}
async function notes(page: Page) {
  await page.evaluate(() => { for (let i = 0; i < 16; i++) (window as any).midi(60 + i, true); });
  await page.waitForTimeout(180);
  await page.evaluate(() => { for (let i = 0; i < 16; i++) (window as any).midi(60 + i, false); });
}
async function project(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>(resolve => { const r = indexedDB.open('strudel-studio'); r.onsuccess = () => resolve(r.result); });
    const projects: any[] = await new Promise(resolve => { const r = db.transaction('projects').objectStore('projects').getAll(); r.onsuccess = () => resolve(r.result); });
    return projects.find(p => p.tabs.some((t: any) => t.name === 'Take 1')) ?? projects[0];
  });
}

test('MIDI quantization defaults on, persists choices, and records the selected grid', async ({ page }) => {
  await setup(page);
  const grid = page.getByRole('combobox', { name: 'MIDI quantization', exact: true });
  await expect(grid).toHaveValue('0.0625');
  await expect(grid.locator('option')).toHaveCount(5);
  await grid.selectOption('0');
  await page.reload(); await page.locator('[data-play-target=tab]').click(); await page.locator('#record-toggle').click(); await page.locator('[data-capture=midi]').click();
  await expect(grid).toHaveValue('0');
  await grid.selectOption('0.03125');
  if (await page.locator('[data-capture=audio]').getAttribute('aria-pressed') === 'true') await page.locator('[data-capture=audio]').click();
  await page.locator('#record-midi-connection [data-midi-enable]').click();
  await page.locator('#record-toggle').click(); await expect(page.locator('#record-toggle')).toHaveText('Stop');
  await expect(grid).toBeDisabled();
  await expect(page.locator('.performance-panel [data-state]')).toContainText('Recording ·');
  await notes(page); await page.locator('#stop').click();
  await expect.poll(async () => (await midiRecovery(page))?.grid).toBe(1 / 32);
  await page.reload(); await expect(grid).toHaveValue('0.03125');
  await expect(grid).toBeDisabled();
});

for (const enabled of [false, true]) test(`MIDI velocity normalization ${enabled ? 'on' : 'off'} persists through recovery and saving`, async ({ page }) => {
  await setup(page);
  const toggle = page.getByRole('checkbox', { name: 'Normalize velocity', exact: true });
  await expect(toggle).not.toBeChecked();
  await toggle.setChecked(enabled);
  if (await page.locator('[data-capture=audio]').getAttribute('aria-pressed') === 'true') await page.locator('[data-capture=audio]').click();
  await page.locator('#record-toggle').click(); await expect(page.locator('#record-toggle')).toHaveText('Stop');
  await expect(toggle).toBeDisabled();
  await expect(page.locator('.performance-panel [data-state]')).toContainText('Recording ·');
  await page.evaluate(() => { (window as any).midi(60, true, 20); (window as any).midi(64, true, 120); });
  await page.waitForTimeout(150);
  await page.evaluate(() => { (window as any).midi(60, false); (window as any).midi(64, false); });
  await page.locator('#record-toggle').click();
  await expect.poll(async () => (await midiRecovery(page))?.normalizeVelocity).toBe(enabled);
  expect((await midiRecovery(page)).notes.map((n: any) => n.velocity)).toEqual([20, 120]);
  await page.reload(); await expect(toggle).toBeChecked({ checked: enabled }); await expect(toggle).toBeDisabled();
  await page.locator('[data-accept]').filter({ visible: true }).click();
  await expect(page.getByRole('tab', { name: 'Take 1', exact: true })).toBeVisible();
  const saved = await project(page), code = saved.tabs.find((t: any) => t.name === 'Take 1').code;
  const velocities = [...code.matchAll(/velocity\(([^)]+)\)/g)].map(m => Number(m[1]));
  expect(velocities).toEqual(enabled ? [.787402, .787402] : [.15748, .944882]);
  await page.reload(); await page.locator('#record-toggle').click(); await page.locator('[data-capture=midi]').click();
  await expect(toggle).toBeChecked({ checked: enabled });
});

test('new MIDI pattern records directly onto an occupied composition track', async ({ page }) => {
  await installAudioCapture(page); await setup(page);
  if (await page.locator('[data-capture=audio]').getAttribute('aria-pressed') === 'true') await page.locator('[data-capture=audio]').click();
  await page.locator('#record-track').selectOption('track-2');
  await page.locator('#record-toggle').click(); await expect(page.locator('#record-toggle')).toHaveText('Stop');
  await page.waitForTimeout(100); await notes(page);
  await expect(page.locator('[data-pending-tab]')).toHaveCount(1);
  await expect(page.locator('.pending-code').filter({ hasText: 'timeCat' })).toHaveCount(0);
  await page.locator('#composition-stop').click();
  await page.locator('[data-accept]').filter({ visible: true }).click();
  await expect(page.getByRole('tab', { name: 'Take 1', exact: true })).toBeVisible();
  const saved = await project(page), take = saved.tabs.find((t: any) => t.name === 'Take 1');
  expect(take.code).toContain('note(60)'); expect(take.code).toContain('note(75)');
  expect(saved.clips.find((c: any) => c.tabId === take.id).trackId).toBe('track-2');
  expect(saved.tabs).toHaveLength(5);
  await page.reload(); await expect(page.getByRole('tab', { name: 'Take 1', exact: true })).toBeVisible();
  await page.getByRole('tab', { name: 'Take 1', exact: true }).click(); await page.locator('[data-play-target=tab]').click();
  for (let pass = 0; pass < 2; pass++) {
    await page.evaluate(() => window.neonCapture.start()); await page.locator('#play').click(); await page.waitForTimeout(2200);
    const audio = await page.evaluate(() => window.neonCapture.finish()); await page.locator('#stop').click();
    expect(audio.bins.filter(bin => bin.peak > .001).length).toBeGreaterThanOrEqual(2);
  }
});

test('recording arms at the next bar without restarting composition and saves both inputs', async ({ page }) => {
  await setup(page);
  await page.locator('#composition-play').click(); await page.waitForTimeout(450);
  const before = Number(await page.locator('#seek-handle').getAttribute('aria-valuenow'));
  await page.locator('#record-toggle').click(); await expect(page.locator('#record-toggle')).toHaveText('Stop');
  const after = Number(await page.locator('#seek-handle').getAttribute('aria-valuenow'));
  expect(after).toBeGreaterThanOrEqual(before);
  await page.waitForTimeout(1700); await notes(page); await page.locator('#composition-stop').click();
  await page.locator('#record-retry').click();
  await expect(page.getByRole('tab', { name: 'Take 1', exact: true })).toBeVisible();
  const saved = await project(page), take = saved.tabs.find((t: any) => t.name === 'Take 1');
  expect(take.code).toContain('Recorded MIDI'); expect(take.code).toContain('Recorded audio');
  expect(saved.clips.find((c: any) => c.tabId === take.id).start).toBeGreaterThan(0);
});

test('15 minute dense MIDI and controller soak with mic and looping backing', async ({ page }, testInfo) => {
  const seconds = Number(process.env.STUDIO_STRESS_SECONDS ?? 0); test.skip(!seconds, 'Set STUDIO_STRESS_SECONDS=900 for the real-time soak.');
  test.setTimeout((seconds + 120) * 1000);
  await page.addInitScript(() => {
    const state: any = (window as any).stress = { frames: 0, streams: new Map(), timings: [], tasks: [], notes: 0, start: 0, maxGap: 0, clocks: 0, maxClocks: 0 };
    const Constant = ConstantSourceNode;
    (window as any).ConstantSourceNode = new Proxy(Constant, { construct(Target, args) {
      const node = Reflect.construct(Target, args) as ConstantSourceNode;
      state.clocks++; state.maxClocks = Math.max(state.maxClocks, state.clocks);
      node.addEventListener('ended', () => state.clocks--, { once: true });
      return node;
    } });
    new PerformanceObserver(list => { for (const entry of list.getEntries()) if (state.start) state.tasks.push({ time: performance.now() - state.start, duration: entry.duration }); }).observe({ type: 'longtask', buffered: false });
    const Original = AudioWorkletNode;
    (window as any).AudioWorkletNode = new Proxy(Original, { construct(Target, args) {
      const node = Reflect.construct(Target, args) as AudioWorkletNode;
      if (args[1] === 'studio-take') {
        const stream = { frames: 0, rate: (args[0] as AudioContext).sampleRate, messages: 0, signalChunks: 0 }; state.streams.set(node, stream);
        node.port.addEventListener('message', ({ data }) => {
          if (data.type === 'started') state.start ||= performance.now();
          if (data.type === 'audio') {
            stream.frames += data.left.length; stream.messages++;
            if (data.left.some((value: number) => Math.abs(value) > .001)) stream.signalChunks++;
          }
        }); node.port.start();
      }
      return node;
    } });
  });
  await setup(page);
  const profiler = process.env.STUDIO_PROFILE ? await page.context().newCDPSession(page) : undefined;
  if (profiler) { await profiler.send('Profiler.enable'); await profiler.send('Profiler.start'); }
  // Bind the visible filter to the same physical input, exercising actual mapped CC traffic.
  const slider = page.locator('.tab-editor:not([hidden]) [data-input-function=slider]').first();
  await slider.click(); await page.getByRole('menuitem', { name: 'Bind MIDI control', exact: true }).click();
  await page.evaluate(() => { (window as any).sendCC(80); });
  await page.locator('#composition-loop').click(); await page.locator('#composition-play').click();
  await page.locator('#record-toggle').click(); await expect(page.locator('#record-toggle')).toHaveText('Stop');
  await expect.poll(() => page.evaluate(() => (window as any).stress.start)).toBeGreaterThan(0);
  await page.evaluate(({ seconds, rate }) => {
    const s = (window as any).stress, w = window as any; let lastNote = -1, lastBurst = 0, last = performance.now();
    const send = (pitch: number) => { const start = performance.now(); w.midi(pitch, true); s.timings.push({ time: start - s.start, duration: performance.now() - start }); s.notes++; setTimeout(() => w.midi(pitch, false), 80); };
    s.timer = setInterval(() => {
      const now = performance.now(), elapsed = (now - s.start) / 1000; if (now - last > 100) (s.gaps ??= []).push({ time: elapsed, duration: now - last }); s.maxGap = Math.max(s.maxGap, now - last); last = now;
      if (elapsed >= seconds - .2) { clearInterval(s.timer); return; }
      w.sendCC(Math.floor(elapsed * 71) % 128); w.sendCC(Math.floor(elapsed * 79) % 128);
      const beat = Math.floor(elapsed * rate); if (beat !== lastNote) { lastNote = beat; send(48 + beat % 36); }
      const burst = Math.floor(elapsed / 60); if (burst > lastBurst) { lastBurst = burst; for (let i = 0; i < 64; i++) send(32 + i); }
    }, 10);
  }, { seconds, rate: Number(process.env.STUDIO_STRESS_NOTE_RATE ?? 8) });
  const deadline = Date.now() + seconds * 1000;
  let nextProgress = Date.now() + 60000;
  while (Date.now() < deadline) {
    await page.waitForTimeout(Math.min(30000, deadline - Date.now()));
    if (Date.now() >= nextProgress) {
      console.log('Capture progress', await page.evaluate(() => {
        const s = (window as any).stress;
        const stream = [...s.streams.values()][0] as any;
        return { seconds: Math.round((performance.now() - s.start) / 1000), audioSeconds: Math.round(stream.frames / stream.rate), notes: s.notes, maxGap: Math.round(s.maxGap), clocks: s.clocks, maxClocks: s.maxClocks };
      }));
      nextProgress += 60000;
    }
  }
  if (await page.locator('#record-toggle').textContent() === 'Stop') await page.locator('#composition-stop').click();
  await expect(page.locator('#record-retry')).toHaveText('Keep take', { timeout: 90000 });
  const metrics = await page.evaluate(() => { const s = (window as any).stress; clearInterval(s.timer); return { notes: s.notes, timings: s.timings, tasks: s.tasks, maxGap: s.maxGap, gaps: s.gaps, clocks: s.clocks, maxClocks: s.maxClocks, streams: [...s.streams.values()] }; });
  const notesSaved = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>(resolve => { const r = indexedDB.open('strudel-studio'); r.onsuccess = () => resolve(r.result); });
    return new Promise<number>(resolve => { const r = db.transaction('pending').objectStore('pending').count(IDBKeyRange.bound('midi-journal:Neon-Drive:note:', 'midi-journal:Neon-Drive:note:\uffff')); r.onsuccess = () => resolve(r.result); });
  });
  const p95 = (rows: { duration: number }[]) => rows.map(r => r.duration).sort((a, b) => a - b)[Math.floor(rows.length * .95)] ?? 0;
  const summary = { ...metrics, p95: p95(metrics.timings), early: p95(metrics.timings.filter((t: any) => t.time < 60000)), late: p95(metrics.timings.filter((t: any) => t.time > (seconds - 60) * 1000)), notesSaved };
  const artifact = testInfo.outputPath('recording-stress.json'); await writeFile(artifact, JSON.stringify(summary));
  await testInfo.attach('recording-stress.json', { path: artifact, contentType: 'application/json' });
  if (profiler) { const profile = await profiler.send('Profiler.stop'); await writeFile(testInfo.outputPath('recording.cpuprofile'), JSON.stringify(profile.profile)); }
  console.log(JSON.stringify({ ...summary, timings: undefined, tasks: undefined }));
  expect(notesSaved).toBe(metrics.notes); expect(summary.p95).toBeLessThan(5);
  expect(summary.late).toBeLessThanOrEqual(Math.max(.2, summary.early * 1.25));
  expect(metrics.streams).toHaveLength(2);
  for (const stream of metrics.streams as { frames: number; rate: number; messages: number; signalChunks: number }[]) {
    expect(stream.frames / stream.rate).toBeGreaterThan(seconds - 1);
    expect(stream.signalChunks).toBeGreaterThanOrEqual(Math.floor((seconds - 1) * stream.rate / 8192));
  }
  expect(metrics.maxGap).toBeLessThan(250);
  expect(metrics.maxClocks).toBeLessThan(256);
  await page.locator('#record-retry').click();
  await expect(page.getByRole('tab', { name: 'Take 1', exact: true })).toBeVisible({ timeout: 90000 });
  const reloadStarted = Date.now();
  await page.reload();
  await expect(page.getByRole('tab', { name: 'Take 1', exact: true })).toBeVisible({ timeout: 30000 });
  console.log('Saved take reload ms', Date.now() - reloadStarted);
  const saved = await project(page), tab = saved.tabs.find((tab: any) => tab.name === 'Take 1');
  expect(tab.code.match(/note\(/g)).toHaveLength(metrics.notes);
  expect(tab.code).toContain('Recorded audio');
});

test('Skip to beginning stays stopped and loop recording keeps every pass on the selected track', async ({ page }) => {
  await page.addInitScript(() => {
    (window as any).metronomeClicks = [];
    const create = AudioContext.prototype.createOscillator;
    AudioContext.prototype.createOscillator = function() {
      const oscillator = create.call(this), start = oscillator.start;
      oscillator.start = function(at = 0) {
        if (this.frequency.value === 1200 || this.frequency.value === 850) (window as any).metronomeClicks.push({ at, accent: this.frequency.value === 1200 });
        start.call(this, at);
      };
      return oscillator;
    };
  });
  await setup(page);
  if (await page.locator('[data-capture=audio]').getAttribute('aria-pressed') === 'true') await page.locator('[data-capture=audio]').click();
  await page.locator('[data-range-edge=end]').press('Home'); // One beat loop.
  await page.locator('#composition-loop').click();
  await page.locator('#count-in').click(); await page.locator('#count-in').click();
  await page.locator('#composition-play').click(); await expect(page.locator('#count-in-beat')).not.toHaveText(''); await expect(page.locator('#count-in-beat')).toHaveText('');
  await page.waitForTimeout(700); await page.getByRole('button', { name: 'Skip to beginning', exact: true }).click();
  await expect(page.locator('#composition-play')).toBeEnabled();
  await expect(page.locator('#seek-handle')).toHaveAttribute('aria-valuenow', '1');
  const stoppedClicks = await page.evaluate(() => (window as any).metronomeClicks.length);
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => (window as any).metronomeClicks.length)).toBe(stoppedClicks);
  await expect(page.getByRole('button', { name: 'Restart from beginning' })).toHaveCount(0);
  await page.locator('#composition-play').click();
  await expect(page.locator('#count-in-beat')).not.toHaveText(''); await expect(page.locator('#count-in-beat')).toHaveText('');
  await page.evaluate(() => { (window as any).metronomeClicks = []; });
  await page.locator('#record-toggle').click(); await expect(page.locator('#skip-beginning')).toBeDisabled();
  await expect(page.locator('.performance-panel [data-state]')).toContainText('Recording ·');
  await notes(page); await page.waitForTimeout(500); await notes(page);
  await page.locator('#composition-stop').click(); await page.locator('[data-accept]').filter({ visible: true }).click();
  await expect(page.getByRole('tab', { name: 'Take 1', exact: true })).toBeVisible();
  const p = await project(page), tab = p.tabs.find((t: any) => t.name === 'Take 1');
  expect(tab.code.match(/note\(/g)).toHaveLength(32); expect(p.clips.find((c: any) => c.tabId === tab.id).length).toBeGreaterThan(.25);
  expect(p.tracks).toHaveLength(2); await expect(page.locator('#composition-loop')).toHaveAttribute('aria-pressed', 'true');
  const clicks: { at: number; accent: boolean }[] = await page.evaluate(() => (window as any).metronomeClicks);
  expect(clicks.length).toBeGreaterThan(4); expect(clicks.every(click => click.accent), JSON.stringify(clicks)).toBe(true);
  for (let i = 1; i < clicks.length; i++) expect(clicks[i].at - clicks[i - 1].at).toBeCloseTo(60 / 168, 2);
});

test('input sliders change recorded sound immediately and defer code edits until Stop', async ({ page }) => {
  await page.addInitScript(() => {
    (window as any).inputPeaks = [];
    let index = 0;
    const Original = AudioWorkletNode;
    (window as any).AudioWorkletNode = new Proxy(Original, { construct(Target, args) {
      const node = Reflect.construct(Target, args) as AudioWorkletNode;
      if (args[1] === 'studio-take') {
        const stream = index++;
        node.port.addEventListener('message', ({ data }) => {
          if (data.type === 'audio') {
            const peaks = (window as any).inputPeaks;
            peaks[stream] = Math.max(peaks[stream] ?? 0, ...data.left.map(Math.abs));
          }
        }); node.port.start();
      }
      return node;
    } });
  });
  await setup(page); await page.locator('[data-capture=midi]').click();
  await page.getByRole('tab', { name: 'Audio input', exact: true }).click();
  const content = page.locator('#editor .cm-content:visible');
  await content.fill('AUDIO.gain(slider(0.2, 0, 1, 0.01))'); await page.locator('#audio-apply').click();
  await page.locator('#record-toggle').click(); await expect(page.locator('#record-toggle')).toHaveText('Stop');
  await expect.poll(() => page.evaluate(() => (window as any).inputPeaks[0] ?? 0)).toBeGreaterThan(.1);
  const before = await page.evaluate(() => { const peak = (window as any).inputPeaks[0]; (window as any).inputPeaks = []; return peak; });
  await page.locator('#editor .inline-slider:visible').evaluate((input: HTMLInputElement) => {
    input.value = '0.8'; input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await expect.poll(() => page.evaluate(() => (window as any).inputPeaks[0] ?? 0)).toBeGreaterThan(before * 3.5);
  await expect(content).toContainText('slider(0.2,');
  await page.locator('#composition-stop').click();
  await expect(content).toContainText('slider(0.8,');
  await expect(page.locator('#record-retry')).toHaveText('Keep take', { timeout: 15000 });
});

test('a large legacy MIDI transcription saves and stays audible on repeated playback starts', async ({ page }, testInfo) => {
  test.setTimeout(90000);
  await installAudioCapture(page); await setup(page);
  const profiler = process.env.STUDIO_PROFILE ? await page.context().newCDPSession(page) : undefined;
  let profileTask: Promise<void> | undefined;
  const saveProfile = () => profileTask ??= (async () => {
    if (!profiler) return;
    const { profile } = await profiler.send('Profiler.stop'); await writeFile(testInfo.outputPath('legacy.cpuprofile'), JSON.stringify(profile));
  })();
  if (profiler) { await profiler.send('Profiler.enable'); await profiler.send('Profiler.start'); }
  const profileTimer = profiler ? setTimeout(() => { void saveProfile().catch(() => {}); }, 15000) : undefined;
  await page.locator('[data-play-target=tab]').click();
  const length = 700;
  const voices = Array.from({ length: 8000 }, (_, i) => {
    const start = Number((i * .0875).toFixed(6)), duration = .035;
    return `timeCat([${start}, silence], [${duration}, note(${48 + i % 24}).velocity(0.8)], [${Number((length - start - duration).toFixed(6))}, silence]).slow(${length})`;
  });
  const code = `stack(${voices.join(',\n')}).s("sine").gain(slider(0.1, 0, 1, 0.01))`;
  await page.locator('#save-now').click(); await expect(page.locator('#saved-state')).toHaveText('Saved in this browser');
  // Seed the former recorder format directly, as an existing browser session.
  // Large native contenteditable insertions exercise Chromium's paste implementation.
  await page.evaluate(async code => {
    const db = await new Promise<IDBDatabase>(resolve => { const r = indexedDB.open('strudel-studio'); r.onsuccess = () => resolve(r.result); });
    const p: any = await new Promise(resolve => { const r = db.transaction('projects').objectStore('projects').get('Neon-Drive'); r.onsuccess = () => resolve(r.result); });
    const tab = p.tabs.find((tab: any) => tab.name === 'Lead'); tab.code = code; tab.anchors = []; p.activeTabId = tab.id; p.revision++;
    await new Promise<void>(resolve => { const tx = db.transaction('projects', 'readwrite'); tx.objectStore('projects').put(p, 'Neon-Drive'); tx.oncomplete = () => resolve(); });
    db.close();
  }, code);
  await page.reload(); await expect(page.getByRole('tab', { name: 'Lead', exact: true })).toBeVisible({ timeout: 30000 });
  await page.locator('.tab-editor:not([hidden]) .cm-content').focus(); await page.keyboard.press('Control+End');
  await page.locator('.tab-editor:not([hidden]) .inline-slider').evaluate((input: HTMLInputElement) => {
    input.value = '0.2'; input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await expect(page.locator('.tab-editor:not([hidden]) .cm-content')).toContainText('slider(0.2');
  await page.locator('#save-now').click(); await expect(page.locator('#saved-state')).toHaveText('Saved in this browser', { timeout: 30000 });
  const reloaded = Date.now();
  await page.reload(); await expect(page.getByRole('tab', { name: 'Lead', exact: true })).toBeVisible({ timeout: 30000 }); await page.locator('[data-play-target=tab]').click();
  console.log('Legacy take reload ms', Date.now() - reloaded);
  for (let pass = 0; pass < 2; pass++) {
    await page.evaluate(() => window.neonCapture.start());
    await page.locator('#play').click(); await expect(page.locator('#play')).toBeDisabled({ timeout: 30000 });
    await page.waitForTimeout(2300);
    const result = await page.evaluate(() => window.neonCapture.finish());
    await page.locator('#stop').click();
    expect(result.bins.filter(bin => bin.peak > .001).length).toBeGreaterThanOrEqual(2);
  }
  const saved = await project(page);
  expect(saved.tabs.find((tab: any) => tab.name === 'Lead').code).toContain(code.replace('slider(0.1,', 'slider(0.2,'));
  clearTimeout(profileTimer); await saveProfile();
});
