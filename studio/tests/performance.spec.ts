import { openController } from './helpers/controller';
import { installAudioCapture } from './audio-capture';
import { test, expect } from '@playwright/test';
import { newProject } from '../shared/model';

test('selection arms its expression without editing code', async ({ page, request }) => {
  const project = newProject(); project.tabs[0].code = 'note("c3 e3").s("triangle")';
  await request.put('/api/recovery', { data: project });
  await page.goto('/'); await expect(page.locator('#connection')).toHaveText('Studio connected');
  const editor = page.locator('.cm-content'); await editor.focus(); await page.keyboard.press('Control+Home');
  for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowRight');
  for (let i = 0; i < 7; i++) await page.keyboard.press('Shift+ArrowRight');
  await page.getByRole('button', { name: 'Play MIDI', exact: true }).click();
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
  await page.locator('.cm-content').focus(); await page.keyboard.press('Control+Home');
  for (let i = 0; i < 10; i++) await page.keyboard.press('Shift+ArrowRight');
  await page.getByRole('button', { name: 'Play MIDI', exact: true }).click();
  await page.getByRole('button', { name: 'Audition', exact: true }).click();
  await expect(page.locator('[data-state]')).toContainText('Audition');
  await openController(page);
  const key = page.getByRole('button', { name: 'C4', exact: true });
  await page.evaluate(() => window.neonCapture.start());
  await key.hover(); await page.mouse.down();
  await page.waitForTimeout(500);
  const recorded = await page.evaluate(() => window.neonCapture.finish());
  expect(recorded.peak).toBeGreaterThan(.001); await page.mouse.up();
  await page.getByRole('button', { name: 'Stop playback', exact: true }).click();
  await expect(page.locator('[data-state]')).toContainText('Stopped');
  await expect(page.locator('.cm-content')).toHaveText(project.tabs[0].code);
  expect(errors).toEqual([]);
});

test('transcription is a live isolated proposal until accepted as one undoable edit', async ({ page, request }) => {
  const project = newProject(); project.tabs[0].code = 'note("c3").s("triangle").gain(0.2)';
  await request.put('/api/recovery', { data: project });
  await page.goto('/'); await expect(page.locator('#connection')).toHaveText('Studio connected');
  const editor = page.locator('.cm-content'); await editor.focus(); await page.keyboard.press('Control+Home');
  for (let i = 0; i < 10; i++) await page.keyboard.press('Shift+ArrowRight');
  await page.getByRole('button', { name: 'Play MIDI', exact: true }).click();
  await page.getByRole('button', { name: 'Capture notes', exact: true }).click();
  await openController(page);
  const key = page.getByRole('button', { name: 'C4', exact: true });
  await key.hover(); await page.mouse.down();
  await expect(page.locator('[data-proposed]')).toContainText('note(60)');
  await expect(editor).toHaveText(project.tabs[0].code);
  await page.mouse.up();
  await page.getByRole('button', { name: 'Stop take', exact: true }).click();
  await page.getByRole('button', { name: 'Preview', exact: true }).click();
  await expect(page.locator('[data-state]')).toContainText('isolated');
  await expect(editor).toHaveText(project.tabs[0].code);
  await page.getByRole('button', { name: 'Stop take', exact: true }).click();
  await page.getByRole('button', { name: 'Keep take', exact: true }).click();
  await expect(editor).toContainText('note(60)');
  await expect(editor).toContainText('.s("triangle").gain(0.2)');
  await editor.focus(); await page.keyboard.press('Control+z');
  await expect(editor).toHaveText(project.tabs[0].code);
});


test('generated Strudel preserves phrase timing and chord overlaps', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async (root) => {
    const { transcribe } = await import('/@fs/' + root + '/studio/shared/performance.ts');
    const core = await import(String('/@id/@strudel/core'));
    const code = transcribe([{ key: 'a', pitch: 60, velocity: 127, start: .25, end: .75 }, { key: 'b', pitch: 64, velocity: 64, start: .25, end: .5 }], 2, 0, 1);
    const pattern = new Function('stack', 'timeCat', 'note', 'silence', `return ${code}`)(core.stack, core.timeCat, core.note, core.silence);
    return pattern.queryArc(0, 2).map((h: any) => [Number(h.whole.begin), Number(h.whole.end), h.value.note, h.value.velocity]);
  }, process.cwd());
  expect(result).toEqual([[.25, .75, 60, 1], [.25, .5, 64, .503937]]);
});

test('jam repeats accompaniment, excludes the destination and survives take Stop', async ({ page, request }) => {
  const project = newProject(); project.tabs[0].code = 'note("c3").s("triangle")';
  project.tabs.push({ ...project.tabs[0], id: 'backing', name: 'Backing', code: 'note("g3").s("triangle")' });
  project.clips = [{ id: 'lead', tabId: 'pattern-1', trackId: 'track-1', start: 0, length: .25, muted: false }, { id: 'back', tabId: 'backing', trackId: 'track-2', start: 0, length: .25, muted: false }];
  await request.put('/api/recovery', { data: project });
  await page.goto('/'); await expect(page.locator('#connection')).toHaveText('Studio connected');
  await page.locator('.cm-content').focus(); await page.keyboard.press('Control+Home');
  for (let i = 0; i < 10; i++) await page.keyboard.press('Shift+ArrowRight');
  await page.keyboard.press('Shift+F10'); await page.getByRole('menuitem', { name: 'Play MIDI without composition', exact: true }).click();
  await page.getByText('Timing and accompaniment', { exact: true }).click();
  await page.getByRole('button', { name: 'Jam with composition', exact: true }).click();
  await expect(page.locator('[data-jam-state]')).toContainText('excluding Pattern 1');
  await page.waitForTimeout(1100);
  await expect(page.locator('#transport-state')).toContainText('Playing');
  await page.getByRole('button', { name: 'Stop take', exact: true }).click();
  await expect(page.locator('#transport-state')).toContainText('Playing');
  await page.getByRole('button', { name: 'Stop playback', exact: true }).click();
  await expect(page.locator('#transport-state')).toHaveText('Stopped');
  expect((await (await request.get('/api/recovery')).json()).clips).toEqual(project.clips);
});

test('loop queries repeat only eligible clips with continuous absolute timing', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async root => {
    const { arrangement, loopRange } = await import('/@fs/' + root + '/studio/shared/arrangement.ts');
    const core = await import(String('/@id/@strudel/core'));
    const clips = ['lead', 'back'].map(id => ({ id, tabId: id, trackId: id, start: 0, length: 1, muted: false }));
    const pattern = loopRange(arrangement(clips, new Map([['lead', core.note(60)], ['back', core.note(64)]]), undefined, () => 'lead'), 0, 1);
    return pattern.queryArc(0, 3).map((h: any) => [Number(h.whole.begin), Number(h.whole.end), h.value.note]);
  }, process.cwd());
  expect(result).toEqual([[0, 1, 64], [1, 2, 64], [2, 3, 64]]);
});

test('mapped gain changes sustained audio without applying a draft', async ({ page, request }) => {
  const project = newProject(); project.tabs[0].code = 'note(60).s("triangle").slow(8).gain(slider(0.3, 0, 1, 0.01))';
  await request.put('/api/recovery', { data: project }); await installAudioCapture(page);
  await page.goto('/'); await expect(page.locator('#connection')).toHaveText('Studio connected');
  await page.evaluate(() => window.neonCapture.start());
  await page.getByRole('button', { name: 'Play pattern', exact: true }).click(); await page.waitForTimeout(500);
  const before = await page.evaluate(() => window.neonCapture.finish()); expect(before.peak).toBeGreaterThan(.01);
  await page.getByRole('slider', { name: 'gain inline slider' }).fill('0');
  await page.waitForTimeout(250); await page.evaluate(() => window.neonCapture.start()); await page.waitForTimeout(250);
  const after = await page.evaluate(() => window.neonCapture.finish()); expect(after.peak).toBeLessThan(.001);
  await expect(page.locator('#transport-state')).toContainText('Playing');
  await page.getByRole('button', { name: 'Stop playback', exact: true }).click();
});

test('reload restores an unaccepted MIDI proposal without starting playback', async ({ page, request }) => {
  const project = newProject(); project.name = 'Recover MIDI proposal'; project.tabs[0].code = 'note(60).s("triangle")';
  await request.put('/api/recovery', { data: project });
  await page.goto('/'); await expect(page.locator('#connection')).toHaveText('Studio connected');
  await page.locator('.cm-content').focus(); await page.keyboard.press('Control+Home');
  for (let i = 0; i < 8; i++) await page.keyboard.press('Shift+ArrowRight');
  await page.getByRole('button', { name: 'Play MIDI', exact: true }).click();
  await page.getByRole('button', { name: 'Capture notes', exact: true }).click();
  await openController(page);
  const key = page.getByRole('button', { name: 'D4', exact: true });
  await key.hover(); await page.mouse.down(); await page.waitForTimeout(150); await page.mouse.up();
  await page.getByRole('button', { name: 'Stop take', exact: true }).click();
  await page.reload(); await expect(page.locator('[data-state]')).toContainText('Recovered MIDI');
  await expect(page.locator('[data-proposed]')).toContainText('note(62)');
  await expect(page.locator('.cm-content')).toHaveText(project.tabs[0].code);
  await expect(page.locator('#transport-state')).toHaveText('Stopped');
  await page.getByRole('button', { name: 'Keep take', exact: true }).click();
  await expect(page.locator('.cm-content')).toContainText('note(62)');
});

test('a nested selection without an instrument requires an explicit fallback', async ({ page, request }) => {
  const project = newProject(); project.tabs[0].code = 'stack(note(60), note(64)).s("sawtooth")';
  await request.put('/api/recovery', { data: project });
  await page.goto('/'); await expect(page.locator('#connection')).toHaveText('Studio connected');
  await page.locator('.cm-content').focus(); await page.keyboard.press('Control+Home');
  for (let i = 0; i < 6; i++) await page.keyboard.press('ArrowRight');
  for (let i = 0; i < 8; i++) await page.keyboard.press('Shift+ArrowRight');
  await page.getByRole('button', { name: 'Play MIDI', exact: true }).click();
  await page.getByRole('button', { name: 'Capture notes', exact: true }).click();
  await expect(page.locator('#notice')).toContainText('does not identify its instrument');
  await page.getByText('Timing and accompaniment', { exact: true }).click();
  await page.getByRole('button', { name: 'Use fallback synth', exact: true }).click();
  await page.getByRole('button', { name: 'Capture notes', exact: true }).click();
  await expect(page.locator('[data-state]')).toContainText('play a note to start');
  await page.getByRole('button', { name: 'Stop playback', exact: true }).click();
  await expect(page.locator('.cm-content')).toHaveText(project.tabs[0].code);
});
