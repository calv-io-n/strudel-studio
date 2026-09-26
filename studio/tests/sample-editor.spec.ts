import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { encodeWav, decodeWav } from '../shared/wav';
import { installAudioCapture } from './audio-capture';

const rate = 48000;
const left = Float32Array.from({ length: rate * 2 }, (_, i) => Math.sin(i * 2 * Math.PI * 220 / rate) * .2);
const right = Float32Array.from(left, sample => -sample / 2);
const wave = Buffer.from(encodeWav(left, right, rate, { format: 'float32' }).buffer);
const editor = '#sample-editor-page';
async function records(page: Page, store: string) {
  return page.evaluate(async store => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => { const r = indexedDB.open('strudel-studio'); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
    return new Promise<any[]>((resolve, reject) => { const r = db.transaction(store).objectStore(store).getAll(); r.onsuccess = () => { resolve(r.result); db.close(); }; r.onerror = () => reject(r.error); });
  }, store);
}
async function open(page: Page) {
  await page.goto('/#/samples/edit'); await expect(page.locator('#saved-projects')).toHaveValue('Neon-Drive');
  await page.locator(`${editor} [data-wav-file]`).setInputFiles({ name: 'Stereo.wav', mimeType: 'audio/wav', buffer: wave });
  await expect(page.locator(`${editor} [data-wav-title]`)).toHaveText('Stereo.wav');
}
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('studio.quick-start.opt-out', 'true'));
  await installAudioCapture(page);
});
test('extract, audition, download, insert and reopen a saved sample without changing its source', async ({ page }, testInfo) => {
  const errors: string[] = [], forbidden: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (new URL(request.url()).pathname.startsWith('/api/') || new URL(request.url()).origin !== new URL(testInfo.project.use.baseURL!).origin) forbidden.push(request.url()); });
  await open(page);
  await page.locator(editor).getByLabel('Start (seconds)', { exact: true }).fill('0.25'); await page.locator(editor).getByLabel('End (seconds)', { exact: true }).fill('0.75');
  await page.locator(editor).getByLabel('Sample name', { exact: true }).fill('My chop');
  await page.evaluate(() => window.neonCapture.start());
  await page.getByRole('button', { name: 'Play selection', exact: true }).click();
  await expect(page.locator(`${editor} [data-wav-play]`)).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator(`${editor} [data-wav-play]`)).toHaveAttribute('aria-pressed', 'false');
  expect((await page.evaluate(() => window.neonCapture.finish())).peak).toBeGreaterThan(.05);
  const downloading = page.waitForEvent('download'); await page.getByRole('button', { name: 'Download WAV', exact: true }).click();
  const download = await downloading; expect(download.suggestedFilename()).toBe('My chop.wav');
  const decoded = decodeWav(new Uint8Array(await readFile((await download.path())!)));
  expect(decoded.rate).toBe(rate); expect(decoded.channels).toBe(2);
  expect([...decoded.left]).toEqual([...left.slice(rate / 4, rate * .75)]); expect([...decoded.right]).toEqual([...right.slice(rate / 4, rate * .75)]);
  await page.getByRole('button', { name: 'Save sample', exact: true }).click();
  await expect(page.locator(`${editor} [data-wav-status]`)).toContainText('Saved');
  const first = (await records(page, 'assets')).find(a => a.label === 'My chop');
  expect(first.extraction.startFrame).toBe(12000); expect(first.extraction.endFrame).toBe(36000);
  await page.screenshot({ path: testInfo.outputPath('wav-editor.png') });
  await page.getByRole('button', { name: 'Save and insert', exact: true }).click();
  await expect(page.locator(editor)).toBeHidden();
  expect((await records(page, 'assets')).filter(a => a.extraction)).toHaveLength(1);
  await expect(page.locator('.cm-content').first()).toContainText('My chop');
  await page.keyboard.press('Control+z'); await expect(page.locator('.cm-content').first()).not.toContainText('My chop');
  await page.keyboard.press('Control+Shift+z'); await expect(page.locator('.cm-content').first()).toContainText('My chop');
  await page.waitForTimeout(1000); await page.reload();
  await expect(page.locator('.cm-content').first()).toContainText('My chop');
  await page.keyboard.press('Control+k'); await page.locator('#command-palette input').fill('Open Sample Catalogue'); await page.keyboard.press('Enter');
  await page.locator(`[data-asset="${first.id}"] summary`).click();
  await page.locator(`[data-edit-sample="${first.id}"]`).click();
  await expect(page.locator(`${editor} [data-wav-title]`)).toHaveText('My chop');
  await page.locator(editor).getByLabel('End (seconds)', { exact: true }).fill('.1');
  await page.getByRole('button', { name: 'Save sample', exact: true }).click();
  await expect(page.locator(`${editor} [data-wav-status]`)).toContainText('Saved');
  const assets = (await records(page, 'assets')).filter(a => a.extraction);
  expect(assets).toHaveLength(2); expect(assets.find(a => a.id === first.id).duration).toBe(.5);
  expect(assets.find(a => a.id !== first.id).extraction.assetId).toBe(first.id);
  await page.getByRole('link', { name: /Back to Studio/ }).click();
  await page.locator('#save-now').click();
  await page.keyboard.press('Control+k'); await page.locator('#command-palette input').fill('Download project backup');
  const backingUp = page.waitForEvent('download'); await page.keyboard.press('Enter');
  const backup = await backingUp;
  await page.locator('#backup-file').setInputFiles((await backup.path())!);
  await expect(page.locator('#saved-projects')).toHaveValue(/restored/);
  await page.reload();
  expect((await records(page, 'assets')).filter(a => a.extraction)).toEqual(assets);
  expect(errors).toEqual([]); expect(forbidden).toEqual([]);
});
test('mouse and keyboard selection, navigation retention, validation and replacement protection', async ({ page }) => {
  await open(page);
  const box = (await page.locator(`${editor} canvas`).boundingBox())!;
  await page.mouse.move(box.x + box.width * .25, box.y + 90); await page.mouse.down(); await page.mouse.move(box.x + box.width * .75, box.y + 90); await page.mouse.up();
  expect(Number(await page.locator(`${editor} [data-wav-start]`).inputValue())).toBeCloseTo(.5, 2);
  const before = Number(await page.locator(`${editor} [data-wav-end]`).inputValue());
  await page.getByRole('slider', { name: 'Selection end', exact: true }).focus(); await page.keyboard.press('Alt+ArrowLeft');
  expect(Number(await page.locator(`${editor} [data-wav-end]`).inputValue())).toBeCloseTo(before - 1 / rate, 6);
  await page.locator(`${editor} [data-wav-zoom]`).fill('4');
  expect(await page.locator(`${editor} [data-wav-wave]`).evaluate(el => el.clientWidth)).toBeGreaterThan(box.width * 3);
  await page.getByRole('link', { name: 'Import samples', exact: true }).click();
  await page.getByRole('link', { name: /WAV editor/ }).click();
  await expect(page.locator(`${editor} [data-wav-title]`)).toHaveText('Stereo.wav');
  await page.locator(`${editor} [data-wav-end]`).fill('0'); await page.getByRole('button', { name: 'Save sample', exact: true }).click();
  await expect(page.locator(`${editor} [data-wav-status]`)).toContainText('end after start');
  expect((await records(page, 'assets')).filter(a => a.extraction)).toHaveLength(0);
  page.once('dialog', dialog => dialog.dismiss());
  await page.locator(`${editor} [data-wav-file]`).setInputFiles({ name: 'Other.wav', mimeType: 'audio/wav', buffer: wave });
  await expect(page.locator(`${editor} [data-wav-title]`)).toHaveText('Stereo.wav');
  page.once('dialog', dialog => dialog.accept());
  await page.locator(`${editor} [data-wav-file]`).setInputFiles({ name: 'Broken.wav', mimeType: 'audio/wav', buffer: Buffer.from('bad') });
  await expect(page.locator(`${editor} [data-wav-status]`)).toContainText('Malformed WAV');
  await expect(page.locator('#saved-projects')).toHaveValue('Neon-Drive');
});

test('failed storage preserves the selection for retry and loading can be cancelled', async ({ page }) => {
  await open(page);
  await page.locator(`${editor} [data-wav-end]`).fill('.1');
  await page.evaluate(() => {
    const transaction = IDBDatabase.prototype.transaction;
    (window as any).restoreSampleTransactions = () => { IDBDatabase.prototype.transaction = transaction; };
    IDBDatabase.prototype.transaction = function(...args: any[]) {
      if (args[1] === 'readwrite' && (Array.isArray(args[0]) ? args[0].includes('assets') : args[0] === 'assets')) throw new DOMException('Browser storage is full. Free space and retry.', 'QuotaExceededError');
      return Reflect.apply(transaction, this, args);
    };
  });
  await page.getByRole('button', { name: 'Save sample', exact: true }).click();
  await expect(page.locator(`${editor} [data-wav-status]`)).toContainText('storage is full');
  await expect(page.locator(`${editor} [data-wav-end]`)).toHaveValue('.1');
  expect((await records(page, 'assets')).filter(a => a.extraction)).toHaveLength(0);
  await page.evaluate(() => (window as any).restoreSampleTransactions());
  await page.getByRole('button', { name: 'Save sample', exact: true }).click();
  await expect(page.locator(`${editor} [data-wav-status]`)).toContainText('Saved');
  // Delay source reads to exercise cancellation independently of machine speed.
  await page.evaluate(() => {
    const read = Blob.prototype.arrayBuffer;
    Blob.prototype.arrayBuffer = async function() { await new Promise(resolve => setTimeout(resolve, 500)); return read.call(this); };
  });
  await page.locator(`${editor} [data-wav-file]`).setInputFiles({ name: 'Again.wav', mimeType: 'audio/wav', buffer: wave });
  await page.getByRole('button', { name: 'Cancel loading', exact: true }).click();
  await expect(page.locator(`${editor} [data-wav-status]`)).toContainText('cancelled');
  await page.waitForTimeout(600); await expect(page.locator(`${editor} [data-wav-workspace]`)).toBeHidden();
  expect((await records(page, 'assets')).filter(a => a.extraction)).toHaveLength(1);
});

for (const legacy of [false, true]) test(`${legacy ? 'Previously inserted' : 'Newly inserted'} WAV section produces audio in a tab after reload`, async ({ page }) => {
  const requests: string[] = [];
  page.on('request', request => { if (new URL(request.url()).pathname.startsWith('/api/')) requests.push(request.url()); });
  await page.goto('/'); await expect(page.locator('#saved-projects')).toHaveValue('Neon-Drive');
  await page.locator('#new-tab').click();
  await page.locator('#new-pattern-name').fill('WAV playback');
  await page.locator('#new-pattern').getByRole('button', { name: 'Create', exact: true }).click();
  await page.locator('#editor .cm-content:visible').click(); await page.keyboard.press('Control+Home'); await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowDown'); await page.keyboard.press('Home'); await page.keyboard.press('Control+Shift+End'); await page.keyboard.press('Backspace');
  await open(page);
  await page.locator(`${editor} [data-wav-start]`).fill('.25');
  await page.locator(`${editor} [data-wav-end]`).fill('.75');
  await page.locator(editor).getByLabel('Sample name', { exact: true }).fill('Playback chop');
  await page.getByRole('button', { name: 'Save and insert', exact: true }).click();
  await expect(page.locator(editor)).toBeHidden();
  if (legacy) {
    const asset = (await records(page, 'assets')).find(a => a.label === 'Playback chop');
    await page.locator('#editor .cm-content:visible').click(); await page.keyboard.press('Control+End');
    await page.keyboard.insertText(`\nsamples({ studio_${asset.id.replaceAll('-', '')}: [location.origin + '/api/samples/${asset.id}/audio'] })\n`);
  }
  await page.locator('#save-now').click();
  await page.reload();
  await expect(page.locator('#editor .cm-content:visible')).toContainText('Playback chop');
  await page.locator('[data-play-target=tab]').click();
  await page.evaluate(() => window.neonCapture.start());
  await page.locator('#play').click();
  await page.waitForTimeout(2500);
  const audio = await page.evaluate(() => window.neonCapture.finish());
  await page.locator('#stop').click();
  expect(requests).toEqual([]);
  expect(audio.peak).toBeGreaterThan(.01);
});

test('a single WAV placed on the timeline plays once and extending the clip adds silence', async ({ page }) => {
  await page.goto('/'); await expect(page.locator('#saved-projects')).toHaveValue('Neon-Drive');
  await page.locator('#add-session').click(); await page.locator('#edit-name').fill('One-shot sample'); await page.locator('#edit-dialog button[value="confirm"]').click();
  await expect(page.locator('#saved-projects')).toHaveValue('One-shot-sample');
  await page.locator('#editor .cm-content:visible').click(); await page.keyboard.press('Control+Home'); await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowDown'); await page.keyboard.press('Home'); await page.keyboard.press('Control+Shift+End'); await page.keyboard.press('Backspace');
  await expect(page.locator('#editor .cm-content:visible')).not.toContainText('$bass');
  await page.evaluate(()=>location.hash='/samples/edit');
  await page.locator(`${editor} [data-wav-file]`).setInputFiles({name:'Two seconds.wav',mimeType:'audio/wav',buffer:wave});
  await expect(page.locator(`${editor} [data-wav-title]`)).toHaveText('Two seconds.wav');
  await page.getByRole('button',{name:'Save and insert',exact:true}).click();await expect(page.locator(editor)).toBeHidden();
  await page.locator('#tabs [role=tab][aria-selected=true]').click({button:'right'});
  await page.getByRole('menuitem',{name:'Add to composition',exact:true}).click();
  await expect(page.locator('#clip-playback')).toHaveValue('once');
  await expect(page.locator('#clip-length')).toHaveValue('4');
  await page.locator('#clip-length').fill('16');await page.locator('#clip-dialog button[value=save]').click();
  await page.locator('[data-clip]').first().click();await page.locator('#clip-dialog button[value=duplicate]').click();
  await expect(page.locator('[data-clip]')).toHaveCount(2);
  await page.evaluate(()=>{
    const stats=(window as any).takeAllocations={decodes:0,convolvers:0};
    const decode=BaseAudioContext.prototype.decodeAudioData,convolver=BaseAudioContext.prototype.createConvolver;
    BaseAudioContext.prototype.decodeAudioData=function(...args:Parameters<typeof decode>){stats.decodes++;return decode.apply(this,args);};
    BaseAudioContext.prototype.createConvolver=function(){stats.convolvers++;return convolver.call(this);};
  });
  await page.evaluate(()=>window.neonCapture.start());await page.locator('#composition-play').click();await page.waitForTimeout(4600);
  const captured=await page.evaluate(()=>window.neonCapture.finish());await page.locator('#composition-stop').click();
  expect(captured.bins[0].peak).toBeGreaterThan(.02);
  expect(await page.evaluate(()=>(window as any).takeAllocations)).toEqual({decodes:1,convolvers:0});
  expect(Math.max(...captured.bins.slice(3).map(b=>b.peak))).toBeLessThan(.0001);
  await page.locator('#save-now').click();await page.reload();
  await page.locator('[data-play-target=composition]').click();await page.locator('[data-clip]').first().click();
  await expect(page.locator('#clip-playback')).toHaveValue('once');
  await page.locator('#clip-playback').selectOption('pattern');await page.locator('#clip-dialog button[value=save]').click();
  await page.evaluate(()=>window.neonCapture.start());await page.locator('#composition-play').click();await page.waitForTimeout(4600);
  const repeated=await page.evaluate(()=>window.neonCapture.finish());await page.locator('#composition-stop').click();
  expect(repeated.bins[4].peak).toBeGreaterThan(.02);
  await page.locator('[data-clip]').first().click();await page.locator('#clip-playback').selectOption('once');await page.locator('#clip-dialog button[value=save]').click();
  await page.locator('#save-now').click();await page.reload();await page.locator('[data-play-target=composition]').click();
  await page.evaluate(()=>{
    const decode=BaseAudioContext.prototype.decodeAudioData;
    BaseAudioContext.prototype.decodeAudioData=async function(...args:Parameters<typeof decode>){
      await new Promise<void>(resolve=>(window as any).releaseTakeDecode=resolve);
      return decode.apply(this,args);
    };
  });
  await page.locator('#composition-play').click();
  await page.waitForFunction(()=>typeof (window as any).releaseTakeDecode==='function');
  await page.locator('#composition-stop').click();await page.evaluate(()=>(window as any).releaseTakeDecode());
  await expect(page.locator('#composition-play')).toBeEnabled();
  await expect(page.locator('#transport-state')).toContainText('Stopped');

});

test('beat grid snapping crops a selection and saves it at its original timing',async({page})=>{
 await open(page);
 await page.locator(editor).getByLabel('Grid BPM',{exact:true}).fill('120');
 await page.locator(editor).getByLabel('First beat (seconds)',{exact:true}).fill('.1');
 await page.locator('#sample-editor-page [data-wav-snap]').selectOption('0.5');
 const handle=page.getByRole('slider',{name:'Selection start',exact:true});await handle.focus();await page.keyboard.press('ArrowRight');
 expect(Number(await page.locator('#sample-editor-page [data-wav-start]').inputValue())).toBeCloseTo(.35,5);
 await page.locator('#sample-editor-page [data-wav-snap]').selectOption('0');await page.locator('#sample-editor-page [data-wav-start]').fill('0');
 await expect(page.locator(editor).getByLabel('Stretch without changing pitch')).toHaveCount(0);
 await page.locator(editor).getByLabel('Click track',{exact:true}).check();
 await page.evaluate(()=>window.neonCapture.start());await page.getByRole('button',{name:'Play selection',exact:true}).click();
 await expect(page.locator('#sample-editor-page [data-wav-play]')).toHaveAttribute('aria-pressed','true');await expect(page.locator('#sample-editor-page [data-wav-play]')).toHaveAttribute('aria-pressed','false');
 expect((await page.evaluate(()=>window.neonCapture.finish())).peak).toBeGreaterThan(.05);
 await page.locator(editor).getByLabel('Sample name',{exact:true}).fill('Whole crop');await page.getByRole('button',{name:'Save sample',exact:true}).click();
 await expect(page.locator('#sample-editor-page [data-wav-status]')).toContainText('Saved');
 const asset=(await records(page,'assets')).find(a=>a.label==='Whole crop');expect(asset.extraction.alignment).toBeUndefined();expect(asset.extraction.startFrame).toBe(0);
 const downloading=page.waitForEvent('download');await page.getByRole('button',{name:'Download WAV',exact:true}).click();
 const downloaded=decodeWav(new Uint8Array(await readFile((await (await downloading).path())!)));
 const signal=downloaded.left.slice(Math.round(downloaded.rate*.05),-Math.round(downloaded.rate*.05));let crossings=0;for(let i=1;i<signal.length;i++)if(signal[i-1]<=0&&signal[i]>0)crossings++;
 expect(crossings/(signal.length/downloaded.rate)).toBeGreaterThan(215);expect(crossings/(signal.length/downloaded.rate)).toBeLessThan(225);
});
