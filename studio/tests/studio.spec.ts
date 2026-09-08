import { openController } from './helpers/controller';
import { test, expect, type Page } from '@playwright/test';
import { newProject } from '../shared/model';

async function editCode(page: Page, code: string) {
  await page.locator('.tab-editor:not([hidden]) .cm-content').focus();
  await page.keyboard.press('Control+Home'); await page.keyboard.press('Control+a'); await page.keyboard.insertText(code);
}
async function patternAction(page: Page, name: string) {
  if (!await page.locator('#tab-menu').getAttribute('open')) {
    if (!await page.getByRole('button', { name, exact: true }).isVisible()) await page.getByLabel('Pattern actions').click();
  }
  await page.getByRole('button', { name, exact: true }).click();
  await page.locator('#tab-menu').evaluate((el: HTMLDetailsElement) => { el.open = false; });
}
async function addClip(page: Page, lane: string, start = '0', length = '1') {
  await patternAction(page, 'Add to composition');
  await page.getByLabel('Track', { exact: true }).selectOption(`track-${Number(lane) + 1}`);
  await page.getByLabel('Start cycle').fill(start); await page.getByLabel('Length', { exact: true }).fill(length);
  await page.getByRole('button', { name: 'Save clip', exact: true }).click();
}
test.beforeEach(async ({ request }) => { await request.put('/api/recovery', { data: newProject() }); });

test('minimal workspace, independent tabs, drawer persistence, keyboard layout and project recovery', async ({ page, request }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/'); await expect(page.locator('#connection')).toHaveText('Studio connected');
  await expect(page.locator('#drawer')).toBeVisible(); await expect(page.locator('#sounds-panel')).toBeHidden();
  await page.getByRole('button', { name: 'Play pattern', exact: true }).click();
  await expect(page.locator('#transport-state')).toContainText('Playing · Pattern 1');
  await page.getByRole('button', { name: 'New pattern', exact: true }).click();
  await editCode(page, '$: note("e3").s("triangle")');
  await expect(page.locator('#transport-state')).toContainText('Playing · Pattern 1');
  await expect(page.locator('#evaluate')).toBeHidden();
  await page.getByRole('tab', { name: 'Pattern 1', exact: true }).click();
  await expect(page.locator('.tab-editor:not([hidden]) .cm-content')).toContainText('$beat');
  await page.getByRole('button', { name: 'Stop playback', exact: true }).click();
  await openController(page);
  await expect(page.locator('#midi-content')).toBeVisible();
  await page.getByRole('button', { name: 'Composition', exact: true }).click();
  await expect(page.locator('#midi-content')).toBeHidden(); await expect(page.locator('#composition-content')).toBeVisible();
  await page.getByLabel('Project name').fill('Design acceptance');
  await page.locator('.project-menu > summary').click();
  await page.getByRole('button', { name: 'Save project', exact: true }).click();
  await expect(page.locator('#notice')).toContainText('Saved Design acceptance');
  const saved = await (await request.get('/api/projects/Design-acceptance')).json();
  expect(saved.version).toBe(5); expect(saved.tabs).toHaveLength(2);
  await expect.poll(async () => (await (await request.get('/api/recovery')).json()).name).toBe('Design acceptance');
  await page.getByLabel('Dark mode', { exact: true }).check();
  await expect(page.locator('html')).toHaveAttribute('data-appearance', 'dark');
  await page.reload(); await expect(page.getByRole('tab', { name: 'Pattern 2', exact: true })).toBeVisible();
  await expect(page.locator('#composition-content')).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-appearance', 'dark');
  await page.getByRole('button', { name: 'Composition', exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await openController(page);
  await expect(page.getByRole('slider', { name: 'Knob 1', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test('MIDI controls stay live across tabs and typed edits apply explicitly', async ({ page, request }) => {
  await page.goto('/'); await expect(page.locator('#connection')).toHaveText('Studio connected');
  await page.getByRole('button', { name: 'Play pattern', exact: true }).click();
  await page.getByRole('slider', { name: 'gain inline slider', exact: true }).focus();
  await page.getByRole('button', { name: 'MIDI Learn', exact: true }).click();
  await openController(page);
  const knob = page.getByRole('slider', { name: 'Knob 1', exact: true });
  await knob.fill('10'); await expect(page.locator('#learn-status')).toContainText('Connected CC 20');
  await knob.fill('127'); await expect(page.getByRole('slider', { name: 'gain inline slider', exact: true })).toHaveValue('1');
  await expect(page.locator('#evaluate')).toBeHidden();
  await page.getByRole('button', { name: 'New pattern', exact: true }).click();
  await knob.fill('0');
  await page.getByRole('tab', { name: 'Pattern 1', exact: true }).click();
  await expect(page.getByRole('slider', { name: 'gain inline slider', exact: true })).toHaveValue('0');
  await page.locator('.tab-editor:not([hidden]) .cm-content').focus();
  await page.keyboard.press('Control+Home'); await page.keyboard.insertText('// changed draft\n');
  await page.getByRole('button', { name: 'Apply changes', exact: false }).click();
  await expect(page.locator('#evaluate')).toBeHidden();
  await expect(page.locator('#transport-state')).toContainText('Playing');
  await editCode(page, 'this is invalid code !!!');
  await page.getByRole('button', { name: 'Apply changes', exact: false }).click();
  await expect(page.locator('#notice')).toContainText('Pattern 1:');
  await expect(page.locator('#transport-state')).toContainText('Playing');
  await page.getByRole('button', { name: 'Stop playback', exact: true }).click();
  await expect(page.locator('#transport-state')).toHaveText('Stopped');
  await page.getByRole('button', { name: 'C4', exact: true }).focus(); await page.keyboard.down('Space');
  await expect.poll(async () => (await (await request.get('/api/feedback')).json()).snapshot?.diagnostics.notes).toBe(1);
  await page.keyboard.up('Space');
  await expect.poll(async () => (await (await request.get('/api/feedback')).json()).snapshot?.diagnostics.notes).toBe(0);
});

test('two lanes play on the composition clock and stop at the final clip', async ({ page, request }) => {
  await page.goto('/'); await expect(page.locator('#connection')).toHaveText('Studio connected');
  await editCode(page, 'setCpm(999)\n$: note("c3").s("triangle")');
  await addClip(page, '0');
  await page.getByRole('button', { name: 'New pattern', exact: true }).click();
  await editCode(page, '$: note("e3").s("triangle")'); await addClip(page, '1');
  await expect(page.locator('.clip')).toHaveCount(2);

  await page.locator('#composition-play').click();
  await expect(page.locator('#transport-state')).toContainText('Playing · Composition');
  await expect(page.locator('#composition-play')).toBeDisabled();
  await expect(page.locator('#arrangement-status')).toHaveText('Stop playback to edit clips');
  await expect(page.locator('#transport-state')).toHaveText('Stopped', { timeout: 7000 });
  await expect.poll(async () => (await (await request.get('/api/recovery')).json()).clips.length).toBe(2);
  await page.reload(); await expect(page.locator('.clip')).toHaveCount(2);
  await page.screenshot({ path: '/tmp/strudel-composition-acceptance.png', fullPage: true });
});

test('generate a fixture sound, preview, insert and reopen playable code', async ({ page, request }) => {
  await page.goto('/'); await expect(page.locator('#connection')).toHaveText('Studio connected');
  await page.getByRole('button', { name: 'Sample library', exact: true }).click(); await page.locator('#add-sounds').evaluate((el: HTMLDetailsElement) => { el.open = true; });
  await page.getByRole('tab', { name: 'Generate', exact: true }).click();
  await page.getByLabel('Describe your next sound').fill('A warm short bass');
  await page.locator('.generation-options > summary').click();
  await page.getByLabel('Duration', { exact: true }).fill('1');
  await page.getByRole('button', { name: 'Generate sound', exact: true }).click();
  await expect(page.locator('#generation-status')).toContainText('Ready to preview');
  await page.getByRole('button', { name: 'Preview A warm short bass', exact: true }).first().click();
  await page.locator('#assets .asset.selected [data-insert-existing]').click();
  await expect(page.locator('#sounds-panel')).toBeHidden();
  await expect(page.locator('.tab-editor:not([hidden]) .cm-content')).toContainText('/api/samples/');
  await page.getByRole('button', { name: 'Play pattern', exact: true }).click(); await expect(page.locator('#transport-state')).toContainText('Playing');
  await expect.poll(async () => (await (await request.get('/api/recovery')).json()).tabs[0].code).toContain('/api/samples/');
  await page.reload(); await expect(page.locator('#connection')).toHaveText('Studio connected');
  await page.getByRole('button', { name: 'Play pattern', exact: true }).click(); await expect(page.locator('#transport-state')).toContainText('Playing');
  expect((await request.post('/api/generations', { data: { prompt: '', duration: 31, loop: false } })).status()).toBe(400);
  expect((await request.post('/api/generations', { headers: { Origin: 'https://example.com' }, data: { prompt: 'rain', duration: 1, loop: false } })).status()).toBe(403);
});

test('pattern queries preserve local timing, layer voices, and apply versions across lookahead', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async (moduleUrl) => {
    const { arrangement, PatternTimeline } = await import(moduleUrl);
    // Let Vite resolve the package; cache filenames vary across clean installs.
    const coreUrl = '/@id/@strudel/core';
    const core = await import(coreUrl);
    const clips = [{ id: 'a', tabId: 'a', lane: 0, start: 2, length: 2 }, { id: 'b', tabId: 'b', lane: 1, start: 2, length: 1 }];
    const pattern = arrangement(clips, new Map([['a', core.slowcat(core.pure('first'), core.pure('second'))], ['b', core.pure('layer')]]));
    const timeline = new PatternTimeline(); timeline.reset(core.pure('old')); const cycle = timeline.queue(core.pure('new'), 2.2);
    const across = timeline.pattern().queryArc(2.5, 3.5).map((h: { value: string }) => h.value);
    timeline.queue(core.pure('latest'), 2.8); timeline.settle(3);
    return { before: pattern.queryArc(0, 2).length, first: pattern.queryArc(2, 3).map((h: { value: string }) => h.value).sort(), second: pattern.queryArc(3, 4).map((h: { value: string }) => h.value), after: pattern.queryArc(4, 6).length, cycle, across, latest: timeline.pattern().queryArc(3, 4).map((h: { value: string }) => h.value) };
  }, `/@fs/${process.cwd()}/studio/shared/arrangement.ts`);
  expect(result).toEqual({ before: 0, first: ['first', 'layer'], second: ['second'], after: 0, cycle: 3, across: ['old', 'new'], latest: ['latest'] });
});

test('real ALSA output returns through the operating system and changes a bound slider', async ({ page, request }) => {
  test.skip(process.env.STUDIO_E2E_ALSA !== '1', 'Requires a Linux host with /dev/snd/seq');
  await page.goto('/'); await expect(page.locator('#connection')).toHaveText('Studio connected');
  await expect.poll(async () => (await (await request.get('/api/status')).json()).bridge.ready).toBe(true);
  await page.getByRole('slider', { name: 'gain inline slider', exact: true }).focus();
  await page.getByRole('button', { name: 'MIDI Learn', exact: true }).click();
  await openController(page);
  await page.getByLabel('MIDI route').selectOption('alsa');
  await page.getByRole('slider', { name: 'Knob 2', exact: true }).fill('1');
  await expect(page.locator('#learn-status')).toContainText('Connected CC 21');
  await page.getByRole('slider', { name: 'Knob 2', exact: true }).fill('127');
  await expect(page.getByRole('slider', { name: 'gain inline slider', exact: true })).toHaveValue('1');
  const feedback = await (await request.get('/api/feedback')).json();
  expect(feedback.events.some((event: { route: string; bytes?: number[] }) => event.route === 'alsa' && event.bytes?.[1] === 21)).toBe(true);
});

test('compiled audio uses live slider values, defers drafts, and cannot restart after Stop', async ({ page }) => {
  await page.goto('/'); await expect(page.locator('#connection')).toHaveText('Studio connected');
  const result = await page.evaluate(async (root) => {
    const { Engine } = await import(`${root}/studio/client/engine.ts`);
    const { newProject } = await import(`${root}/studio/shared/model.ts`);
    const { reconcileSliders } = await import(`${root}/studio/shared/sliders.ts`);
    const project = newProject();
    const editor = { code: '$: note("c3").s("triangle").gain(slider(0.4,0,1))', sliders: [] as any[], values: new Map<string, number>(), liveVersions: new Map<string, number>(), revision: 0, highlight() {} };
    editor.sliders = reconcileSliders(editor.code, []);
    const slider = editor.sliders[0]; editor.values.set(slider.id, .4);
    const engine = new Engine(() => editor, () => project, () => {}, () => {});
    await engine.setup(project); await engine.evaluate(true, project.activeTabId);
    const gains = (cycle: number) => engine.repl.state.pattern.queryArc(cycle, cycle + 1).map((h: any) => h.value.gain);
    const initial = gains(0);
    editor.values.set(slider.id, .8); editor.liveVersions.set(slider.id, 1);
    const live = gains(0);
    editor.code = '$: note("d3").s("triangle").gain(0.2)'; editor.revision++;
    const draft = gains(0); await engine.apply();
    const boundary = engine.pendingCycle, before = gains(boundary - 1), applied = gains(boundary);
    engine.stop();
    editor.code = 'await new Promise(resolve => setTimeout(resolve, 150));\n$: note("c3").s("triangle")'; editor.revision++;
    const preparing = engine.evaluate(true, project.activeTabId);
    await new Promise(resolve => setTimeout(resolve, 25)); engine.stop(); await preparing;
    return { initial, live, draft, before, applied, stopped: !engine.started };
  }, `/@fs/${process.cwd()}`);
  expect(result).toEqual({ initial: [.4], live: [.8], draft: [.8], before: [.8], applied: [.2], stopped: true });
});

test('closing referenced tabs confirms removal and Escape never repeats an earlier confirmation', async ({ page }) => {
  await page.goto('/'); await expect(page.locator('#connection')).toHaveText('Studio connected');
  await addClip(page, '0');
  await page.getByRole('button', { name: 'New pattern', exact: true }).click();
  await page.getByRole('tab', { name: 'Pattern 1', exact: true }).click();
  await patternAction(page, 'Rename pattern');
  await page.locator('#edit-name').fill('Bass'); await page.getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(page.getByRole('tab', { name: 'Bass', exact: true })).toBeVisible();
  await patternAction(page, 'Delete pattern…'); await page.keyboard.press('Escape');
  await expect(page.getByRole('tab', { name: 'Bass', exact: true })).toBeVisible();
  await expect(page.locator('.clip')).toHaveCount(1);
  await patternAction(page, 'Delete pattern…'); await page.getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(page.getByRole('tab', { name: 'Bass', exact: true })).toHaveCount(0);
  await expect(page.locator('.clip')).toHaveCount(0);
});

test('context menus target inactive patterns, copy draft code, and support keyboard dismissal', async ({ page, request }) => {
  await page.goto('/'); await expect(page.locator('#connection')).toHaveText('Studio connected');
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await editCode(page, '$: note("d3").gain(slider(0.3,0,1))');
  await page.getByRole('slider', { name: 'gain inline slider', exact: true }).focus();
  await page.getByRole('button', { name: 'MIDI Learn', exact: true }).click();
  await openController(page);
  await page.getByRole('slider', { name: 'Knob 1', exact: true }).fill('10');
  await expect(page.locator('#learn-status')).toContainText('Connected CC 20');
  await page.locator('#new-tab').click();
  const original = page.getByRole('tab', { name: 'Pattern 1', exact: true });
  await original.click({ button: 'right' });
  await expect(page.getByRole('tab', { name: 'Pattern 2', exact: true })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('menuitem', { name: 'Rename', exact: true }).click();
  await page.locator('#edit-name').fill('Bass'); await page.getByRole('button', { name: 'Confirm', exact: true }).click();
  const bass = page.getByRole('tab', { name: 'Bass', exact: true });
  await bass.focus(); await page.keyboard.press('Shift+F10');
  await expect(page.getByRole('menuitem', { name: 'Color…', exact: true })).toBeFocused();
  await page.keyboard.press('End'); await expect(page.getByRole('menuitem', { name: 'Delete…', exact: true })).toBeFocused();
  await page.keyboard.press('Home'); await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter');
  await expect(page.getByRole('tab', { name: 'Bass copy', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.tab-editor:not([hidden]) .cm-content')).toContainText('note("d3")');
  await expect.poll(async () => (await (await request.get('/api/recovery')).json()).tabs.length).toBe(3);
  const saved = await (await request.get('/api/recovery')).json();
  expect(saved.bindings).toHaveLength(1); expect(saved.bindings[0].target.tabId).toBe(saved.tabs[0].id);
  expect(saved.tabs[2].anchors[0].id).not.toBe(saved.tabs[0].anchors[0].id); expect(saved.clips).toEqual([]);
  expect(saved.tabs[2].id).not.toBe(saved.tabs[0].id);
  await bass.click({ button: 'right' }); await page.keyboard.press('Escape');
  await expect(page.getByRole('menu')).toBeHidden(); await expect(bass).toBeFocused();
  await bass.click({ button: 'right' }); await page.locator('#project-name').click();
  await expect(page.getByRole('menu')).toBeHidden();
  await page.locator('.tab-editor:not([hidden]) .cm-content').getByText('note', { exact: true }).click({ button: 'right' });
  await expect(page.getByRole('menuitem', { name: 'Play MIDI', exact: true })).toBeVisible(); await page.keyboard.press('Escape');
  await page.reload(); await expect(page.getByRole('tab', { name: 'Bass copy', exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test('clip context menus duplicate around occupied space and prevent edits during playback', async ({ page }) => {
  await page.goto('/'); await expect(page.locator('#connection')).toHaveText('Studio connected');
  await addClip(page, '0', '0', '4'); await addClip(page, '0', '5', '3');
  const clip = page.locator('.clip').first();
  await clip.locator('.clip-resize').click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Duplicate', exact: true }).click();
  await expect(page.locator('.clip')).toHaveCount(3);
  await expect(page.locator('.clip').last()).toHaveAttribute('aria-label', /cycle 8 · 4 cycles/);
  await clip.click({ button: 'right' }); await page.getByRole('menuitem', { name: 'Edit', exact: true }).click();
  await expect(page.locator('#clip-dialog')).toBeVisible(); await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.locator('#new-tab').click();
  await clip.click({ button: 'right' }); await page.getByRole('menuitem', { name: 'Open source pattern', exact: true }).click();
  await expect(page.getByRole('tab', { name: 'Pattern 1', exact: true })).toHaveAttribute('aria-selected', 'true');
  await page.locator('#play').click(); await expect(page.locator('#transport-state')).toContainText('Playing');
  await clip.click({ button: 'right' });
  for (const label of ['Edit', 'Duplicate', 'Remove']) await expect(page.getByRole('menuitem', { name: new RegExp(`^${label}`) })).toHaveAttribute('aria-disabled', 'true');
  await page.keyboard.press('Escape'); await page.locator('#stop').click();
  await clip.click({ button: 'right' }); await page.getByRole('menuitem', { name: 'Remove', exact: true }).click();
  await expect(page.locator('.clip')).toHaveCount(2);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('.clip').first().click();
  await expect(page.locator('#clip-dialog')).toBeVisible();
  expect(await page.locator('#clip-dialog').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  await page.getByRole('button', { name: 'Duplicate', exact: true }).click();
  await expect(page.locator('.clip')).toHaveCount(3);
});

test('sound context actions use the clicked sound and menus fit both appearances', async ({ page }) => {
  await page.goto('/'); await expect(page.locator('#connection')).toHaveText('Studio connected');
  await page.locator('#sounds-toggle').click(); await page.locator('#add-sounds > summary').click();
  for (const prompt of ['Context sound A', 'Context sound B']) {
    await page.getByRole('tab', { name: 'Generate', exact: true }).click();
  await page.getByLabel('Describe your next sound').fill(prompt);
    await page.locator('#generate').click(); await expect(page.locator('#generation-status')).toContainText('Ready to preview');
  }
  const first = page.locator('.asset').filter({ hasText: 'Context sound A' });
  await first.click({ button: 'right' }); await page.getByRole('menuitem', { name: 'Rename', exact: true }).click();
  await page.locator('#edit-name').fill('Renamed sound A'); await page.getByRole('button', { name: 'Confirm', exact: true }).click();
  const renamed = page.locator('.asset').filter({ hasText: 'Renamed sound A' });
  await renamed.click({ button: 'right' }); await page.getByRole('menuitem', { name: 'Preview', exact: true }).click();
  await page.locator('#sounds-close').click();
  for (const dark of [false, true]) {
    await page.locator('#dark-mode').setChecked(dark); await page.locator('#sounds-toggle').click();
    await renamed.dispatchEvent('contextmenu', { clientX: 1438, clientY: 1098 });
    const bounds = await page.getByRole('menu').boundingBox();
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(1440); expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(1100);
    await page.screenshot({ path: `/tmp/strudel-context-${dark ? 'dark' : 'light'}.png` });
    await page.keyboard.press('Escape'); await page.locator('#sounds-close').click();
  }
  await page.locator('#sounds-toggle').click(); await renamed.click({ button: 'right' }); await page.getByRole('menuitem', { name: 'Insert into pattern', exact: true }).click();
  await expect(page.locator('.tab-editor:not([hidden]) .cm-content')).toContainText('Renamed sound A');
  await expect(page.locator('.tab-editor:not([hidden]) .cm-content')).not.toContainText('Context sound B');
});

test('context actions preserve the active tab and protect the last pattern', async ({ page }) => {
  await page.goto('/'); await expect(page.locator('#connection')).toHaveText('Studio connected');
  const tab = page.getByRole('tab', { name: 'Pattern 1', exact: true });
  await tab.click({ button: 'right' });
  await expect(page.getByRole('menuitem', { name: /^Delete/ })).toHaveAttribute('aria-disabled', 'true');
  await page.getByRole('menuitem', { name: 'Add to composition', exact: true }).click();
  await page.getByRole('button', { name: 'Save clip', exact: true }).click();
  await expect(page.locator('.clip')).toHaveCount(1);
  await page.locator('#new-tab').click();
  await tab.click({ button: 'right' }); await page.getByRole('menuitem', { name: 'Delete…', exact: true }).click();
  await expect(page.locator('#edit-description')).toContainText('1 composition clip');
  await page.keyboard.press('Escape'); await expect(tab).toBeVisible();
  await tab.click({ button: 'right' }); await page.getByRole('menuitem', { name: 'Delete…', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(tab).toHaveCount(0); await expect(page.locator('.clip')).toHaveCount(0);
  const active = page.getByRole('tab', { name: 'Pattern 2', exact: true });
  await expect(active).toHaveAttribute('aria-selected', 'true');
  await active.click({ button: 'right' }); await page.setViewportSize({ width: 800, height: 700 });
  await expect(page.getByRole('menu')).toBeHidden();
});
