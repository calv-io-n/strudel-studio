import { chromium, expect, type Page } from '@playwright/test';
import { mkdir, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

// Actual app screenshots, with virtual MIDI as a labeled demonstration fixture.
// No synthetic UI, runtime FFmpeg, personal profile, or desktop capture.
const baseURL = process.env.STUDIO_GUIDE_URL ?? 'http://127.0.0.1:5193';
const ffmpeg = process.env.FFMPEG ?? 'ffmpeg';
const output = path.resolve('studio/client/public/help');
const scratch = await mkdtemp(path.join(tmpdir(), 'strudel-input-guides-'));
await mkdir(output, { recursive: true });
const browser = await chromium.launch();
const errors: string[] = [];
async function setup() {
  const context = await browser.newContext({ viewport: { width: 1000, height: 820 }, deviceScaleFactor: 1 });
  const page = await context.newPage(); page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript({ content: 'window.__name = (fn) => fn;' });
  await page.addInitScript(() => {
    localStorage.setItem('studio.quick-start.opt-out', 'true');
    navigator.mediaDevices.getUserMedia = async () => { const context = new AudioContext(), oscillator = context.createOscillator(), destination = context.createMediaStreamDestination(); oscillator.connect(destination); oscillator.start(); await context.resume(); return destination.stream; };
    const input: any = { id: 'guide', name: 'Tutorial virtual MIDI', state: 'connected', onmidimessage: null };
    Object.defineProperty(navigator, 'requestMIDIAccess', { value: async () => ({ inputs: new Map([['guide', input]]), onstatechange: null }) });
    (window as any).guideMidi = (kind: number, number: number, value: number) => input.onmidimessage?.({ data: new Uint8Array([kind, number, value]) });
  });
  await page.goto(baseURL); await expect(page.locator('#saved-projects')).toHaveValue('Neon-Drive');
  await page.locator('#add-session').click(); await page.locator('#edit-name').fill('MIDI practice'); await page.locator('#edit-dialog button[value=confirm]').click(); await expect(page.locator('#saved-projects option:checked')).toHaveText('MIDI practice');
  await page.locator('#bpm').fill('240'); await page.locator('#bpm').press('Tab');
  const content = page.locator('.tab-editor:not([hidden]) .cm-content'); await content.focus(); await page.keyboard.press('Control+Home'); await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowDown'); await page.keyboard.press('Home'); await page.keyboard.press('Control+Shift+End');
  await page.keyboard.insertText('// Melody: click note() to choose your recording mode.\n$: note("c4 e4 g4").s("triangle").gain(slider(.3, 0, 1, .01))\n\n// Accompaniment: plays only in pattern mode.\n$: note("c2*4").s("triangle").decay(.1).sustain(0).gain(.15)');
  await page.locator('#save-now').click(); await expect(page.locator('#saved-state')).toHaveText('Saved in this browser');
  await page.locator('#palette-open').click(); await page.locator('#command-palette input').fill('MIDI & on-screen controller'); await page.keyboard.press('Enter'); await page.locator('#reconnect').click(); await page.locator('#available-ports').selectOption('Tutorial virtual MIDI [guide]'); await page.locator('#add-profile').click(); await page.keyboard.press('Escape');
  await page.locator('#count-in').click();
  // A visible pointer is the only capture overlay; all controls remain the real app.
  await page.evaluate(() => { const pointer = document.createElement('div'); pointer.style.cssText = 'position:fixed;width:14px;height:14px;border:2px solid #3869ad;border-radius:50%;pointer-events:none;z-index:99999;transform:translate(-50%,-50%)'; document.body.append(pointer); document.addEventListener('pointermove', e => { pointer.style.left = `${e.clientX}px`; pointer.style.top = `${e.clientY}px`; }); });
  return { context, page };
}
async function record(name: string, mode: 'test' | 'pattern' | 'solo' | 'slider' | 'metronome' | 'both') {
  const { context, page } = await setup();
  const frames: Buffer[] = [];
  const crop = { x: 0, y: 0, width: 1000, height: 570 };
  const capture = async () => { frames.push(await page.screenshot({ type: 'jpeg', quality: 90, clip: crop })); };
  const hold = async (ms = 800) => { const end = Date.now() + ms; do { await capture(); await page.waitForTimeout(70); } while (Date.now() < end); };
  const click = async (selector: ReturnType<Page['locator']>) => { const rect = (await selector.boundingBox())!; await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2); await hold(300); await selector.click(); await hold(); };
  await page.screenshot({ path: `${scratch}/${name}-layout.png` });
  if (mode === 'metronome') {
    await hold(); await click(page.locator('#count-in')); await expect(page.locator('#metronome-loop')).toBeVisible();
    await page.screenshot({ path: `${output}/${name}.png`, clip: crop });
    await click(page.locator('#play')); await hold(2600); await click(page.locator('#stop')); await click(page.locator('#count-in')); await expect(page.locator('#count-in')).toHaveAttribute('data-mode', 'off'); await hold();
  } else if (mode === 'slider') {
    await click(page.locator('.tab-editor:not([hidden]) [data-input-function=slider]').first());
    await page.screenshot({ path: `${output}/${name}.png`, clip: crop });
    await click(page.getByRole('menuitem', { name: 'Bind MIDI control', exact: true }));
    await page.evaluate(() => (window as any).guideMidi(176, 20, 38)); await hold(650);
    for (const value of [0, 30, 65, 100, 127, 80, 40]) { await page.evaluate(value => (window as any).guideMidi(176, 20, value), value); await hold(350); }
    await expect(page.locator('.tab-editor:not([hidden]) [data-input-function=slider]').first()).toHaveClass(/input-assigned/);
  } else {
    await click(page.locator('.tab-editor:not([hidden]) [data-input-function=note]').first());
    await page.screenshot({ path: `${output}/${name}.png`, clip: crop });
    await click(page.getByRole('menuitem', { name: mode === 'test' ? 'Test MIDI' : mode === 'pattern' ? 'Record MIDI on pattern' : 'Record MIDI solo', exact: true }));
    if (mode !== 'test') {
      if (mode !== 'both') await click(page.locator('[data-capture=audio]'));
      else await page.screenshot({ path: `${output}/${name}.png`, clip: crop });
      await click(page.locator('#record-toggle'));
      while (await page.locator('#count-in-beat').textContent()) await hold(100);
      await expect(page.locator('.pending-code').first()).toContainText('Recording');
    }
    for (const pitch of [60, 64, 67]) { await page.evaluate(pitch => (window as any).guideMidi(144, pitch, 100), pitch); await hold(250); await page.evaluate(pitch => (window as any).guideMidi(128, pitch, 0), pitch); await hold(200); }
    await click(page.locator('#stop'));
    if (mode !== 'test') { if (mode === 'both') { await expect(page.locator('#record-retry')).toHaveText('Keep take'); await click(page.locator('#record-retry')); await expect(page.locator('#record-status')).toContainText('Audio saved in pattern'); } else { await expect(page.locator('.pending-code')).toContainText('Ready to review'); await click(page.locator('.performance-panel [data-accept]')); } await expect(page.locator('.performance-panel')).toBeHidden(); await page.screenshot({ path: `${scratch}/${name}-saved.png` }); await expect(page.locator('.tab-editor:not([hidden]) .cm-content')).toContainText('note(60)'); }
    await hold(900);
  }
  execFileSync(ffmpeg, ['-y', '-f', 'image2pipe', '-framerate', '12', '-c:v', 'mjpeg', '-i', 'pipe:0', '-c:v', 'libvpx', '-b:v', '1100k', '-pix_fmt', 'yuv420p', `${output}/${name}.webm`], { input: Buffer.concat(frames), stdio: 'pipe' });
  console.log(`PASS ${name}: ${frames.length} real app frames; crop ${JSON.stringify(crop)}`);
  await context.close();
}
try {
  for (const [name, mode] of [['record-both-browser', 'both'], ['test-midi-browser', 'test'], ['record-pattern-browser', 'pattern'], ['record-solo-browser', 'solo'], ['bind-slider-browser', 'slider'], ['metronome-modes-browser', 'metronome']] as const) { if (!process.env.STUDIO_GUIDE_ONLY || name === process.env.STUDIO_GUIDE_ONLY) await record(name, mode); }
  expect(errors).toEqual([]); console.log(`Layout screenshots: ${scratch}`);
} finally { await browser.close(); }
