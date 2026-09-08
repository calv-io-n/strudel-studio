import { openController } from './helpers/controller';
import { test, expect } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { createNeonDrive } from '../server/demo';
import { newProject } from '../shared/model';
import { installAudioCapture } from './audio-capture';

test('Neon Drive plays every tab, renders its complete arrangement, and restores live mappings', async ({ page, request }, testInfo) => {
  test.setTimeout(120_000);
  const project = await createNeonDrive();
  expect((await request.put('/api/projects/Neon-Drive', { data: project })).ok()).toBe(true);
  await request.put('/api/recovery', { data: newProject() });
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(`${message.text()} (${message.location().url})`); });
  page.on('response', response => { if (response.status() >= 400) console.log(`HTTP ${response.status()} ${response.url()}`); });
  await installAudioCapture(page);
  await page.goto('/'); await expect(page.locator('#connection')).toHaveText('Studio connected');
  await expect(page.locator('.topbar').getByLabel('Sessions')).toBeVisible();
  await page.getByLabel('Sessions', { exact: true }).selectOption('Neon-Drive');
  await expect(page.getByRole('tab', { name: 'Lead', exact: true })).toBeVisible();
  await expect(page.getByRole('tab')).toHaveCount(4);

  for (const name of ['Rhythm', 'Chords', 'Lead', 'Breakdown']) {
    await page.getByRole('tab', { name, exact: true }).click();
    await page.evaluate(() => window.neonCapture.start());
    await page.getByRole('button', { name: 'Play pattern', exact: true }).click();
    await expect(page.locator('#transport-state')).toHaveText(`Playing · ${name}`);
    await expect.poll(() => page.evaluate(() => window.neonCapture.frames / window.neonCapture.rate)).toBeGreaterThan(.8);
    const audio = await page.evaluate(() => window.neonCapture.finish());
    expect(audio.peak, `${name} must produce audio`).toBeGreaterThan(.005);
    expect(audio.clipped, `${name} should not clip`).toBe(0);
    await page.getByRole('button', { name: 'Stop playback', exact: true }).click();
  }

  if (await page.locator('#composition-content').isHidden()) await page.getByRole('button', { name: 'Composition', exact: true }).click();
  await expect(page.locator('.clip')).toHaveCount(6);

  await page.evaluate(() => window.neonCapture.start());
  await page.locator('#composition-play').click();
  await expect(page.locator('#transport-state')).toHaveText('Playing · Composition');
  // Wait for real musical time, not an accelerated test clock.
  for (const cycle of [4.5, 16.5, 20.5, 31]) {
    await expect.poll(async () => Number((await page.locator('#cycle').innerText()).replace('Cycle ', '')), { timeout: 22_000, intervals: [250] }).toBeGreaterThan(cycle);
  }
  await expect(page.locator('#transport-state')).toHaveText('Stopped', { timeout: 6000 });
  const audio = await page.evaluate(() => window.neonCapture.finish());
  const wavPath = testInfo.outputPath('neon-drive.wav'), levelsPath = testInfo.outputPath('neon-drive-levels.json');
  await writeFile(wavPath, Buffer.from(audio.wav, 'base64'));
  const { wav: _wav, ...levels } = audio;
  await writeFile(levelsPath, JSON.stringify(levels, null, 2));
  await testInfo.attach('Neon Drive complete audio', { path: wavPath, contentType: 'audio/wav' });
  await testInfo.attach('Neon Drive audio levels', { path: levelsPath, contentType: 'application/json' });
  expect(audio.seconds).toBeGreaterThan(45); expect(audio.seconds).toBeLessThan(49);
  expect(audio.peak).toBeGreaterThan(.05); expect(audio.clipped).toBe(0);
  const rms = (start: number, end: number) => audio.bins.slice(start, end).reduce((sum, b) => sum + b.rms, 0) / (end - start);
  expect(rms(1, 4)).toBeGreaterThan(.003);
  expect(rms(8, 19)).toBeGreaterThan(rms(1, 4));
  expect(rms(24, 27)).toBeGreaterThan(.003);
  expect(rms(31, 42)).toBeGreaterThan(rms(24, 27));
  await page.screenshot({ path: testInfo.outputPath('neon-drive-arrangement.png'), fullPage: true });

  // The pre-mapped lead knob must address a hidden editor and remain a live control.
  await page.getByRole('tab', { name: 'Chords', exact: true }).click();
  await openController(page);
  await page.getByRole('button', { name: 'Composition', exact: true }).click(); await page.locator('#composition-play').click(); await openController(page);
  await page.getByRole('slider', { name: 'Lead brightness', exact: true }).fill('100');
  await expect(page.locator('#last-receipt')).toContainText('applied');
  await page.getByRole('tab', { name: 'Lead', exact: true }).click();
  await expect(page.getByRole('slider', { name: 'lpf inline slider', exact: true })).toHaveValue('4800');
  await expect(page.locator('#evaluate')).toBeHidden();
  await page.locator('.tab-editor:not([hidden]) .cm-content').focus();
  await page.keyboard.press('Control+Home'); await page.keyboard.insertText('// verified draft\n');
  await expect(page.locator('#evaluate')).toBeVisible();
  await page.getByRole('button', { name: 'Apply changes', exact: false }).click();
  await expect(page.locator('#evaluate')).toBeHidden();
  await expect(page.locator('#transport-state')).toContainText('Playing');
  await page.getByRole('button', { name: 'Stop playback', exact: true }).click();
  await page.getByLabel('Project name').fill('Neon Drive verified');
  await page.locator('.project-menu > summary').click();
  await page.getByRole('button', { name: 'Save project', exact: true }).click();
  await expect(page.locator('#notice')).toContainText('Saved Neon Drive verified');
  const savedId = await page.getByLabel('Sessions', { exact: true }).inputValue();
  const saved = await (await request.get(`/api/projects/${savedId}`)).json();
  expect(saved.name).toBe('Neon Drive verified');
  expect(saved.clips).toEqual(project.clips); expect(saved.bindings).toEqual(project.bindings);
  expect(saved.tabs.find((tab: { id: string }) => tab.id === 'neon-lead').code).toContain('// verified draft');
  await page.reload(); await expect(page.locator('#connection')).toHaveText('Studio connected');
  await page.getByLabel('Sessions', { exact: true }).selectOption(savedId);
  await expect(page.locator('.tab-editor:not([hidden]) .cm-content')).toContainText('// verified draft');
  await page.getByRole('slider', { name: 'Lead brightness', exact: true }).fill('0');
  await expect(page.getByRole('slider', { name: 'lpf inline slider', exact: true })).toHaveValue('400');
  expect(errors).toEqual([]);
});

test('Sessions beside Strudel discovers newly saved sessions without a reload', async ({ page, request }) => {
  await page.goto('/'); await expect(page.locator('#connection')).toHaveText('Studio connected');
  const select = page.getByLabel('Sessions', { exact: true });
  const brand = await page.getByRole('link', { name: 'Strudel Studio' }).boundingBox();
  const picker = await select.boundingBox();
  expect(picker!.x).toBeGreaterThan(brand!.x + brand!.width);
  expect(Math.abs(picker!.y - brand!.y)).toBeLessThan(20);
  const name = `Late-session-${Date.now()}`;
  await request.put(`/api/projects/${name}`, { data: { ...newProject(), name: 'Late session' } });
  await select.focus();
  await expect(select.locator(`option[value="${name}"]`)).toHaveCount(1);
  await select.selectOption(name);
  await expect(page.getByLabel('Project name')).toHaveValue('Late session');
  await expect(page.locator('.project-menu')).not.toHaveAttribute('open', '');
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(select).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
