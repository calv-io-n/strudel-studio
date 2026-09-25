import { test, expect, type Page } from '@playwright/test';

async function boot(page: Page, names = ['Keys']) {
  await page.addInitScript(names => {
    localStorage.setItem('studio.quick-start.opt-out', 'true');
    const inputs = new Map(names.map((name, i) => [String(i), { id:String(i), name, state:'connected', onmidimessage:null as any }]));
    const access:any = { inputs, onstatechange:null };
    const fixture = (window as any).midiFixture = {
      calls:0, denied:false, cc:() => inputs.get('0')?.onmidimessage?.({data:new Uint8Array([176,20,80])}),
      note: (pitch = 67, on = true) => inputs.get('0')?.onmidimessage?.({ data:new Uint8Array([on ? 144 : 128, pitch, on ? 100 : 0]) }),
      plug: (connected:boolean) => { if (!inputs.size) inputs.set('0', {id:'0', name:'Keys',state:'connected',onmidimessage:null}); inputs.get('0')!.state = connected ? 'connected' : 'disconnected'; access.onstatechange?.(); },
    };
    Object.defineProperty(navigator, 'requestMIDIAccess', { configurable:true, value:async () => { fixture.calls++; if (fixture.denied) throw new DOMException('denied','NotAllowedError'); return access; } });
    Object.defineProperty(navigator, 'permissions', { configurable:true, value:{ query:async () => ({state:'granted'}) } });
    navigator.mediaDevices.getUserMedia = async () => { const context = new AudioContext(), source = context.createOscillator(), output = context.createMediaStreamDestination(); source.connect(output); source.start(); await context.resume(); return output.stream; };
  }, names);
  await page.goto('/'); await expect(page.locator('#saved-projects')).toHaveValue('Neon-Drive');
}
async function recordBar(page: Page) { await page.locator('[data-play-target=tab]').click(); await page.locator('#record-toggle').click(); await page.locator('[data-capture=midi]').click(); }
async function editor(page:Page) { await page.getByRole('tab',{name:'MIDI instrument',exact:true}).click(); }

test('connect once beside recording; instrument, settings and hotplug share the connection', async ({page}) => {
  await boot(page); await recordBar(page);
  const record = page.locator('#record-midi-connection'); await record.locator('[data-midi-enable]').click();
  await expect(record.locator('[data-midi-status]')).toHaveText('MIDI · Keys');
  expect(await page.evaluate(() => (window as any).midiFixture.calls)).toBe(1);
  await page.evaluate(() => (window as any).midiFixture.note()); await expect(record.locator('[data-midi-activity]')).toContainText('Note 67');
  await editor(page); const instrument = page.locator('#midi-editor-connection'); await expect(instrument).toBeVisible(); await expect(record).toBeHidden();
  await expect(instrument.locator('[data-midi-status]')).toHaveText('MIDI · Keys');
  await page.evaluate(() => (window as any).midiFixture.plug(false)); await expect(instrument.locator('[data-midi-status]')).toContainText('Waiting for Keys');
  await page.evaluate(() => (window as any).midiFixture.plug(true)); await expect(instrument.locator('[data-midi-status]')).toHaveText('MIDI · Keys');
  await instrument.locator('[data-midi-screen]').click(); await expect(page.locator('#midi-settings-connection [data-midi-status]')).toHaveText('MIDI · Keys');
  expect(await page.evaluate(() => (window as any).midiFixture.calls)).toBe(1);
  await page.keyboard.press('Escape'); await page.locator('#save-now').click(); await page.reload(); await editor(page);
  await expect(page.locator('#midi-editor-connection [data-midi-status]')).toHaveText('MIDI · Keys');
});

test('multiple inputs connect directly from the same chooser without a second Connect step', async ({page}) => {
  await boot(page, ['Keys','Pads']); await editor(page); const root = page.locator('#midi-editor-connection');
  await root.locator('[data-midi-enable]').click(); await expect(root.locator('[data-midi-status]')).toHaveText('Choose your MIDI input.');
  await root.getByRole('checkbox',{name:'Keys Connect',exact:true}).check(); await expect(root.locator('[data-midi-status]')).toHaveText('MIDI · Keys');
  await root.getByRole('checkbox',{name:'Pads Connect',exact:true}).check(); await expect(root.locator('[data-midi-status]')).toHaveText('MIDI · Keys, Pads');
  await root.getByRole('checkbox',{name:'Keys Connected',exact:true}).uncheck(); await expect(root.locator('[data-midi-status]')).toHaveText('MIDI · Pads');
  await root.getByRole('checkbox',{name:'Pads Connected',exact:true}).uncheck(); await expect(root.locator('[data-midi-status]')).toHaveText('Choose your MIDI input.');
  expect(await page.evaluate(() => (window as any).midiFixture.calls)).toBe(1);
});

test('permission errors retry inline, and plugging in after Connect completes the same flow', async ({page}) => {
  await boot(page, []); await editor(page); const root = page.locator('#midi-editor-connection');
  await page.evaluate(() => (window as any).midiFixture.denied = true); await root.locator('[data-midi-enable]').click(); await expect(root.locator('[data-midi-status]')).toContainText('permission was denied');
  await page.evaluate(() => (window as any).midiFixture.denied = false); await root.locator('[data-midi-enable]').click(); await expect(root.locator('[data-midi-status]')).toContainText('Plug in your MIDI keyboard');
  await page.evaluate(() => (window as any).midiFixture.plug(true)); await expect(root.locator('[data-midi-status]')).toHaveText('MIDI · Keys');
  expect(await page.evaluate(() => (window as any).midiFixture.calls)).toBe(2);
});

test('on-screen keys stay available without asking for MIDI permission', async ({page}) => {
  await boot(page); await recordBar(page); await page.locator('#record-midi-connection [data-midi-screen]').click();
  await expect(page.locator('#controls .keys')).toBeVisible(); expect(await page.evaluate(() => (window as any).midiFixture.calls)).toBe(0);
  await page.locator('#controls .keys button').first().click(); await expect(page.locator('#device-activity')).not.toContainText('denied');
});

test('recording shows status then resolves to highlighted review code', async ({page}) => {
  await boot(page); await page.getByRole('tab',{name:'Lead',exact:true}).click(); await recordBar(page); await page.locator('#record-midi-connection [data-midi-enable]').click();
  await page.locator('#record-toggle').click(); await expect(page.locator('#record-toggle')).toHaveText('Stop');
  const ghosts = page.locator('.tab-editor:not([hidden]) .pending-code');
  await expect(ghosts).toHaveCount(2); await expect(ghosts.first()).toHaveAttribute('aria-busy','true');
  await expect(ghosts.first()).toContainText('Recording'); await expect(ghosts.locator('.code-placeholder')).toHaveCount(0);
  await page.evaluate(() => (window as any).midiFixture.note()); await page.waitForTimeout(220); await page.evaluate(() => (window as any).midiFixture.note(67,false));
  await expect(ghosts.filter({hasText:'note(67)'})).toHaveCount(0);
  await ghosts.last().scrollIntoViewIfNeeded(); await page.screenshot({path:'/tmp/native-code-forming.png'});
  await page.locator('#stop').click(); await expect(page.locator('#record-retry')).toHaveText('Keep take');
  await expect(ghosts.locator('.code-placeholder')).toHaveCount(0); await expect(page.locator('.creating-code')).toHaveCount(0);
  const style = await ghosts.first().evaluate(el => {const a=getComputedStyle(el), b=getComputedStyle(el.closest('.cm-content')!);return [a.fontFamily,a.fontSize,b.fontFamily,b.fontSize];});
  expect(style.slice(0,2)).toEqual(style.slice(2)); expect(await ghosts.first().locator('span[class]').count()).toBeGreaterThan(2);
  await page.screenshot({path:'/tmp/native-code-review.png'});
  const token = ghosts.first().locator('span').filter({hasText:/^67$/}).first();
  const lightColor = await token.evaluate(el => getComputedStyle(el).color);
  await page.locator('#dark-mode').check(); await expect.poll(() => token.evaluate(el => getComputedStyle(el).color)).not.toBe(lightColor);
  await page.screenshot({path:'/tmp/native-code-review-dark.png'}); await page.locator('#dark-mode').uncheck();
  await page.setViewportSize({width:640,height:900}); await ghosts.last().scrollIntoViewIfNeeded(); await ghosts.last().evaluate(el => { el.closest('.cm-scroller')!.scrollLeft = 0; }); await page.screenshot({path:'/tmp/native-code-review-narrow.png'});
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const previewBounds = await page.locator('#record-preview').boundingBox(), closeBounds = await page.locator('#record-close').boundingBox();
  expect(Math.abs(previewBounds!.y - closeBounds!.y)).toBeLessThan(5);
  await page.locator('#record-retry').click(); await expect(ghosts).toHaveCount(0);
});

test('reduced motion keeps the creating-code placeholders still', async ({page}) => {
  await page.emulateMedia({reducedMotion:'reduce'}); await boot(page); await recordBar(page); await page.locator('#record-toggle').click();
  await expect(page.locator('.pending-code').first()).toBeVisible(); await expect(page.locator('.code-placeholder')).toHaveCount(0); await page.locator('#stop').click();
});


test('phrase testing and knob binding offer connection at the point of use', async ({page}) => {
  await boot(page); await page.getByRole('tab',{name:'Lead',exact:true}).click(); await page.locator('[data-play-target=tab]').click(); await page.locator('#record-toggle').click();
  await page.locator('.tab-editor:not([hidden]) [data-input-function=note]').first().click(); await page.getByRole('menuitem',{name:'Test MIDI',exact:true}).click();
  await expect(page.locator('#midi-editor-connection [data-midi-enable]')).toBeVisible(); await page.locator('#stop').click();
  const slider = page.locator('.tab-editor:not([hidden]) [data-input-function=slider]').first(); await slider.click(); await page.getByRole('menuitem',{name:'Bind MIDI control',exact:true}).click();
  await page.locator('#midi-learning [data-midi-enable]').click(); await expect(page.locator('#midi-learning [data-midi-status]')).toHaveText('MIDI · Keys');
  await page.evaluate(() => (window as any).midiFixture.cc()); await expect(page.locator('#midi-learning')).toBeHidden(); await expect(slider).toHaveClass(/input-assigned/);
});

test('sound preview connects MIDI in the catalogue without navigating away', async ({page}) => {
  await boot(page); await page.locator('#palette-open').click(); await page.locator('#command-palette input').fill('Open Sample Catalogue'); await page.keyboard.press('Enter');
  await page.locator('[data-live-sound="triangle"]').click(); await page.locator('#library-midi-connection [data-midi-enable]').click();
  await expect(page.locator('#sounds-panel')).toBeVisible(); await expect(page.locator('#library-midi-connection [data-midi-status]')).toHaveText('MIDI · Keys');
  await page.evaluate(() => (window as any).midiFixture.note()); await expect(page.locator('#library-midi-status')).toContainText('MIDI 67');
  await page.locator('#library-midi-connection [data-midi-screen]').click(); await expect(page.locator('#library-keys button').first()).toBeFocused();
});
