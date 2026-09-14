import { chromium, expect } from '@playwright/test';
import { writeFile, readFile, mkdir } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { decodeWav } from '../studio/shared/wav';
import { installAudioCapture } from '../studio/tests/audio-capture';

// Opt-in host integration walkthrough: real network and browser device APIs, no request mocks.
const output = '/tmp/strudel-native-artifacts';
await mkdir(output, { recursive: true });
const context = await chromium.launchPersistentContext(`/tmp/strudel-native-profile-${Date.now()}`, {
  channel: 'chrome', headless: false, viewport: { width: 1440, height: 1000 },
  permissions: ['microphone', 'midi', 'midi-sysex'],
  args: ['--autoplay-policy=no-user-gesture-required'],
});
const page = context.pages()[0] ?? await context.newPage();
// tsx preserves function names with a helper inside serialized test-only audio observers.
await page.addInitScript({ content: 'window.__name = (fn) => fn;' });
await installAudioCapture(page);
const run = promisify(execFile);
const errors: string[] = [], downloads: string[] = [];
page.on('pageerror', e => errors.push(e.message));
page.on('response', r => { if (r.url().startsWith('https://raw.githubusercontent.com/')) downloads.push(`${r.status()} ${r.url()}`); });
const step = async (name: string, action: () => Promise<void>) => { console.log(`START ${name}`); await action(); console.log(`PASS ${name}`); };
const command = async (name: string) => { await page.keyboard.press('Control+k'); await page.locator('#command-palette input').fill(name); await page.keyboard.press('Enter'); };
const records = async (store: string) => page.evaluate(async store => { const db = await new Promise<IDBDatabase>(resolve => { const r = indexedDB.open('strudel-studio'); r.onsuccess = () => resolve(r.result); }); return new Promise<any[]>(resolve => { const r = db.transaction(store).objectStore(store).getAll(); r.onsuccess = () => { resolve(r.result); db.close(); }; }); }, store);
const sendMidi = async () => { await run('aplaymidi', ['-p', '14:0', `${output}/notes.mid`]); };
const audioChecks: Record<string, number> = {};
const render = async (source: string, name: string) => { await command('Export full song render'); await page.locator('#export-source').selectOption(source); if (source === 'tab') await page.locator('#export-cycles').fill('2'); await page.locator('#export-tail').fill('0'); await page.locator('#export-format').selectOption('float32'); await page.locator('#export-code').selectOption('draft'); const download = page.waitForEvent('download'); await page.locator('#render-audio').click(); const file = await download; await file.saveAs(`${output}/${name}.wav`); const wav = decodeWav(await readFile(`${output}/${name}.wav`)); audioChecks[name] = wav.left.reduce((p, n) => Math.max(p, Math.abs(n)), 0); expect(audioChecks[name]).toBeGreaterThan(.000001); await page.keyboard.press('Escape'); };
try {
  // Three real MIDI notes sent through ALSA, then received by Chrome's Web MIDI input.
  const track = Buffer.from('00ff510307a12000903c6460803c000090406460804000009043646080430000ff2f00', 'hex');
  const header = Buffer.from('4d546864000000060000000100604d54726b00000000', 'hex'); header.writeUInt32BE(track.length, 18); await writeFile(`${output}/notes.mid`, Buffer.concat([header, track]));
  await page.addInitScript(() => localStorage.setItem('studio.quick-start.opt-out', 'true'));
  await page.goto(process.env.STUDIO_VERIFY_URL ?? 'http://127.0.0.1:5193'); await expect(page.locator('#saved-projects')).not.toHaveValue('');
  const devices = await page.evaluate(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const audio = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'audioinput').map(d => ({ label: d.label, deviceId: d.deviceId }));
    stream.getTracks().forEach(t => t.stop());
    try { const midi = await navigator.requestMIDIAccess(); return { audio, midi: [...midi.inputs.values()].map(d => ({ id: d.id, name: d.name, state: d.state })) }; } catch (error) { return { audio, midiError: String(error) }; }
  });
  console.log(JSON.stringify(devices, null, 2));
  await page.keyboard.press('Control+k'); await page.locator('#command-palette input').fill('Open Sample Catalogue'); await page.keyboard.press('Enter');
  await page.getByRole('button', { name: /^(Install|Reinstall) pack$/ }).click();
  await expect(page.locator('#catalogue-packs')).toContainText('Installed in this browser', { timeout: 60000 });
  await page.screenshot({ path: `${output}/external-pack-installed.png` });
  console.log('External pack installed', downloads);
  await page.locator('#sounds-close').click();
  await step('External samples render', async () => { await page.locator('#saved-projects').selectOption('Drum-Basics'); await render('composition', 'external-samples'); });
  const name = `Native inputs ${Date.now()}`; await page.locator('#add-session').click(); await page.locator('#edit-name').fill(name); await page.locator('#edit-dialog button[value=confirm]').click(); await expect(page.locator('#project-name')).toHaveValue(name);
  await expect(page.locator('#saved-projects')).not.toHaveValue('Drum-Basics');
  const session = await page.locator('#saved-projects').inputValue(); console.log('Verification session', session);
  await command('MIDI & on-screen controller'); await page.locator('#reconnect').click();
  await expect(page.locator('#available-ports')).toContainText('Midi Through');
  const midiPort = await page.locator('#available-ports option').filter({ hasText: 'Midi Through' }).first().textContent(); await page.locator('#available-ports').selectOption(midiPort!); await page.locator('#add-profile').click(); await expect(page.locator('.device-connection')).toContainText('Connected'); await page.keyboard.press('Escape');
  await step('Native MIDI to pattern', async () => {
    await page.locator('.tab-editor:not([hidden]) [data-input-function=note]').first().click(); await page.getByRole('menuitem', { name: 'Record MIDI solo', exact: true }).click();
    await page.locator('#record-toggle').click(); await expect(page.locator('.pending-code')).toContainText('Recording'); await sendMidi();
    await page.locator('#stop').click(); await expect(page.locator('.performance-panel [data-state]')).toContainText('3 notes'); await page.locator('.performance-panel [data-accept]').click(); await expect(page.locator('.performance-panel')).toBeHidden();
    await page.keyboard.press('Escape'); await render('tab', 'midi-pattern');
  });
  await page.getByRole('tab', { name: 'Pattern 1', exact: true }).click({ button: 'right' }); await page.getByRole('menuitem', { name: 'Add to composition', exact: true }).click(); await page.locator('#clip-dialog button[value=save]').click();
  await step('Native MIDI with pattern accompaniment updates its composition source', async () => {
    await page.locator('.tab-editor:not([hidden]) [data-input-function=note]').last().click(); await page.getByRole('menuitem', { name: 'Record MIDI on pattern', exact: true }).click();
    await page.locator('#record-toggle').click(); await expect(page.locator('.pending-code')).toContainText('Recording'); await sendMidi(); await page.locator('#stop').click();
    await page.locator('.performance-panel [data-accept]').click(); await expect(page.locator('.performance-panel')).toBeHidden();
    await render('composition', 'midi-composition');
  });
  await step('Native microphone to audio pattern and composition', async () => {
    await page.locator('#seek-handle').focus(); await page.keyboard.press('Home');
    if (!await page.locator('#record-bar').isVisible()) await page.locator('#record-toggle').click(); await page.locator('[data-capture=audio]').click(); await page.locator('#record-track').selectOption({ label: 'Track 2' });
    await page.locator('#record-toggle').click(); await expect(page.locator('#record-status')).toContainText('Recording', { timeout: 15000 }); console.log('Microphone recording now: make a brief test sound during the next 10 seconds.'); await page.waitForTimeout(10000); await page.locator('#record-toggle').click(); await expect(page.locator('#record-status')).toContainText('saved to the timeline', { timeout: 15000 });
    await page.locator('#save-now').click(); await expect(page.locator('#saved-state')).toHaveText('Saved in this browser');
    const project = (await records('projects')).find(p => p.sessionId === session), take = project.tabs.find((t: any) => t.audioAssetId);
    expect(take).toBeTruthy(); expect(project.clips.some((c: any) => c.takeId === take.audioAssetId)).toBe(true);
    await page.evaluate(() => window.neonCapture.start()); await page.locator('#take-play').click(); await page.waitForTimeout(10500); await page.locator('#take-stop').click(); audioChecks['microphone-tab-preview'] = (await page.evaluate(() => window.neonCapture.finish())).peak;
    await page.getByRole('button', { name: 'Solo Track 2', exact: true }).click(); await render('composition', 'microphone-composition');
    expect(audioChecks['microphone-tab-preview']).toBeGreaterThan(.000001);
    await page.getByRole('button', { name: 'Clear solo for Track 2', exact: true }).click();
  });
  await page.locator('#save-now').click(); await expect(page.locator('#saved-state')).toHaveText('Saved in this browser'); await page.reload(); await expect(page.locator('#saved-projects')).toHaveValue(session);
  await page.screenshot({ path: `${output}/completed-native-session.png` });
  const backup = page.waitForEvent('download'); await command('Download project backup'); await (await backup).saveAs(`${output}/native-input-session.studio.zip`);
  await writeFile(`${output}/native-probe.json`, JSON.stringify({ devices, downloads, audioChecks, session, project: (await records('projects')).find(p => p.sessionId === session), errors }, null, 2));
  expect(errors).toEqual([]);
} catch (error) { console.error(error); await writeFile(`${output}/failure-projects.json`, JSON.stringify({ selected: await page.locator('#saved-projects').inputValue().catch(() => ''), projects: await records('projects').catch(() => []) }, null, 2)); await page.screenshot({ path: `${output}/failure.png` }).catch(() => {}); throw error; } finally { await context.close(); }
