import { test, expect } from '@playwright/test';
import { newProject } from '../shared/model';
import { installAudioCapture } from './audio-capture';

test.beforeEach(async ({ request }) => {
  const p = newProject(); p.tabs[0].code = '$: note("c3 e3").s("triangle").gain(0.2)';
  p.clips = [{ id: 'phrase', tabId: p.tabs[0].id, trackId: p.tracks[0].id, start: 0, length: 4, muted: false }];
  await request.put('/api/recovery', { data: p });
});

test('closing all tabs preserves composition and reopening restores code across reload', async ({ page, request }) => {
  await page.goto('/'); await expect(page.locator('#connection')).toHaveText('Studio connected');
  await page.getByRole('button', { name: 'Close Pattern 1', exact: true }).click();
  await expect(page.locator('#empty-editor')).toBeVisible();
  await page.getByRole('button', { name: 'Play composition', exact: true }).click();
  await expect(page.locator('#transport-state')).toContainText('Playing · Composition');
  await page.locator('#composition-stop').click();
  await page.reload(); await expect(page.locator('#empty-editor')).toBeVisible();
  await page.getByRole('button', { name: 'Open a pattern', exact: true }).click();
  await page.locator('[data-open-pattern]').click();
  await expect(page.locator('.cm-content')).toContainText('.s("triangle").gain(0.2)');
  const saved = await (await request.get('/api/recovery')).json();
  expect(saved.tabs).toHaveLength(1); expect(saved.clips).toHaveLength(1);
});

test('sound click opens library directly, previews audible audio, and swaps only the selected token', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await installAudioCapture(page); await page.goto('/'); await expect(page.locator('#connection')).toHaveText('Studio connected');
  await page.locator('.cm-content').getByText('"triangle"', { exact: true }).click();
  await expect(page.locator('#sounds-panel')).toBeVisible();
  await expect(page.locator('#library-destination')).toContainText('Replace “triangle”');
  await page.locator('#sound-search').fill('smooth');
  await expect(page.locator('[data-use-sound="sine"]')).toBeVisible();
  await page.evaluate(() => window.neonCapture.start());
  await page.locator('[data-preview-sound="sine"]').click(); await page.waitForTimeout(300);
  const audio = await page.evaluate(() => window.neonCapture.finish()); expect(audio.peak).toBeGreaterThan(.001);
  await page.locator('[data-use-sound="sine"]').click();
  await expect(page.locator('#sounds-panel')).toBeHidden();
  await expect(page.locator('.cm-content')).toHaveText('$: note("c3 e3").s("sine").gain(0.2)');
  await page.keyboard.press('Control+z'); await expect(page.locator('.cm-content')).toContainText('triangle');
  expect(errors).toEqual([]);
});

test('timeline handles, seek, loop, and sticky headers work in the split and expanded view', async ({ page }) => {
  await page.goto('/'); await expect(page.locator('#connection')).toHaveText('Studio connected');
  await page.getByRole('slider', { name: 'Range start', exact: true }).focus(); await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('slider', { name: 'Range start', exact: true })).toHaveAttribute('aria-valuenow', '1');
  await page.getByRole('slider', { name: 'Playhead', exact: true }).focus(); await page.keyboard.press('ArrowRight');
  await expect(page.locator('#composition-position')).toHaveText('1.00');
  await page.getByRole('button', { name: 'Loop', exact: true }).click();
  await page.getByRole('button', { name: 'Play composition', exact: true }).click();
  await expect.poll(async () => Number(await page.locator('#composition-position').textContent())).toBeGreaterThan(1);
  await page.locator('#composition-stop').click();
  expect(Number(await page.locator('#composition-position').textContent())).toBeGreaterThan(1);
  await page.getByRole('button', { name: 'Return to range start' }).click();
  await expect(page.locator('#composition-position')).toHaveText('1.00');
  await page.getByRole('button', { name: 'Expand composition' }).click(); await expect(page.locator('.workspace')).toBeHidden();
  await page.getByRole('button', { name: 'Expand composition' }).click(); await expect(page.locator('.workspace')).toBeVisible();
  for (let i = 0; i < 7; i++) await page.locator('#add-track').click();
  const top = (await page.locator('#ruler').boundingBox())!.y;
  await page.locator('#sequencer-scroll').evaluate(el => { el.scrollTop = 250; el.scrollLeft = 200; });
  expect((await page.locator('#ruler').boundingBox())!.y).toBe(top);
  expect((await page.locator('.track-header').first().boundingBox())!.x).toBe(0);
});

test('MIDI auditions without capturing then explicitly captures and retains a take', async ({ page }) => {
  await installAudioCapture(page); await page.goto('/'); await expect(page.locator('#connection')).toHaveText('Studio connected');
  await page.locator('.cm-content').getByText('note', { exact: true }).click();
  await page.getByRole('menuitem', { name: 'Play MIDI', exact: true }).click();
  await expect(page.locator('[data-midi-status]')).toContainText('Capture notes when ready');
  await page.getByRole('button', { name: 'Virtual MIDI', exact: true }).click();
  const key = page.getByRole('button', { name: 'C4', exact: true });
  await page.evaluate(() => window.neonCapture.start());
  await key.hover(); await page.mouse.down(); await page.waitForTimeout(150); await page.mouse.up();
  expect((await page.evaluate(() => window.neonCapture.finish())).peak).toBeGreaterThan(.001);
  await expect(page.locator('[data-midi-takes] option')).toHaveCount(0);
  await page.getByRole('button', { name: 'Capture notes', exact: true }).click();
  await expect(page.locator('[data-midi-status]')).toContainText('Playing');
  await key.hover(); await page.mouse.down(); await page.waitForTimeout(200); await page.mouse.up();
  await page.getByRole('button', { name: 'Finish', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Keep take', exact: true })).toBeVisible();
  await expect(page.locator('[data-midi-takes] option')).toHaveCount(1);
  await page.reload(); await expect(page.locator('[data-midi-status]')).toContainText('Recovered');
});

test('library Live buttons audition above a blurred, inactive workspace', async ({ page }) => {
  await installAudioCapture(page); await page.goto('/'); await expect(page.locator('#connection')).toHaveText('Studio connected');
  await page.locator('.cm-content').getByText('"triangle"', { exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Sample library' })).toBeVisible();
  await expect(page.locator('.library-backdrop')).toBeVisible();
  expect(await page.locator('.library-backdrop').evaluate(el => getComputedStyle(el).backdropFilter)).toContain('blur');
  expect(await page.locator('.workspace').evaluate(el => (el as HTMLElement).inert)).toBe(true);
  const originalCode = await page.locator('.cm-content').innerText();
  await expect(page.locator('#sounds-toggle')).toHaveAttribute('aria-expanded', 'true');
  await page.locator('#sound-search').fill('sine');
  await page.locator('[data-live-sound="sine"]').click();
  await expect(page.locator('[data-live-sound="sine"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#library-midi-status')).toContainText('Live');
  await page.evaluate(() => window.neonCapture.start());
  const key = page.getByRole('button', { name: 'Test C4', exact: true });
  await key.hover(); await page.mouse.down(); await page.waitForTimeout(200); await page.mouse.up();
  expect((await page.evaluate(() => window.neonCapture.finish())).peak).toBeGreaterThan(.001);
  await expect(page.locator('#library-midi-status')).toContainText('MIDI 60');
  await page.locator('.cm-content').evaluate(el => (el as HTMLElement).focus());
  await expect(page.locator('.cm-content')).not.toBeFocused();
  await expect(page.locator('.cm-content')).toHaveText(originalCode);
  await page.getByRole('button', { name: 'Close library' }).click();
  await expect(page.locator('#sounds-panel')).toBeHidden();
  expect(await page.locator('.workspace').evaluate(el => (el as HTMLElement).inert)).toBe(false);
  await expect(page.locator('[data-midi-takes] option')).toHaveCount(0);
});

test('seeking a playing composition keeps unapplied drafts out of the audio engine', async ({ page }) => {
  await page.goto('/'); await expect(page.locator('#connection')).toHaveText('Studio connected');
  await page.locator('#composition-play').click(); await expect(page.locator('#transport-state')).toContainText('Playing · Composition');
  const code = page.locator('.cm-content'); await code.focus(); await page.keyboard.press('Control+End'); await page.keyboard.insertText('\nthis is an invalid draft');
  await expect(page.locator('#evaluate')).toBeVisible();
  await page.getByRole('slider', { name: 'Playhead', exact: true }).focus(); await page.keyboard.press('ArrowRight');
  await expect(page.locator('#transport-state')).toContainText('Playing · Composition');
  await expect(page.locator('#evaluate')).toBeVisible();
  await expect(page.locator('#notice')).not.toContainText('Unexpected token');
  await page.locator('#composition-stop').click();
});

test('timeline remapping preserves source phase and scheduler-relative mute boundaries', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async root => {
    const { arrangement, transportPattern, MuteTimeline } = await import('/@fs/' + root + '/studio/shared/arrangement.ts');
    const core = await import(String('/@id/@strudel/core'));
    const clip = { id: 'c', tabId: 'p', trackId: 't', start: 0, length: 8, muted: false };
    const mutes = new MuteTimeline(); mutes.reset([clip], [{ id: 't', muted: false }]);
    const source = arrangement([clip], new Map([['p', core.note('60 62 64 65')]]), mutes);
    const shifted = transportPattern(source, 2.5, 2, 4, false);
    const phase = shifted.queryArc(0, .5).map((h: any) => h.value.note);
    mutes.queue([{ ...clip, muted: true }], [{ id: 't', muted: false }], .1);
    const loop = transportPattern(source, 2, 2, 3, true);
    return { phase, before: loop.queryArc(0, 1).length, after: loop.queryArc(1, 2).length };
  }, process.cwd());
  expect(result.phase).toEqual([64, 65]); expect(result.before).toBe(4); expect(result.after).toBe(0);
});

test('sample metadata is searchable and a different session resets the timeline range', async ({ page, request }) => {
  const job = await (await request.post('/api/generations', { data: { prompt: 'Metadata sound', duration: .5, loop: false } })).json();
  await expect.poll(async () => (await (await request.get(`/api/generations/${job.id}`)).json()).state).toBe('complete');
  const { asset } = await (await request.get(`/api/generations/${job.id}`)).json();
  expect((await request.patch(`/api/samples/${asset.id}`, { data: { tags: ['wooden'], description: 'Soft percussion' } })).ok()).toBe(true);
  await page.goto('/'); await expect(page.locator('#connection')).toHaveText('Studio connected');
  await page.locator('#sounds-toggle').click(); await page.locator('#sound-search').fill('wooden percussion');
  await expect(page.locator(`[data-asset="${asset.id}"]`)).toBeVisible(); await expect(page.locator('#builtin-sounds .asset')).toHaveCount(0);
  await page.locator('#sounds-close').click();
  await page.getByRole('slider', { name: 'Range start', exact: true }).focus(); await page.keyboard.press('ArrowRight');
  await page.locator('#add-session').click(); await page.locator('#edit-name').fill('Range reset'); await page.locator('#edit-dialog button[value=confirm]').click();
  await expect(page.locator('#project-name')).toHaveValue('Range reset');
  await expect(page.getByRole('slider', { name: 'Range start', exact: true })).toHaveAttribute('aria-valuenow', '0');
});

test('sound selection keeps keyboard focus through preview and swap', async ({ page }) => {
  await page.goto('/'); await expect(page.locator('#connection')).toHaveText('Studio connected');
  await page.locator('.cm-content').getByText('"triangle"', { exact: true }).click();
  await page.locator('#sound-search').fill('sine');
  const sound = page.locator('[data-select-sound="sine"]');
  await sound.focus(); await page.keyboard.press('Enter');
  await expect(sound).toBeFocused(); await expect(sound).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Tab'); await expect(page.locator('[data-use-sound="sine"]')).toBeFocused();
  await page.keyboard.press('Tab'); await expect(page.locator('[data-preview-sound="sine"]')).toBeFocused();
  await page.keyboard.press('Enter'); await expect(page.locator('[data-preview-sound="sine"]')).toBeFocused();
  await page.keyboard.press('Shift+Tab'); await page.keyboard.press('Enter');
  await expect(page.locator('#sounds-panel')).toBeHidden();
  await expect(page.locator('.cm-content')).toHaveText('$: note("c3 e3").s("sine").gain(0.2)');
});

test('errors remain readable above the library drawer', async ({ page }) => {
  await page.goto('/'); await expect(page.locator('#connection')).toHaveText('Studio connected');
  await page.locator('[data-close-tab]').click();
  await page.locator('#sounds-toggle').click(); await page.locator('#sound-search').fill('sine');
  await page.locator('[data-use-sound="sine"]').click();
  await expect(page.locator('#notice')).toContainText('Open a pattern');
  // A visible box alone does not prove the drawer isn't painting over the error.
  const foreground = await page.locator('#notice').evaluate(el => {
    const rect = el.getBoundingClientRect(); const before = (el as HTMLElement).style.pointerEvents;
    (el as HTMLElement).style.pointerEvents = 'auto';
    const top = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
    (el as HTMLElement).style.pointerEvents = before;
    return top === el || el.contains(top);
  });
  expect(foreground).toBe(true);
});


test('library dismissal restores focus and keeps the composition layout', async ({ page }) => {
  await page.goto('/'); await expect(page.locator('#connection')).toHaveText('Studio connected');
  const before = await page.locator('#drawer').boundingBox();
  await page.locator('#sounds-toggle').click();
  await page.keyboard.press('Escape');
  await expect(page.locator('#sounds-toggle')).toBeFocused();
  await expect(page.locator('.library-backdrop')).toBeHidden();
  expect(await page.locator('#drawer').boundingBox()).toEqual(before);
  await page.locator('#sounds-toggle').click();
  await page.locator('.library-backdrop').click({ position: { x: 2, y: 2 } });
  await expect(page.locator('#sounds-panel')).toBeHidden();
  await expect(page.locator('#sounds-toggle')).toBeFocused();
});

test('full-height library keeps navigation and MIDI keys visible while browsing', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/'); await expect(page.locator('#connection')).toHaveText('Studio connected');
  await page.locator('#sounds-toggle').click();
  const panel = await page.locator('#sounds-panel').boundingBox();
  expect(panel?.y).toBe(0); expect(panel?.height).toBe(720);
  const heading = await page.locator('.library-header').boundingBox();
  await page.locator('#library-scroll').evaluate(el => el.scrollTop = el.scrollHeight);
  expect(await page.locator('.library-header').boundingBox()).toEqual(heading);
  await expect(page.locator('#sounds-close')).toBeInViewport();
  await page.locator('#sound-search').fill('sine');
  await page.locator('[data-live-sound="sine"]').click();
  await expect(page.locator('#library-keys')).toBeInViewport();
  await page.locator('#sound-search').fill('triangle');
  await expect(page.locator('#library-keys')).toBeInViewport();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.locator('#sounds-panel').boundingBox()).toEqual({ x: 0, y: 0, width: 390, height: 844 });
  expect(await page.locator('#sounds-panel').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  await expect(page.locator('#sounds-close')).toBeInViewport();
  await page.screenshot({ path: '/tmp/strudel-drawer-mobile.png' });
});

test('repository provenance remains visible and searchable after a pack is renamed', async ({ page, request }) => {
  const job = await (await request.post('/api/generations', { data: { prompt: 'Repository sample', duration: .5, loop: false } })).json();
  await expect.poll(async () => (await (await request.get(`/api/generations/${job.id}`)).json()).state).toBe('complete');
  const { asset } = await (await request.get(`/api/generations/${job.id}`)).json();
  await page.route('**/api/samples', async route => {
    const response = await route.fetch();
    const samples = await response.json();
    await route.fulfill({ response, json: samples.map((a: any) => a.id === asset.id ? {
      ...a, provider: 'github', source: { name: 'drums/kick.wav', url: 'https://github.com/tidalcycles/Dirt-Samples/tree/main/drums' },
      pack: { id: asset.id, name: 'My drums', folder: 'drums' }
    } : a) });
  });
  await page.goto('/'); await expect(page.locator('#connection')).toHaveText('Studio connected');
  await page.locator('#sounds-toggle').click();
  await page.locator('#sound-search').fill('tidalcycles/Dirt-Samples');
  await expect(page.locator(`[data-asset="${asset.id}"] .sound-repository`)).toHaveText('GitHub · tidalcycles/Dirt-Samples');
  await page.locator('#library-source').selectOption('upload');
  await expect(page.locator(`[data-asset="${asset.id}"]`)).toBeVisible();
});
