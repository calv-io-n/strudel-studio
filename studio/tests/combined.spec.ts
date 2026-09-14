import { installAudioCapture } from './audio-capture';
import { decodeWav } from '../shared/wav';
import { test, expect, type Page } from '@playwright/test';
async function setup(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('studio.quick-start.opt-out', 'true');
    const input: any = { id:'keys', name:'Combined keys', state:'connected', onmidimessage:null };
    Object.defineProperty(navigator, 'requestMIDIAccess', {value:async()=>({inputs:new Map([['keys',input]]), onstatechange:null})});
    (window as any).combinedNote=(on:boolean)=>input.onmidimessage?.({data:new Uint8Array([on?144:128,67,on?100:0])});
    navigator.mediaDevices.getUserMedia=async()=> { const c=new AudioContext(), o=c.createOscillator(), d=c.createMediaStreamDestination(); o.frequency.value=330; o.connect(d); o.start(); await c.resume(); return d.stream; };
  });
  await page.goto('/'); await expect(page.locator('#saved-projects')).toHaveValue('Neon-Drive');
  await page.locator('#palette-open').click(); await page.locator('#command-palette input').fill('MIDI & on-screen controller'); await page.keyboard.press('Enter');
  await page.locator('#reconnect').click(); await page.locator('#available-ports').selectOption('Combined keys [keys]'); await page.locator('#add-profile').click(); await page.keyboard.press('Escape');
  await page.getByRole('tab',{name:'Lead',exact:true}).click();
  await page.locator('#save-now').click(); await expect(page.locator('#saved-state')).toHaveText('Saved in this browser');
}
async function saved(page:Page) { return page.evaluate(async()=> {const db=await new Promise<IDBDatabase>(resolve=>{const r=indexedDB.open('strudel-studio');r.onsuccess=()=>resolve(r.result);});return new Promise<any>(resolve=>{const r=db.transaction('projects').objectStore('projects').get('Neon-Drive');r.onsuccess=()=>{resolve(r.result);db.close();};});});}
for(const context of ['tab','composition'] as const) for(const inputs of ['both-note','both-append','midi-note','midi-append','audio','audio-note'] as const) {
 test(`${context}: ${inputs} writes only the intended sections in one pattern`,async({page})=>{
  await setup(page); const before=await saved(page), tab=before.tabs.find((t:any)=>t.name==='Lead');
  if(inputs.endsWith('note')) {await page.locator('.tab-editor:not([hidden]) [data-input-function=note]').first().click(); await page.getByRole('menuitem',{name:'Record MIDI solo',exact:true}).click();}
  else await page.locator('#record-toggle').click();
  if(inputs.startsWith('both')||inputs.startsWith('midi')) {if(await page.locator('[data-capture=midi]').getAttribute('aria-pressed')==='false') await page.locator('[data-capture=midi]').click();}
  if(inputs.startsWith('audio') && await page.locator('[data-capture=midi]').getAttribute('aria-pressed') === 'true') await page.locator('[data-capture=midi]').click();
  if(inputs.startsWith('midi')) await page.locator('[data-capture=audio]').click();
  if(context==='composition') {await page.locator('[data-play-target=composition]').click(); const clip=before.clips.find((c:any)=>c.tabId===tab.id); await page.locator('#record-track').selectOption(clip.trackId); await page.locator(`[data-clip="${clip.id}"]`).click(); await page.keyboard.press('Escape');}
  await expect(page.locator('#midi-record-hint')).toContainText('Lead');
  await page.locator('#record-toggle').click(); await expect(page.locator('#record-toggle')).toHaveText('Stop'); await page.waitForTimeout(75);
  await page.evaluate(()=>(window as any).combinedNote(true)); await page.waitForTimeout(180); await page.evaluate(()=>(window as any).combinedNote(false));
  await expect(page.locator('.tab-editor:not([hidden]) .pending-code').first()).toBeVisible();
  // Manual navigation must neither redirect the take nor jump back at finalization.
  await page.getByRole('tab',{name:'Chords',exact:true}).click(); await page.waitForTimeout(100);
  await expect(page.getByRole('tab',{name:'Chords',exact:true})).toHaveAttribute('aria-selected','true');
  await page.locator('#record-toggle').click();
  if(inputs.startsWith('both')) {await expect(page.locator('#record-retry')).toHaveText('Keep take'); await page.locator('#record-retry').click(); await expect(page.locator('#record-status')).toContainText('Audio saved in pattern');}
  else if(inputs.startsWith('midi')) await page.locator('.performance-panel [data-accept]').click();
  else await expect(page.locator('#record-status')).toContainText('Audio saved in pattern');
  await expect.poll(async()=>{const p=await saved(page);return p.tabs.find((t:any)=>t.name==='Lead').code!==tab.code;}).toBe(true);
  const after=await saved(page), code=after.tabs.find((t:any)=>t.name==='Lead').code;
  expect(after.tabs.length).toBe(before.tabs.length); expect(after.clips).toEqual(before.clips);
  if(inputs.startsWith('audio')) expect(code).toContain(tab.code);
  expect(code.includes('// Recorded audio')).toBe(!inputs.startsWith('midi'));
  expect(code.includes('// Recorded MIDI')).toBe(inputs.endsWith('append'));
  if(inputs==='both-append') expect(code.indexOf('// Recorded MIDI')).toBeLessThan(code.indexOf('// Recorded audio'));
  expect(after.tabs.find((t:any)=>t.name==='Chords').code).toBe(before.tabs.find((t:any)=>t.name==='Chords').code);
  await expect(page.getByRole('tab',{name:'Chords',exact:true})).toHaveAttribute('aria-selected','true');
  await page.getByRole('tab',{name:'Lead',exact:true}).click(); await expect(page.locator('.tab-editor:not([hidden]) .cm-content')).toContainText(inputs.startsWith('midi') ? 'note(67)' : '// Recorded audio');
  await page.locator('#save-now').click(); await expect(page.locator('#saved-state')).toHaveText('Saved in this browser');
  await page.reload(); const restored=await saved(page); expect(restored.tabs.find((t:any)=>t.name==='Lead').code).toBe(code);
 });
}
test('both inputs share one count-in; Cancel creates no sections and early MIDI is ignored',async({page})=>{
 await setup(page); await page.locator('#bpm').fill('120'); await page.locator('#bpm').press('Tab');
 await page.locator('#count-in').click(); await page.locator('#record-toggle').click(); await page.locator('[data-capture=midi]').click();
 await page.locator('#record-toggle').click(); await expect(page.locator('#count-in-beat')).toHaveText('4');
 await page.evaluate(()=>{(window as any).combinedNote(true);(window as any).combinedNote(false);});
 await page.locator('#record-toggle').click(); await expect(page.locator('#record-toggle')).toHaveText('Record');
 await expect(page.locator('#record-status')).toContainText('cancelled');
 expect((await saved(page)).tabs.some((t:any)=>/Recorded (MIDI|audio)/.test(t.code))).toBe(false);
 await page.locator('#record-toggle').click(); await expect(page.locator('#count-in-beat')).toHaveText('4');
 await expect(page.locator('#record-toggle')).toHaveText('Stop'); await page.waitForTimeout(100);
 await page.evaluate(()=>(window as any).combinedNote(true)); await page.waitForTimeout(150); await page.evaluate(()=>(window as any).combinedNote(false));
 await page.locator('#stop').click(); await expect(page.locator('#record-retry')).toHaveText('Keep take');
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('studio.midi-take:Neon-Drive')!).notes.length)).toBe(1);
 await page.locator('#record-retry').click(); await expect(page.locator('#record-status')).toContainText('Audio saved in pattern');
});
test('interrupted simultaneous capture recovers both sources in the same pattern',async({page})=>{
 await setup(page); await page.locator('#record-toggle').click(); await page.locator('[data-capture=midi]').click();
 await page.locator('#record-toggle').click(); await expect(page.locator('#record-toggle')).toHaveText('Stop'); await page.waitForTimeout(100);
 await page.evaluate(()=>(window as any).combinedNote(true)); await page.waitForTimeout(1200); await page.evaluate(()=>(window as any).combinedNote(false));
 await page.reload(); await expect(page.locator('#record-retry')).toBeVisible(); await page.locator('#record-retry').click();
 await expect(page.locator('#record-status')).toContainText('saved');
 const p=await saved(page), code=p.tabs.find((t:any)=>t.name==='Lead').code;
 expect(code).toContain('// Recorded MIDI'); expect(code).toContain('// Recorded audio'); expect(p.tabs).toHaveLength(4);
});

test('saved simultaneous sections play both the microphone tone and MIDI pitch', async ({ page }) => {
 await installAudioCapture(page); await setup(page);
 const content=page.locator('.tab-editor:not([hidden]) .cm-content'); await content.focus(); await page.keyboard.press('Control+Home'); await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowDown'); await page.keyboard.press('Home'); await page.keyboard.press('Control+Shift+End'); await page.keyboard.insertText('$: silence');
 await page.locator('#record-toggle').click(); await page.locator('[data-capture=midi]').click(); await page.locator('#record-toggle').click(); await expect(page.locator('#record-toggle')).toHaveText('Stop'); await page.waitForTimeout(75);
 await page.evaluate(()=>(window as any).combinedNote(true)); await page.waitForTimeout(650); await page.evaluate(()=>(window as any).combinedNote(false)); await page.locator('#stop').click();
 await expect(page.locator('#record-retry')).toHaveText('Keep take'); await page.locator('#record-retry').click(); await expect(page.locator('#record-status')).toContainText('Audio saved in pattern'); await expect(content).toContainText('// Recorded audio');
 const project=await saved(page), code=project.tabs.find((t:any)=>t.name==='Lead').code; const period=Number(code.split('// Recorded audio')[1].match(/\.slow\(([^)]+)\)/)[1])*240/project.bpm;
 await page.evaluate(()=>window.neonCapture.start()); await page.locator('#play').click(); await page.waitForTimeout((period+.7)*1000); const wav=await page.evaluate(()=>window.neonCapture.finish()); await page.locator('#stop').click();
 const decoded=decodeWav(Buffer.from(wav.wav,'base64'));
 const power=(frequency:number, start=.2)=>{let re=0,im=0;const from=Math.floor(decoded.rate*start),end=Math.min(decoded.left.length,Math.floor(decoded.rate*(start+.3)));for(let i=from;i<end;i++){re+=decoded.left[i]*Math.cos(2*Math.PI*frequency*i/decoded.rate);im+=decoded.left[i]*Math.sin(2*Math.PI*frequency*i/decoded.rate);}return Math.hypot(re,im)/(end-from);};
 expect(power(330)).toBeGreaterThan(.02); expect(power(391.995)).toBeGreaterThan(.001);
 expect(power(330,period+.2)).toBeGreaterThan(.02); expect(power(391.995,period+.2)).toBeGreaterThan(.001);
});

test('a failed combined save retains both inputs and retry commits exactly once',async({page})=>{
 await setup(page); await page.locator('#record-toggle').click(); await page.locator('[data-capture=midi]').click(); await page.locator('#record-toggle').click(); await expect(page.locator('#record-toggle')).toHaveText('Stop'); await page.waitForTimeout(75);
 await page.evaluate(()=>(window as any).combinedNote(true)); await page.waitForTimeout(200); await page.evaluate(()=>(window as any).combinedNote(false)); await page.locator('#stop').click(); await expect(page.locator('#record-retry')).toHaveText('Keep take');
 await page.evaluate(()=>{const put=IDBObjectStore.prototype.put;(window as any).restoreCombinedWrites=()=>IDBObjectStore.prototype.put=put;IDBObjectStore.prototype.put=function(value,key){if(this.name==='projects'&&value.tabs.some((t:any)=>t.code.includes('// Recorded audio')))throw new DOMException('Full','QuotaExceededError');return put.call(this,value,key);};});
 await page.locator('#record-retry').click(); await expect(page.locator('#record-status')).toContainText('retained');
 expect((await saved(page)).tabs.some((t:any)=>t.code.includes('// Recorded audio'))).toBe(false);
 expect(await page.evaluate(()=>!!localStorage.getItem('studio.midi-take:Neon-Drive'))).toBe(true);
 await page.evaluate(()=>(window as any).restoreCombinedWrites()); await page.locator('#record-retry').click(); await expect(page.locator('#record-status')).toContainText('Audio saved in pattern');
 const code=(await saved(page)).tabs.find((t:any)=>t.name==='Lead').code;expect(code.match(/Recorded MIDI/g)).toHaveLength(1);expect(code.match(/Recorded audio/g)).toHaveLength(1);
 await expect(page.locator('.tab-editor:not([hidden]) .cm-content')).toContainText('// Recorded audio');
});
