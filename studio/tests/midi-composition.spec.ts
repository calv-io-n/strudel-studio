import { test, expect } from '@playwright/test';
import { newProject } from '../shared/model';
import { installAudioCapture } from './audio-capture';

test('note menu arms composition playback, records repeated takes and switches to transcribed audio', async ({ page, request }) => {
  const project = newProject(); project.tabs[0].code = 'const level = 0.25;\n$: note("c3").s("triangle").gain(level).lpf(1200).room(0.1)';
  project.clips = [{ id: 'lead', tabId: project.tabs[0].id, trackId: project.tracks[0].id, start: 0, length: 2, muted: false }, { id: 'later', tabId: project.tabs[0].id, trackId: project.tracks[0].id, start: 4, length: 2, muted: false }];
  await request.put('/api/recovery', { data: project }); await installAudioCapture(page);
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/'); await expect(page.locator('#connection')).toHaveText('Studio connected');
  await page.locator('.cm-content').getByText('note', { exact: true }).click();
  await page.getByRole('menuitem', { name: 'Play MIDI', exact: true }).click();
  await page.locator('[data-destination-clip=lead]').click(); await expect(page.locator('#transport-state')).toHaveText('Stopped');
  await expect(page.locator('#play-target')).toHaveValue('composition');
  await page.locator('.range-details > summary').click(); await page.locator('[data-midi-end]').fill('1'); await page.locator('.range-details > summary').click();
  await page.getByRole('button', { name: 'Capture notes', exact: true }).click();
  await expect(page.locator('[data-midi-status]')).toContainText('Live MIDI');
  await page.getByRole('button', { name: 'Virtual MIDI', exact: true }).click();
  const key = page.getByRole('button', { name: 'C4', exact: true });
  await page.evaluate(() => window.neonCapture.start());
  await key.hover(); await page.mouse.down(); await page.waitForTimeout(200); await page.mouse.up();
  await expect(page.locator('[data-midi-after]')).toContainText('c4');
  const live = await page.evaluate(() => window.neonCapture.finish()); expect(live.peak).toBeGreaterThan(.001);
  await expect(page.locator('[data-midi-status]')).toContainText('1 takes retained');
  await key.hover(); await page.mouse.down(); await page.waitForTimeout(150); await page.mouse.up();
  await expect(page.locator('[data-midi-takes] option')).toHaveCount(2);
  await page.getByRole('button', { name: 'Preview', exact: true }).click();
  await expect(page.locator('[data-midi-status]')).toContainText('Transcribed');
  await expect(page.locator('[data-midi-takes] option')).toHaveCount(2);
  await expect(page.locator('.cm-content')).toHaveText(project.tabs[0].code.replace('\n', ''));
  await page.locator('.midi-more').evaluate((el: HTMLDetailsElement) => { el.open = true; }); await page.getByRole('button', { name: 'Solo take', exact: true }).click();
  await page.evaluate(() => window.neonCapture.start()); await page.waitForTimeout(2300);
  const preview = await page.evaluate(() => window.neonCapture.finish()); expect(preview.peak).toBeGreaterThan(.001);
  await page.screenshot({ path: '/tmp/midi-composition-review.png' });
  await page.getByRole('button', { name: 'Keep take', exact: true }).click();
  await expect(page.locator('[data-midi-status]')).toContainText('Accepted');
  const saved = await (await request.get('/api/recovery')).json();
  expect(saved.tabs).toHaveLength(2); expect(saved.tabs[0].code).toBe(project.tabs[0].code);
  expect(saved.clips).toHaveLength(3); expect(saved.clips.find((c: any) => c.id === 'later').tabId).toBe(project.tabs[0].id);
  await page.getByRole('button', { name: 'Undo acceptance', exact: true }).click();
  await expect(page.locator('[data-midi-status]')).toHaveText('Acceptance undone');
  expect(errors).toEqual([]);
});

test('IDE instrument retains inherited effects, variables, pitch modifiers and slider values', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async root => {
    const { Engine } = await import('/@fs/' + root + '/studio/client/engine.ts');
    const { destinationFor } = await import('/@fs/' + root + '/studio/shared/performance.ts');
    const { newProject } = await import('/@fs/' + root + '/studio/shared/model.ts');
    const { reconcileSliders } = await import('/@fs/' + root + '/studio/shared/sliders.ts');
    const p = newProject(); p.tabs[0].code = 'const cutoff=1600;\nstack(note(60).mtranspose(12), note(48)).s("triangle").lpf(cutoff).room(0.3).gain(slider(0.2,0,1,0.01))';
    const owner: any = { code: p.tabs[0].code, revision: 0, sliders: reconcileSliders(p.tabs[0].code, []), values: new Map(), liveVersions: new Map(), highlight() {} };
    owner.sliders.forEach((s: any) => owner.values.set(s.id, s.value));
    const engine = new Engine(() => owner, () => p, () => {}, () => {}); await engine.setup(p);
    const pos = owner.code.indexOf('note'); const destination = destinationFor(owner.code, p.tabs[0].id, pos + 1, pos + 1);
    await engine.prepareMidi(owner, destination);
    const before = engine.midiValues(64, 80, .1)[0];
    const slider = owner.sliders[0]; owner.liveVersions.set(slider.id, 1); owner.values.set(slider.id, .7);
    const after = engine.midiValues(64, 80, .2)[0]; engine.stop();
    return { note: before.note, s: before.studioOriginalSound ?? before.s, transpose: before.mtranspose, cutoff: before.cutoff, room: before.room, gainBefore: before.studioInitial?.gain ?? before.gain, gainAfter: after.studioInitial?.gain ?? after.gain };
  }, process.cwd());
  expect(result).toMatchObject({ note: 64, transpose: 12, s: 'triangle', cutoff: 1600, room: .3, gainBefore: .2, gainAfter: .7 });
});

test('split clips preserve source phase in playback queries', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async root => {
    const { arrangement } = await import('/@fs/' + root + '/studio/shared/arrangement.ts');
    const core = await import(String('/@id/@strudel/core'));
    const clip = { id: 'c', tabId: 't', trackId: 'track', start: 8, length: 2, sourceOffset: 6.25, muted: false };
    return arrangement([clip], new Map([['t', core.note('c3 e3')]])).queryArc(8, 9).map((h: any) => [Number(h.whole.begin), Number(h.whole.end), h.value.note]).sort((a: any, b: any) => a[0] - b[0]);
  }, process.cwd());
  expect(result).toEqual([[8, 8.25, 'c3'], [8.25, 8.75, 'e3'], [8.75, 9.25, 'c3']]);
});

test('full composition loops by default and silent subsequent passes keep the transcription', async ({ page, request }) => {
  const p = newProject(); p.bpm = 240; p.tabs[0].code = 'note(60).s("sawtooth").gain(0.15)';
  p.tabs.push({ ...p.tabs[0], id: 'backing', name: 'Backing', code: 'silence' });
  p.clips = [{ id: 'lead', tabId: p.tabs[0].id, trackId: p.tracks[0].id, start: 0, length: 1, muted: false }, { id: 'back', tabId: 'backing', trackId: p.tracks[1].id, start: 0, length: 2, muted: false }];
  await request.put('/api/recovery', { data: p }); await installAudioCapture(page);
  await page.goto('/'); await expect(page.locator('#connection')).toHaveText('Studio connected');
  await page.locator('.cm-content').getByText('note', { exact: true }).click();
  await page.getByRole('menuitem', { name: 'Play MIDI', exact: true }).click();
  await expect(page.locator('[data-midi-end]')).toHaveValue('2');
  await page.getByRole('button', { name: 'Capture notes', exact: true }).click();
  await expect(page.locator('[data-midi-sound]')).toContainText('Sawtooth');
  await page.getByRole('button', { name: 'Virtual MIDI', exact: true }).click();
  await page.waitForTimeout(1150);
  const key = page.getByRole('button', { name: 'D4', exact: true });
  await key.hover(); await page.mouse.down(); await page.waitForTimeout(130); await page.mouse.up();
  await expect(page.locator('[data-midi-after]')).toContainText('d4');
  const proposal = await page.locator('[data-midi-after]').textContent();
  await page.locator('.midi-more').evaluate((el: HTMLDetailsElement) => { el.open = true; }); await page.locator('[data-midi-format]').selectOption('timeCat');
  await expect(page.locator('[data-midi-after]')).toContainText('timeCat');
  await page.locator('[data-midi-format]').selectOption('notes');
  await expect(page.locator('[data-midi-after]')).toHaveText(proposal!);
  await page.waitForTimeout(2200); await expect(page.locator('[data-midi-after]')).toHaveText(proposal!);
  await expect(page.locator('[data-midi-takes] option')).toHaveCount(1);
  await page.getByRole('button', { name: 'Preview', exact: true }).click();
  await page.locator('.midi-more').evaluate((el: HTMLDetailsElement) => { el.open = true; }); await page.getByRole('button', { name: 'Solo take', exact: true }).click();
  await page.evaluate(() => window.neonCapture.start()); await page.waitForTimeout(4100);
  const rendered = await page.evaluate(() => window.neonCapture.finish()); expect(rendered.peak).toBeGreaterThan(.001);
  await page.getByRole('button', { name: 'Keep take', exact: true }).click();
  await expect(page.locator('[data-midi-status]')).toContainText('Accepted');
  const accepted = await (await request.get('/api/recovery')).json();
  expect(accepted.tabs[0].code).toBe(p.tabs[0].code);
  expect(accepted.clips.some((c: any) => c.start === 0 && c.length === 2 && c.tabId !== 'backing')).toBe(true);
});

test('both transcription formats produce valid Strudel with chords and exact phrase length', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async root => {
    const { transcribeNotes, transcribe } = await import('/@fs/' + root + '/studio/shared/performance.ts');
    const core = await import(String('/@id/@strudel/core'));
    const notes = [{ key: 'a', pitch: 60, velocity: 127, start: .24, end: .76 }, { key: 'b', pitch: 64, velocity: 64, start: .26, end: .49 }];
    return [transcribeNotes(notes, 2, .25), transcribe(notes, 2, 0, 2)].map(code => {
      const pattern = new Function('stack', 'timeCat', 'note', 'silence', `return ${code}`)(core.stack, core.timeCat, core.note, core.silence);
      return pattern.queryArc(0, 2).map((h: any) => [Number(h.whole.begin), Number(h.whole.end), h.value.note]).sort((a: any, b: any) => a[0] - b[0] || a[1] - b[1]);
    });
  }, process.cwd());
  expect(result[0]).toEqual([[.25, .5, 'e4'], [.25, .75, 'c4']]);
  expect(result[1]).toEqual([[.24, .76, 60], [.26, .49, 64]]);
});

test('invalid IDE syntax blocks the selected instrument instead of falling back to generic MIDI', async ({ page, request }) => {
  const p = newProject(); p.tabs[0].code = 'setCpm(168 / 4)1\n$: note(60).s("sawtooth").gain(.2)';
  p.clips = [{ id: 'c', tabId: p.tabs[0].id, trackId: p.tracks[0].id, start: 0, length: 1, muted: false }];
  await request.put('/api/recovery', { data: p }); await installAudioCapture(page);
  await page.goto('/'); await expect(page.locator('#connection')).toHaveText('Studio connected');
  await page.locator('.cm-content').getByText('note', { exact: true }).click();
  await page.getByRole('menuitem', { name: 'Play MIDI', exact: true }).click();
  await page.getByRole('button', { name: 'Capture notes', exact: true }).click();
  await expect(page.locator('[data-midi-status]')).toContainText('Cannot play the selected IDE instrument');
  await page.getByRole('button', { name: 'Virtual MIDI', exact: true }).click();
  await page.evaluate(() => window.neonCapture.start());
  await page.getByRole('button', { name: 'C4', exact: true }).hover(); await page.mouse.down(); await page.waitForTimeout(150); await page.mouse.up();
  expect((await page.evaluate(() => window.neonCapture.finish())).peak).toBeLessThan(.00001);
  await expect(page.locator('[data-midi-input]')).toContainText('Cannot play the selected IDE instrument');
});
