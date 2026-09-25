import test from 'node:test';
import assert from 'node:assert/strict';
import {suggestAttacks,renderAnchoredAudio} from '../shared/anchor-render';
import {decodeEditableWav} from '../shared/sample-edit';
import {encodeWav} from '../shared/wav';
import type {ClipAnchor} from '../shared/clip-timing';
const rate=24000,bpm=120; // 0.5 s per beat
const anchors:ClipAnchor[]=[{source:0,beat:0},{source:1,beat:2.5},{source:2,beat:4}]; // 1 s → 1.25 s, then 1 s → 0.75 s
function audio(signal:Float32Array){return decodeEditableWav(new Uint8Array(encodeWav(signal,signal,rate,{format:'float32'}).buffer));}
const tone=(seconds:number,hz=220)=>Float32Array.from({length:Math.round(seconds*rate)},(_,i)=>.3*Math.sin(2*Math.PI*hz*i/rate));
function crossings(values:Float32Array,start:number,end:number){let n=0;for(let i=Math.round(start*rate)+1;i<end*rate;i++)if(values[i-1]<=0&&values[i]>0)n++;return n/(end-start);}
test('attack suggestions ignore silence and find separated tone attacks',()=>{
 assert.deepEqual(suggestAttacks(audio(new Float32Array(48000)),0,48000),[]);
 const values=new Float32Array(48000);for(const time of [.3,.9,1.5])for(let i=0;i<rate*.15;i++)values[Math.round(time*rate)+i]=.5*Math.sin(i*2*Math.PI*330/rate)*Math.min(1,i/120);
 const candidates=suggestAttacks(audio(values),0,48000);assert.ok(candidates.length>=3);for(const time of [.3,.9,1.5])assert.ok(candidates.some(f=>Math.abs(f/rate-time)<.04));
});
test('rendering stretches between anchors, keeps pitch and stereo, and copies the tail at 1×',async()=>{
 const rendered=decodeEditableWav(new Uint8Array(await renderAnchoredAudio(audio(tone(3)),anchors,bpm)));
 assert.equal(rendered.left.length,72000);assert.deepEqual(rendered.left,rendered.right);
 for(const [start,end] of [[.2,1],[1.4,1.9],[2.2,2.9]])assert.ok(Math.abs(crossings(rendered.left,start,end)-220)<5,`${start}-${end}`);
 let jump=0;for(let i=rate*1.2;i<rate*2.1;i++)jump=Math.max(jump,Math.abs(rendered.left[i]-rendered.left[i-1]));assert.ok(jump<.15);
});
test('an audible attack lands on its anchored beat within 25 milliseconds',async()=>{
 const values=new Float32Array(48000);for(let i=24000;i<42000;i++)values[i]=.4*Math.sin(2*Math.PI*330*i/rate)*Math.min(1,(i-24000)/100);
 const rendered=decodeEditableWav(new Uint8Array(await renderAnchoredAudio(audio(values),anchors,bpm)));
 const attack=rendered.left.findIndex(v=>Math.abs(v)>.07)/rate;assert.ok(Math.abs(attack-1.25)<.025,`attack at ${attack}`);
});
test('playback starts at the first anchor and unstretched audio is copied sample-exactly',async()=>{
 const signal=tone(3,330),rendered=decodeEditableWav(new Uint8Array(await renderAnchoredAudio(audio(signal),[{source:.5,beat:0},{source:1.5,beat:2}],bpm)));
 assert.equal(rendered.left.length,60000);
 for(let k=rate*.1;k<rate*2.4;k+=97)assert.ok(Math.abs(rendered.left[k]-signal[12000+k])<1e-6,`frame ${k}`);
});
test('intervals at exactly 0.5× and 2× render, and anchors outside the audio are rejected',async()=>{
 const rendered=decodeEditableWav(new Uint8Array(await renderAnchoredAudio(audio(tone(2)),[{source:0,beat:0},{source:1,beat:1},{source:2,beat:5}],bpm)));
 assert.equal(rendered.left.length,60000);
 await assert.rejects(renderAnchoredAudio(audio(tone(1)),[{source:0,beat:0},{source:2,beat:4}],bpm),/inside/);
});
