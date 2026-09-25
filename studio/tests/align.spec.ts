import {test,expect,type Page} from '@playwright/test';
import {zipSync,strToU8} from 'fflate';
import {newProject,AssetSchema} from '../shared/model';
import {encodeWav,decodeWav} from '../shared/wav';
import {tempoHeader} from '../shared/tempo';
import {installAudioCapture} from './audio-capture';
const id='99999999-9999-4999-a999-999999999999';
async function saved(page:Page){return page.evaluate(async()=>{const db=await new Promise<IDBDatabase>((resolve,reject)=>{const r=indexedDB.open('strudel-studio',2);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});return await new Promise<any>((resolve,reject)=>{const r=db.transaction('projects').objectStore('projects').get('Vocal-align-restored');r.onsuccess=()=>{db.close();resolve(r.result);};r.onerror=()=>reject(r.error);});});}
function tone220(values:Float32Array,rate:number){let real=0,imag=0;for(let i=0;i<values.length;i++){real+=values[i]*Math.cos(2*Math.PI*220*i/rate);imag+=values[i]*Math.sin(2*Math.PI*220*i/rate);}return 2*Math.hypot(real,imag)/values.length;}
async function setup(page:Page){
 await page.addInitScript(()=>localStorage.setItem('studio.quick-start.opt-out','true'));await installAudioCapture(page);
 const samples=new Float32Array(192000);for(const second of [.5,1.5,2.5])for(let i=0;i<20000;i++)samples[Math.round(second*48000)+i]=.3*Math.sin(2*Math.PI*220*i/48000)*Math.min(1,i/200)*Math.min(1,(20000-i)/500);
 const wav=new Uint8Array(encodeWav(samples,samples,48000,{format:'float32'}).buffer),project=newProject();project.name='Vocal align';project.sessionId='Vocal-align';project.bpm=120;
 project.tabs=[{id:'voice',name:'Vocal',code:tempoHeader(120)+`s("studio_${id.replaceAll('-','')}").slow(2).gain(.7)`,anchors:[],color:'blue'},{id:'beat',name:'Beat',code:tempoHeader(120)+'note("48*4").s("sine").decay(.06).sustain(0).gain(.1)',anchors:[],color:'orange'}];project.activeTabId='voice';project.assetIds=[id];
 project.clips=[{id:'voice-clip',tabId:'voice',trackId:project.tracks[0].id,start:0,length:2,takeId:id,playback:'once',muted:false},{id:'other-clip',tabId:'voice',trackId:project.tracks[0].id,start:2,length:2,takeId:id,playback:'once',muted:false},{id:'beat-clip',tabId:'beat',trackId:project.tracks[1].id,start:0,length:4,muted:false}];
 const asset=AssetSchema.parse({id,provider:'upload',format:'wav',label:'Vocal phrase',duration:4,createdAt:new Date().toISOString()});
 const zip=zipSync({'project.json':strToU8(JSON.stringify(project)),[`assets/${id}.json`]:strToU8(JSON.stringify(asset)),[`assets/${id}.wav`]:wav});
 await page.goto('/');await expect(page.locator('#saved-projects')).toHaveValue('Neon-Drive');await page.locator('#backup-file').setInputFiles({name:'vocal.zip',mimeType:'application/zip',buffer:Buffer.from(zip)});await expect(page.locator('#saved-projects')).toHaveValue('Vocal-align-restored');await page.locator('[data-play-target=composition]').click();
}
async function open(page:Page){await page.locator('[data-clip="voice-clip"]').click({button:'right'});await page.getByRole('menuitem',{name:'Align…'}).click();await expect(page.locator('.align-dialog [data-status]')).toContainText('Hollow markers');}
test('anchors audition with the song, save as clip timing without new audio, and reopen from the original',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await setup(page);const before=await saved(page);await open(page);
 const dialog=page.locator('.align-dialog'),suggestion=dialog.locator('.align-anchor.suggested').first();await expect(suggestion).toBeVisible();const source=await suggestion.getAttribute('data-source');
 await suggestion.focus();await page.keyboard.press('ArrowRight');const anchor=dialog.locator(`[data-source="${source}"]`);await expect(anchor).toHaveClass(/active/);await expect(anchor).toHaveAttribute('aria-label',/beat 2.25/);
 // Direct manipulation snaps a moved anchor, then keyboard restores the desired offbeat.
 const grid=await dialog.locator('.align-grid').boundingBox(),beats=Number(await dialog.locator('.align-grid').getAttribute('data-beats')),handle=await anchor.boundingBox();await page.mouse.move(handle!.x+10,handle!.y+10);await page.mouse.down();await page.mouse.move(grid!.x+grid!.width*1.5/beats,handle!.y+10);await page.mouse.up();await expect(anchor).toHaveAttribute('aria-label',/beat 2.50/);await anchor.focus();await page.keyboard.press('ArrowLeft');
 await page.evaluate(()=>window.neonCapture.start());await dialog.locator('[data-play]').click();await expect(dialog.locator('[data-status]')).toContainText('Aligned with song',{timeout:20000});await page.waitForTimeout(1200);const preview=await page.evaluate(()=>window.neonCapture.finish());expect(preview.peak).toBeGreaterThan(.03);
 const recorded=decodeWav(new Uint8Array(Buffer.from(preview.wav,'base64')));expect(tone220(recorded.left,recorded.rate)).toBeGreaterThan(.01);
 await dialog.locator('[data-mode=original]').click();await expect(dialog.locator('[data-status]')).toContainText('Original with song');await dialog.locator('[data-mode=aligned]').click();await expect(dialog.locator('[data-status]')).toContainText('Aligned with song');
 await dialog.locator('[data-play]').click();expect((await saved(page)).clips).toEqual(before.clips);
 await dialog.locator('[data-apply]').click();await expect(dialog).not.toBeVisible({timeout:20000});await page.locator('#save-now').click();await expect.poll(async()=>(await saved(page)).clips.find((c:any)=>c.id==='voice-clip').anchors?.length).toBe(2);const after=await saved(page);
 const aligned=after.clips.find((c:any)=>c.id==='voice-clip');expect(aligned.takeId).toBe(id);expect(aligned.length).toBe(2);expect(aligned.anchors[1]).toEqual({source:Number(source),beat:1.25});expect(after.assetIds).toEqual(before.assetIds);
 expect(after.clips.find((c:any)=>c.id==='other-clip')).toEqual(before.clips.find((c:any)=>c.id==='other-clip'));expect(after.tabs).toEqual(before.tabs);await expect(page.locator('[data-clip="voice-clip"]')).toContainText('Aligned');
 await page.evaluate(()=>window.neonCapture.start());await page.locator('#composition-play').click();await page.waitForTimeout(1300);await page.locator('#composition-stop').click();expect((await page.evaluate(()=>window.neonCapture.finish())).peak).toBeGreaterThan(.03);
 await page.reload();await open(page);await expect(page.locator(`.align-dialog [data-source="${source}"]`)).toHaveClass(/active/);await expect(page.locator(`.align-dialog [data-source="${source}"]`)).toHaveAttribute('aria-label',/beat 2.25/);
 await page.locator('.align-dialog [data-cancel]').click();expect((await saved(page)).clips).toEqual(after.clips);expect(errors).toEqual([]);
});
test('manual anchors, invalid stretches and cancellation leave the composition intact',async({page})=>{
 await setup(page);const before=await saved(page);await open(page);const dialog=page.locator('.align-dialog');await dialog.locator('[data-suggestions]').uncheck();const grid=await dialog.locator('.align-grid').boundingBox();
 await page.mouse.dblclick(grid!.x+grid!.width*.5,grid!.y+115);await expect(dialog.locator('.align-anchor.active')).toHaveCount(2);
 const anchor=dialog.locator('.align-anchor.active').nth(1);await anchor.focus();await page.keyboard.press('ArrowRight');await page.keyboard.press('Delete');await expect(dialog.locator('.align-anchor.active')).toHaveCount(1);
 await page.mouse.dblclick(grid!.x+grid!.width*.5,grid!.y+115);await anchor.focus();for(let i=0;i<10;i++)await page.keyboard.press('ArrowLeft');await expect(dialog.locator('[data-status]')).toContainText('Interval');await expect(dialog.locator('[data-apply]')).toBeDisabled();
 await dialog.locator('[data-cancel]').click();expect((await saved(page)).clips).toEqual(before.clips);
});
test('Smart snap places attacks on the grid, fitting sets the clip length, and a tempo change re-renders',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await setup(page);await open(page);const dialog=page.locator('.align-dialog');
 await dialog.locator('[data-snap]').click();await expect(dialog.locator('[data-status]')).toContainText('3 attacks snapped');await expect(dialog.locator('.align-anchor.active')).toHaveCount(4);
 await dialog.locator('[data-fit-bars]').fill('1');await dialog.locator('[data-fit]').click();await expect(dialog.locator('.align-anchor.active')).toHaveCount(2);await expect(dialog.locator('[data-summary]')).toContainText('4 beats');
 await dialog.locator('[data-apply]').click();await expect(dialog).not.toBeVisible({timeout:20000});await page.locator('#save-now').click();
 await expect.poll(async()=>(await saved(page)).clips.find((c:any)=>c.id==='voice-clip').length).toBe(1);const fitted=(await saved(page)).clips.find((c:any)=>c.id==='voice-clip').anchors;expect(fitted[0]).toEqual({source:0,beat:0});expect(fitted[1].beat).toBe(4);expect(Math.abs(fitted[1].source-4)).toBeLessThan(.05);
 await expect(page.locator('[data-clip="voice-clip"] [data-clip-waveform]')).toHaveAttribute('data-ready','true');
 await page.evaluate(()=>window.neonCapture.start());await page.locator('#composition-play').click();await page.waitForTimeout(2800);await page.locator('#composition-stop').click();const capture=await page.evaluate(()=>window.neonCapture.finish());expect(capture.peak).toBeGreaterThan(.03);
 const audio=decodeWav(new Uint8Array(Buffer.from(capture.wav,'base64')));const first=audio.left.findIndex(v=>Math.abs(v)>.001);expect(tone220(audio.left.subarray(first,first+audio.rate*2),audio.rate)).toBeGreaterThan(.01);expect(Math.max(...audio.left.slice(first+Math.round(audio.rate*2.3)).map(Math.abs))).toBeLessThan(.001);
 await page.locator('#bpm').fill('100');await page.keyboard.press('Tab');await expect(page.locator('#bpm')).toHaveValue('100');
 await page.evaluate(()=>window.neonCapture.start());await page.locator('#composition-play').click();await page.waitForTimeout(3000);await page.locator('#composition-stop').click();const retimed=await page.evaluate(()=>window.neonCapture.finish());expect(retimed.peak).toBeGreaterThan(.03);const again=decodeWav(new Uint8Array(Buffer.from(retimed.wav,'base64')));expect(tone220(again.left,again.rate)).toBeGreaterThan(.005);expect(errors).toEqual([]);
});
test('pace presets, the bars field, start at first attack and the timeline pace shortcut keep pitch and snap to bars',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await setup(page);await open(page);const dialog=page.locator('.align-dialog');
 await dialog.locator('[data-pace="1"]').click();await expect(dialog.locator('[data-summary]')).toContainText('8 beats · 1.00×');
 await dialog.locator('[data-pace=".5"]').click();await expect(dialog.locator('[data-summary]')).toContainText('16 beats · 0.50×');
 await dialog.locator('[data-undo]').click();await expect(dialog.locator('[data-summary]')).toContainText('8 beats · 1.00×');
 await dialog.locator('[data-start-attack]').click();const first=dialog.locator('.align-anchor.active').first();expect(Number(await first.getAttribute('data-source'))).toBeGreaterThan(.4);await expect(first).toHaveAttribute('aria-label',/beat 1.00/);
 await dialog.locator('[data-apply]').click();await expect(dialog).not.toBeVisible({timeout:20000});await page.locator('#save-now').click();
 await expect.poll(async()=>(await saved(page)).clips.find((c:any)=>c.id==='voice-clip').anchors?.[0].source).toBeGreaterThan(.4);expect((await saved(page)).clips.find((c:any)=>c.id==='voice-clip').length).toBe(2);
 await page.locator('[data-clip="other-clip"]').click({button:'right'});await page.getByRole('menuitem',{name:'Pace: half time'}).click();await expect(page.locator('[data-clip="other-clip"]')).toContainText('16 beats');await expect(page.locator('[data-clip="other-clip"]')).toContainText('Aligned');
 await page.evaluate(()=>window.neonCapture.start());await page.locator('#composition-play').click();await page.waitForTimeout(2500);await page.locator('#composition-stop').click();const capture=await page.evaluate(()=>window.neonCapture.finish());expect(capture.peak).toBeGreaterThan(.03);
 const audio=decodeWav(new Uint8Array(Buffer.from(capture.wav,'base64')));expect(tone220(audio.left,audio.rate)).toBeGreaterThan(.005);expect(errors).toEqual([]);
});
