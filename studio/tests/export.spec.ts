import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { createNeonDrive } from '../server/demo';
import { newProject } from '../shared/model';

test('Export renders the full layered song and effects to WAV while playback stays usable', async ({ page, request }) => {
  const project = await createNeonDrive();
  await request.put('/api/recovery', { data: project });
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  page.on('console', message => { if (message.text().includes('cannot schedule sounds in the past')) errors.push(message.text()); });
  await page.goto('/'); await expect(page.locator('#connection')).toHaveText('Studio connected');
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  await expect(page.locator('#export-source')).toHaveValue('composition');
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Render & download WAV' }).click();
  const download = await downloaded;
  expect(download.suggestedFilename()).toBe('Neon-Drive.wav');
  const wav = await readFile((await download.path())!);
  expect(wav.toString('ascii', 0, 4)).toBe('RIFF');
  expect(wav.readUInt16LE(22)).toBe(2); expect(wav.readUInt32LE(24)).toBe(44100);
  const seconds = (wav.length - 44) / 4 / 44100;
  expect(seconds).toBeCloseTo(32 * 240 / 168 + 3, 3);
  for (const second of [1, 8, 25, 40, 45.8]) {
    let peak = 0;
    for (let frame = Math.floor(second * 44100); frame < Math.floor((second + 0.2) * 44100); frame++) peak = Math.max(peak, Math.abs(wav.readInt16LE(44 + frame * 4)));
    expect(peak, `audio at ${second}s`).toBeGreaterThan(3);
  }
  await expect(page.locator('#export-status')).toContainText('Rendered 48.7 seconds');
  await expect(page.locator('#transport-state')).toContainText('Playing');
  await page.getByRole('button', { name: 'Stop', exact: true }).click();
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(page.locator('#transport-state')).toContainText('Playing');
  await page.getByRole('button', { name: 'Stop', exact: true }).click();
  expect(errors).toEqual([]);
});

test('Export supports current-tab length, cancel, invalid code and an empty composition', async ({ page, request }) => {
  const project = newProject(); project.tabs[0].code = '$: note("a3").s("triangle").room(0.3).gain(0.2)';
  await request.put('/api/recovery', { data: project });
  await page.goto('/'); await expect(page.locator('#connection')).toHaveText('Studio connected');
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  await expect(page.locator('#export-source')).toHaveValue('tab');
  await page.locator('#export-cycles').fill('1'); await page.locator('#export-tail').fill('0.5');
  const downloadEvent = page.waitForEvent('download');
  await page.locator('#render-audio').click();
  const file = await readFile((await (await downloadEvent).path())!);
  expect((file.length - 44) / 4 / 44100).toBeCloseTo(2.5, 3);
  await page.locator('#render-audio').click(); await page.locator('#cancel-export').click();
  await expect(page.locator('#export-status')).toHaveText('Export cancelled.');
  await expect(page.locator('iframe')).toHaveCount(0);
  await page.locator('#export-source').selectOption('composition'); await page.locator('#render-audio').click();
  await expect(page.locator('#export-status')).toContainText('Add patterns to Composition');
  await page.locator('#export-source').selectOption('tab');
  await page.locator('.cm-content').click(); await page.keyboard.press('Control+a'); await page.keyboard.insertText('this is invalid !');
  await page.locator('#render-audio').click();
  await expect(page.locator('#export-status')).toContainText('Export failed:');
  await expect(page.locator('#render-audio')).toBeEnabled();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('button', { name: 'Export', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('Export includes saved sample slots without requiring a preview', async ({ page, request }) => {
  const job = await (await request.post('/api/generations', { data: { prompt: 'export fixture', duration: 0.5, loop: false } })).json();
  await expect.poll(async () => (await (await request.get(`/api/generations/${job.id}`)).json()).state).toBe('complete');
  const { asset } = await (await request.get(`/api/generations/${job.id}`)).json();
  const project = newProject();
  project.tabs[0].code = '$: s(soundSlot("impact")).gain(0.2)';
  project.slots = [{ name: 'impact', active: asset.id, assets: [asset.id] }];
  await request.put('/api/recovery', { data: project });
  await page.goto('/'); await expect(page.locator('#connection')).toHaveText('Studio connected');
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  await page.locator('#export-cycles').fill('1');
  const event = page.waitForEvent('download'); await page.locator('#render-audio').click();
  const wav = await readFile((await (await event).path())!);
  let peak = 0;
  for (let offset = 44; offset < wav.length; offset += 2) peak = Math.max(peak, Math.abs(wav.readInt16LE(offset)));
  expect(peak).toBeGreaterThan(100);
  await expect(page.locator('#export-status')).toContainText('Rendered');
});

test('muted tracks and clips export silence while retaining fractional arrangement duration', async ({ page, request }) => {
  const p = newProject(); p.bpm = 240; p.tabs[0].code = '$: note("c3*4").s("triangle").gain(.2)'; p.tracks[0].muted = true;
  p.clips = [
    { id: 'track-muted', tabId: 'pattern-1', trackId: 'track-1', start: 0, length: .75, muted: false },
    { id: 'clip-muted', tabId: 'pattern-1', trackId: 'track-2', start: .25, length: 1, muted: true },
  ];
  await request.put('/api/recovery', { data: p }); await page.goto('/');
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  await page.locator('#export-tail').fill('0');
  const downloaded = page.waitForEvent('download'); await page.getByRole('button', { name: 'Render & download WAV' }).click();
  const wav = await readFile((await (await downloaded).path())!);
  expect((wav.length - 44) / 4 / 44100).toBeCloseTo(1.25, 4);
  expect(wav.subarray(44).every(byte => byte === 0)).toBe(true);
});

test('solo export excludes other tracks while keeping the full arrangement duration', async ({ page, request }) => {
  const p = newProject(); p.bpm = 240; p.soloTrackId = 'track-2';
  p.tabs[0].code = '$: note("c3*4").s("triangle").gain(.2)';
  p.clips = [{ id: 'excluded', tabId: 'pattern-1', trackId: 'track-1', start: 0, length: 1.25, muted: false }];
  await request.put('/api/recovery', { data: p }); await page.goto('/');
  await page.getByRole('button', { name: 'Export', exact: true }).click(); await page.locator('#export-tail').fill('0');
  const downloaded = page.waitForEvent('download'); await page.getByRole('button', { name: 'Render & download WAV' }).click();
  const wav = await readFile((await (await downloaded).path())!);
  expect((wav.length - 44) / 4 / 44100).toBeCloseTo(1.25, 4);
  expect(wav.subarray(44).every(byte => byte === 0)).toBe(true);
});
