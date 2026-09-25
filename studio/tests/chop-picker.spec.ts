import {test,expect,type Page} from '@playwright/test';
import {zipSync,strToU8} from 'fflate';
import {newProject,AssetSchema} from '../shared/model';
import {tempoHeader} from '../shared/tempo';
import {encodeWav} from '../shared/wav';
import {installAudioCapture} from './audio-capture';
const id='77777777-7777-4777-a777-777777777777';
const code=tempoHeader(120)+`const opening = s("sine")\nconst lift = s("triangle")\n$: stack(opening.struct("1 0 0 0"), lift.struct("0 0 1 0")).gain(.15)\n`;
const wav=new Uint8Array(encodeWav(Float32Array.from({length:48000},(_,i)=>Math.sin(2*Math.PI*220*i/48000)*.4),new Float32Array(48000),48000,{format:'float32'}).buffer);
async function setup(page:Page){
 page.on('pageerror',error=>console.log('PAGE ERROR',error.message));
 await page.addInitScript(()=>{localStorage.setItem('studio.quick-start.opt-out','true');const input:any={id:'test',name:'Test keys',state:'connected',onmidimessage:null};Object.defineProperty(navigator,'requestMIDIAccess',{value:async()=>({inputs:new Map([['test',input]]),outputs:new Map()})});(window as any).testNote=(on:boolean)=>input.onmidimessage?.({data:new Uint8Array([on?144:128,60,on?100:0]),timeStamp:performance.now()});});
 await installAudioCapture(page);
 const project=newProject();project.name='Chop picker';project.sessionId='Chop-picker';project.tabs=[{id:'chops',name:'Vocal Syncopation',code,anchors:[],color:'blue'}];project.activeTabId='chops';project.assetIds=[id];project.clips=[{id:'clip',tabId:'chops',trackId:project.tracks[0].id,start:0,length:32,muted:false}];
 const asset=AssetSchema.parse({id,provider:'upload',format:'wav',label:'Test vocal',duration:1,createdAt:new Date().toISOString()});
 const zip=zipSync({'project.json':strToU8(JSON.stringify(project)),[`assets/${id}.json`]:strToU8(JSON.stringify(asset)),[`assets/${id}.wav`]:wav});
 await page.goto('/');await expect(page.locator('#saved-projects')).toHaveValue('Neon-Drive');await page.locator('#backup-file').setInputFiles({name:'chops.zip',mimeType:'application/zip',buffer:Buffer.from(zip)});await expect(page.locator('#saved-projects')).toHaveValue('Chop-picker-restored');
}
async function openOpening(page:Page){await page.locator('.cm-content [data-chop-reference="const:opening"]').last().click();await expect(page.locator('#chop-use')).toHaveText('Use for Opening');}
const editor='#editor .cm-content:visible';
test('stack reference opens focused picker, auditions a crop and commits only its binding with undo and reload',async({page})=>{
 await setup(page);await openOpening(page);
 await page.locator(`[data-select-asset="${id}"]`).click();await expect(page.locator('#chop-use')).toBeEnabled();
 await expect(page.locator(`#assets [data-insert-existing="${id}"]`)).toBeHidden();await expect(page.locator('#library-keys')).toBeVisible();
 await page.locator('#chop-region-editor [data-wav-start]').fill('.1');await page.locator('#chop-region-editor [data-wav-end]').fill('.35');
 await page.evaluate(()=>window.neonCapture.start());await page.locator('[data-library-note="60"]').focus();await page.keyboard.down('Space');await page.waitForTimeout(500);await page.keyboard.up('Space');
 expect((await page.evaluate(()=>window.neonCapture.finish())).peak).toBeGreaterThan(.02);
 await expect(page.locator(editor)).toContainText('s("sine")');
 await page.locator('#chop-use').click();await expect(page.locator('#sounds-panel')).toBeHidden();
 await expect(page.locator(editor)).toContainText('const lift = s("triangle")');await expect(page.locator(editor)).not.toContainText('s("sine")');await expect(page.locator(editor)).toContainText('opening.struct("1 0 0 0")');
 const changed=await page.locator(editor).innerText();await page.locator(editor).click();await page.keyboard.press('Control+z');await expect(page.locator(editor)).toContainText('s("sine")');await page.keyboard.press('Control+Shift+z');await expect(page.locator(editor)).not.toContainText('s("sine")');
 await page.locator('#save-now').click();await page.reload();await expect(page.locator(editor)).not.toContainText('s("sine")');
 await openOpening(page);await expect(page.locator('#chop-region-editor [data-wav-duration]')).toContainText('0.250');
 await page.locator('#chop-cancel').click();expect(await page.locator(editor).innerText()).toBe(changed);
});
test('cancel leaves code unchanged; MIDI follows selection; confirmed live swaps do not apply unrelated draft edits',async({page})=>{
 await setup(page);await openOpening(page);await page.locator('[data-select-sound="square"]').click();await page.locator('#chop-cancel').click();await expect(page.locator(editor)).toContainText('s("sine")');
 await page.locator('[data-play-target=composition]').click();await page.locator('#composition-play').click();await expect(page.locator('#transport-state')).toContainText('Composition');
 await page.locator(editor).click();await page.keyboard.press('Control+End');await page.keyboard.insertText('\n// unrelated pending draft\n');
 await openOpening(page);await page.locator('[data-select-sound="square"]').click();await page.locator('#chop-use').click();await expect(page.locator('#sounds-panel')).toBeHidden();await expect(page.locator('#notice')).toContainText('next cycle');await expect(page.locator('#transport-state')).toContainText('Composition');await expect(page.locator(editor)).toContainText('s("square")');await expect(page.locator(editor)).toContainText('unrelated pending draft');
 await expect(page.locator('#evaluate')).toBeVisible();await page.locator('#composition-stop').click();
});
test('failed crop save retains destination and selection for retry; connected MIDI auditions without committing',async({page})=>{
 await setup(page);await openOpening(page);await page.locator(`[data-select-asset="${id}"]`).click();await expect(page.locator('#chop-use')).toBeEnabled();
 await page.locator('#chop-region-editor [data-wav-start]').fill('.1');await page.locator('#chop-region-editor [data-wav-end]').fill('.3');
 const enable=page.locator('#library-midi-connection [data-midi-enable]');if(await enable.isVisible())await enable.click();
 await expect(page.locator('#library-midi-connection [data-midi-status]')).toContainText('MIDI ·');
 await page.evaluate(()=>{window.neonCapture.start();(window as any).testNote(true);});await page.waitForTimeout(400);await page.evaluate(()=>(window as any).testNote(false));expect((await page.evaluate(()=>window.neonCapture.finish())).peak).toBeGreaterThan(.02);
 await page.evaluate(()=>{const original=IDBDatabase.prototype.transaction;(window as any).restoreTransactions=()=>IDBDatabase.prototype.transaction=original;IDBDatabase.prototype.transaction=function(...args:any[]){if(args[1]==='readwrite'&&Array.isArray(args[0])&&args[0].includes('assets'))throw new DOMException('Storage full','QuotaExceededError');return Reflect.apply(original,this,args);};});
 await page.locator('#chop-use').click();await expect(page.locator('#chop-status')).toContainText('Storage full');await expect(page.locator(editor)).toContainText('s("sine")');await expect(page.locator('#chop-region-editor [data-wav-end]')).toHaveValue('.3');
 await page.evaluate(()=>(window as any).restoreTransactions());await page.locator('#chop-use').click();await expect(page.locator('#sounds-panel')).toBeHidden();await expect(page.locator(editor)).not.toContainText('s("sine")');
});
