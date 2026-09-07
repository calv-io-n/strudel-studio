import { test, expect } from '@playwright/test';
import { newProject } from '../shared/model';

test.beforeEach(async ({ request }) => {
  const p = newProject(); p.bpm = 240; p.tabs[0].code = '$: note("c3*4").s("triangle").gain(.15)';
  p.clips = [{ id: 'a', tabId: 'pattern-1', trackId: 'track-1', start: 0, length: 8, muted: false }];
  await request.put('/api/recovery', { data: p });
});
test('tab colors, track controls, clip mute and quarter-cycle keyboard edits persist', async ({ page, request }) => {
  await page.goto('/'); await expect(page.locator('#connection')).toHaveText('Studio connected');
  await page.getByRole('button', { name: 'New pattern', exact: true }).click();
  await page.getByRole('tab', { name: 'Pattern 1', exact: true }).click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Color…', exact: true }).click();
  await page.getByRole('button', { name: 'rose', exact: true }).click();
  await expect(page.getByRole('tab', { name: 'Pattern 1', exact: true })).toHaveAttribute('data-color', 'rose');
  await expect(page.getByRole('tab', { name: 'Pattern 2', exact: true })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('button', { name: 'Composition', exact: true }).click();
  await expect(page.locator('[data-clip=a]')).toHaveAttribute('data-color', 'rose');
  await page.locator('#snap').selectOption('.25'.replace(/^\./, '0.'));
  await page.locator('[data-clip=a]').focus(); await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Shift+ArrowLeft'); await page.keyboard.press('ArrowDown');
  await expect(page.locator('[data-track-id=track-2] [data-clip=a]')).toBeVisible();
  await page.locator('[data-clip=a]').click({ button: 'right' }); await page.getByRole('menuitem', { name: 'Mute', exact: true }).click();
  await expect(page.locator('[data-clip=a]')).toHaveAttribute('data-muted', 'true');
  await page.locator('#add-track').click(); await expect(page.locator('.track-row')).toHaveCount(3);
  await page.getByRole('button', { name: 'Actions for Track 3' }).click(); await page.getByRole('menuitem', { name: 'Rename', exact: true }).click();
  await page.locator('#edit-name').fill('Percussion'); await page.locator('#edit-dialog button[value=confirm]').click();
  await expect(page.getByRole('button', { name: 'Mute Percussion', exact: true })).toBeVisible();
  await expect.poll(async () => (await (await request.get('/api/recovery')).json()).tracks[2]?.name).toBe('Percussion');
  await page.reload(); await expect(page.locator('[data-clip=a]')).toHaveAttribute('data-color', 'rose');
  const saved = await (await request.get('/api/recovery')).json(); expect(saved.clips[0]).toMatchObject({ start: .25, length: 7.75, trackId: 'track-2', muted: true });
});

test('pointer dragging preserves grab offset, previews placement and cancels on Escape', async ({ page }) => {
  await page.goto('/'); await page.getByRole('button', { name: 'Composition', exact: true }).click();
  const clip = page.locator('[data-clip=a]'); const box = (await clip.boundingBox())!;
  await page.mouse.move(box.x + 100, box.y + 20); await page.mouse.down(); await page.mouse.move(box.x + 164, box.y + 20, { steps: 5 });
  await expect(page.locator('.drag-ghost')).toBeVisible(); await page.waitForTimeout(80); await page.mouse.up();
  await expect(clip).toHaveCSS('left', '64px');
  const next = (await clip.boundingBox())!;
  await page.mouse.move(next.x + 100, next.y + 20); await page.mouse.down(); await page.mouse.move(next.x + 228, next.y + 20, { steps: 5 });
  await page.keyboard.press('Escape'); await page.mouse.up(); await expect(clip).toHaveCSS('left', '64px'); await expect(page.locator('.drag-ghost')).toHaveCount(0); await expect(page.locator('#clip-dialog')).not.toBeVisible();
});

test('live mutes use a separate safe-boundary timeline from code updates', async ({ page }) => {
  await page.goto('/'); await page.getByRole('button', { name: 'Composition', exact: true }).click();
  await page.locator('#play-target').selectOption('composition'); await page.locator('#play').click();
  await expect(page.locator('#transport-state')).toContainText('Playing');
  await page.locator('.tab-editor:not([hidden]) .cm-content').click(); await page.keyboard.press('Control+a'); await page.keyboard.insertText('$: note("e4").s("triangle")');
  await page.getByRole('button', { name: 'Mute Track 1', exact: true }).click();
  await expect(page.locator('#arrangement-status')).toContainText('Mute change at cycle');
  await expect(page.locator('#evaluate')).toBeVisible();
  await page.getByRole('button', { name: 'Unmute Track 1', exact: true }).click();
  await page.locator('#evaluate').click(); await page.locator('#stop').click();
  await expect(page.locator('#arrangement-status')).not.toContainText('Mute change');
  const result = await page.evaluate(async (processRoot) => {
    const { MuteTimeline, PatternTimeline, arrangement } = await import('/@fs/' + processRoot + '/studio/shared/arrangement.ts');
    const core = await import(String('/@id/@strudel/core'));
    const clips = [{ id: 'a', tabId: 'p', trackId: 't', start: .25, length: 3, muted: false }];
    const mutes = new MuteTimeline(); const tracks = [{ id: 't', muted: false }]; mutes.reset(clips, tracks);
    const patterns = new PatternTimeline(); patterns.reset(arrangement(clips, new Map([['p', core.pure({ note: 60 })]]), mutes));
    const boundary = mutes.queue(clips, [{ id: 't', muted: true }], .2);
    patterns.queue(arrangement(clips, new Map([['p', core.pure({ note: 72 })]]), mutes), .2);
    const silent = patterns.pattern().queryArc(1, 2).length;
    mutes.queue(clips, tracks, 1.2);
    return { boundary, silent, resumed: patterns.pattern().queryArc(2, 3).map((h: any) => h.value.note) };
  }, process.cwd());
  expect(result).toEqual({ boundary: 1, silent: 0, resumed: [72, 72] });
});

test('tracks enforce the limit and confirm populated removal while preserving the final track', async ({ page }) => {
  await page.goto('/'); await page.getByRole('button', { name: 'Composition', exact: true }).click();
  await page.getByRole('button', { name: 'Actions for Track 1' }).click(); await page.getByRole('menuitem', { name: 'Remove', exact: true }).click();
  await expect(page.locator('#edit-description')).toContainText('removes all clips'); await page.keyboard.press('Escape');
  await expect(page.locator('[data-clip=a]')).toBeVisible();
  await page.getByRole('button', { name: 'Actions for Track 1' }).click(); await page.getByRole('menuitem', { name: 'Remove', exact: true }).click();
  await page.locator('#edit-dialog button[value=confirm]').click(); await expect(page.locator('[data-clip=a]')).toHaveCount(0);
  await page.getByRole('button', { name: 'Actions for Track 2' }).click(); await expect(page.getByRole('menuitem', { name: /^Remove/ })).toHaveAttribute('aria-disabled', 'true'); await page.keyboard.press('Escape');
  for (let i = 0; i < 15; i++) await page.locator('#add-track').click();
  await expect(page.locator('.track-row')).toHaveCount(16); await expect(page.locator('#add-track')).toBeDisabled();
  await page.locator('[data-track-menu]').last().scrollIntoViewIfNeeded(); await expect(page.locator('[data-track-menu]').last()).toBeVisible();
});

test('resizing snaps to quarter cycles and rejects overlap; dragging tabs creates clips', async ({ page, request }) => {
  const p = newProject(); p.snap = .25; p.clips = [
    { id: 'a', tabId: 'pattern-1', trackId: 'track-1', start: 0, length: 1, muted: false },
    { id: 'b', tabId: 'pattern-1', trackId: 'track-1', start: 2, length: 1, muted: false },
  ]; await request.put('/api/recovery', { data: p });
  await page.goto('/'); await page.getByRole('button', { name: 'Composition', exact: true }).click();
  const handle = page.locator('[data-resize=a]'), rect = (await handle.boundingBox())!;
  await page.mouse.move(rect.x + 5, rect.y + 20); await page.mouse.down(); await page.mouse.move(rect.x + 21, rect.y + 20, { steps: 4 }); await page.mouse.up();
  await expect(page.locator('[data-clip=a]')).toHaveCSS('width', '80px');
  const clip = (await page.locator('[data-clip=a]').boundingBox())!;
  await page.mouse.move(clip.x + 12, clip.y + 20); await page.mouse.down(); await page.mouse.move(clip.x + 140, clip.y + 20, { steps: 4 });
  await expect(page.locator('.drag-ghost')).toHaveAttribute('data-invalid', 'true'); await page.mouse.up();
  await expect(page.locator('[data-clip=a]')).toHaveCSS('left', '0px');
  const tab = (await page.getByRole('tab').boundingBox())!, lane = (await page.locator('[data-track-id=track-2]').boundingBox())!;
  await page.mouse.move(tab.x + 20, tab.y + 10); await page.mouse.down(); await page.mouse.move(lane.x + 32, lane.y + 20, { steps: 10 }); await page.mouse.up();
  await expect(page.locator('[data-track-id=track-2] [data-clip]')).toHaveCount(1);
});
