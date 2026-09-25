/** Build a private, portable Strudel song from locally separated stems. No network or browser writes. */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { zipSync, strToU8 } from 'fflate';
import { decodeWav, encodeWav } from '../studio/shared/wav';
import { newProject, parseProject, AssetSchema, palette, type Asset } from '../studio/shared/model';
import { suggestAttacks } from '../studio/shared/anchor-render';
import { smartSnap, type ClipAnchor } from '../studio/shared/clip-timing';
import { tempoHeader } from '../studio/shared/tempo';
const source = resolve(process.argv[2] ?? `${process.env.HOME}/.config/StemKit/songs/ngZiYEJgJnU/stems`);
const out = resolve(process.argv[3] ?? '.local/liquid-dawn');
await mkdir(join(out, 'samples'), { recursive: true });
const digest = (b: Uint8Array | string) => createHash('sha256').update(b).digest('hex');
const uuid = (name: string) => { const h = digest(`liquid-dawn-v1:${name}`); return `${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-a${h.slice(17,20)}-${h.slice(20,32)}`; };
const rate=44100, bpm=172, bar=240/bpm;
// Source grid measured from the stems: the frame-exact hook cut is 16 source beats and its start sits on a beat.
// One source beat becomes two beats at 172 BPM (half-time feel), a 1.27x stretch with pitch preserved.
const sourceBpm=108.9, downbeat=3455042/rate, sourceBeat=60/sourceBpm, beatRatio=2;
const atBeat=(n:number)=>downbeat+n*sourceBeat;
const assets: Asset[]=[]; const audio=new Map<string,Uint8Array>(); const names: Record<string,string>={}; const cuts: any[]=[];
const sourceIds={vocals:'cdebdd7f-b075-4d06-a68d-d1cd7480e8f8',other:'86fd66ba-ab15-4064-bc93-fef5ac6ad001'};
const decoded=new Map<string,ReturnType<typeof decodeWav>>();const hashes=new Map<string,string>();
for(const name of ['vocals','other']){const b=new Uint8Array(await readFile(join(source,`${name}.wav`)));decoded.set(name,decodeWav(b));hashes.set(name,digest(b));}
async function saveSound(key:string,label:string,left:Float32Array,right:Float32Array,extraction?:any) {
 const fade=Math.min(Math.round(rate*.008),Math.floor(left.length/4));
 for(let i=0;i<fade;i++){const g=.5-.5*Math.cos(Math.PI*i/fade);left[i]*=g;right[i]*=g;left[left.length-1-i]*=g;right[right.length-1-i]*=g;}
 const bytes=new Uint8Array(encodeWav(left,right,rate,{format:'float32'}).buffer);const id=uuid(key);
 const asset=AssetSchema.parse({id,createdAt:'2026-09-25T06:00:00.000Z',provider:'upload',format:'wav',personal:true,label:`Liquid Dawn · ${label}`,duration:left.length/rate,contentHash:digest(bytes),pack:{id:uuid('pack'),name:'Liquid Dawn · Vocal cuts & textures',folder:'liquid-dawn'},precision:{rate,channels:2,bits:32,working:'float32',originalAvailable:true},source:{name:`${key}.wav`,originalFormat:'wav'},extraction});
 assets.push(asset);audio.set(id,bytes);names[key]=`studio_${id.replaceAll('-','')}`;await writeFile(join(out,'samples',`${key}.wav`),bytes);return asset;
}
async function cut(key:string,label:string,stem:'vocals'|'other',start:number,end:number) {
 const d=decoded.get(stem)!;const a=Math.round(start*d.rate),z=Math.round(end*d.rate);
 if(d.rate!==rate)throw Error('Expected 44.1 kHz stems');
 cuts.push({key,label,stem,start,end,fadeMs:8});
 await saveSound(key,label,d.left.slice(a,z),d.right.slice(a,z),{name:`When It's Cold I'd Like To Die · ${stem}`,assetId:sourceIds[stem],hash:hashes.get(stem),rate,startFrame:a,endFrame:z});
}
// Phrases start on source beats: the hook on its downbeat, the answer 2.5 beats before its own (a pickup).
const phrases={hook:{label:'Original vocal hook',from:0,to:16,pickup:0},answer:{label:'Vocal answer phrase',from:17.5,to:31,pickup:2.5}} as const;
const anchors:Record<string,ClipAnchor[]>={};
for (const [key,phrase] of Object.entries(phrases)) {
 await cut(key,phrase.label,'vocals',atBeat(phrase.from),atBeat(phrase.to));
 const decoded=decodeWav(audio.get(uuid(key))!),beats=(phrase.to-phrase.from)*beatRatio;
 const uniform:ClipAnchor[]=[{source:0,beat:0},{source:decoded.left.length/rate,beat:beats}];
 const attacks=suggestAttacks(decoded,0,decoded.left.length).map(f=>f/rate);
 const snapped=smartSnap(attacks,uniform,bpm,{grid:.5,toleranceSeconds:.07});
 anchors[key]=snapped.anchors;cuts.at(-1)!.grid={sourceBpm,sourceBeats:[phrase.from,phrase.to],beatRatio,anchors:snapped.anchors,snapped:snapped.snapped,skipped:snapped.skipped};
}

await cut('opening','Opening syllable','vocals',78.65,79.17);
await cut('lift','Vocal lift','vocals',79.17,79.71);
await cut('reach','Vocal reach','vocals',79.71,81.11);
await cut('turn','Vocal turn','vocals',81.11,82.44);
await cut('soft','Soft vowel','vocals',82.44,83.33);
await cut('tail','Held vowel tail','vocals',83.68,86.32);
await cut('answer-short','Answer accent','vocals',91.75,93.13);
await cut('answer-tail','Answer tail','vocals',93.61,95.25);
await cut('air','Instrumental air','other',78.65,82.65);
await cut('glint','Instrumental glint','other',80.1,80.8);
// A deterministic original drum break for the alternative chop tab: no remote sample bank.
let seed=32791;const noise=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2147483648-1;};
const drum=new Float32Array(Math.round(rate*bar));
function drumHit(step:number,type:string,gain:number){const start=Math.round(step/16*bar*rate),len=Math.round(rate*(type==='kick'?.32:type==='snare'?.2:.045));let phase=0,previous=0;
 for(let i=0;i<len&&start+i<drum.length;i++){const t=i/rate,n=noise();let y=0;
 if(type==='kick'){phase+=2*Math.PI*(48+120*Math.exp(-t*40))/rate;y=Math.sin(phase)*Math.exp(-t*16)+n*Math.exp(-t*180)*.15;}
 else if(type==='snare')y=n*Math.exp(-t*25)*.65+Math.sin(2*Math.PI*185*t)*Math.exp(-t*32)*.3;
 else y=(n-previous)*Math.exp(-t*100)*.24;previous=n;drum[start+i]+=y*gain;}}
for(const s of [0,10])drumHit(s,'kick',.65);for(const s of [4,12])drumHit(s,'snare',.48);for(let s=0;s<16;s+=2)drumHit(s,'hat',s%4?.4:.25);drumHit(15,'snare',.12);
await saveSound('break','Original two-step break',drum,drum.slice());
const project=newProject();project.name="When It's Cold — Liquid Dawn";project.sessionId='When-Its-Cold-Liquid-Dawn';project.revision=1;project.bpm=bpm;project.tabs=[];project.clips=[];project.bindings=[];project.assetIds=assets.map(a=>a.id);
const header=(description:string)=>tempoHeader(bpm)+`// Liquid Dawn · ${description}\n// One cycle = four beats. Play this tab alone to audition.\n`;
function tab(id:string,name:string,description:string,code:string){project.tabs.push({id:`dawn-${id}`,name,code:header(description)+code.trim()+'\n',anchors:[],color:palette[project.tabs.length%palette.length]});}
const chords='<[e3,g3,b3,d4] [c3,e3,g3,b3] [g2,b3,d4,a4] [d3,g3,a3,c4]>';
tab('march','01 · March','Half-time footsteps; the snare falls on beat three.',`
$kick: s("sbd ~ sbd ~").gain(slider(.31,0,.6,.01)).orbit(0)
$snare: s("~ ~ white ~").hpf(900).lpf(4400).attack(.002).decay(.16).sustain(0).release(.035).gain(.16).room(.12).orbit(1)
$ghost: s("~ ~ ~ [~ white ~ white]").hpf(1600).lpf(4800).decay(.035).sustain(0).gain(.035).orbit(1)
`);
tab('drums','02 · Liquid Drums','Two-step backbone. Kick steps 0/10; snare steps 4/12.',`
$kick: s("sbd ~ ~ ~ ~ ~ ~ ~ ~ ~ sbd ~ ~ ~ ~ ~").gain(slider(.4,0,.65,.01)).orbit(0)
$snare: s("~ white ~ white").hpf(850).lpf(8500).attack(.001).decay(.145).sustain(0).release(.035).gain(.27).room(.07).orbit(1)
$body: note("~ d3 ~ d3").s("triangle").decay(.075).sustain(0).release(.02).gain(.1).orbit(1)
$ghost: s("< [~ ~ ~ ~ ~ ~ ~ white ~ ~ ~ ~ ~ ~ white ~] [~ ~ ~ ~ ~ ~ white ~ ~ ~ ~ ~ ~ ~ white white] >").hpf(1500).lpf(6500).decay(.045).sustain(0).gain(.045).orbit(1)
`);
tab('hats','03 · Hats & Shuffles','A soft eighth-note pulse with quieter sixteenth-note shuffles.',`
$hat: s("white*8").hpf(7800).lpf(12500).attack(.001).decay(.025).sustain(0).release(.006).gain(".042 .062 .035 .067 .042 .06 .035 .072").orbit(2)
$shuffle: s("~ white ~ white ~ ~ white ~ ~ white ~ white ~ ~ white white").hpf(6200).lpf(10000).decay(.013).sustain(0).gain(slider(.021,0,.07,.001)).pan(".35 .65").orbit(2)
`);
tab('sub','04 · Warm Sub','Four-bar root changes: E, C, G, D. Keep this centered.',`
$sub: note("<e1 c2 g1 d2>".slow(4)).s("sine").attack(.035).decay(.2).sustain(.8).release(.18).gain(slider(.25,0,.4,.01)).lpf(160).orbit(3)
`);
tab('saws','05 · Wide Saws','Em7 / Cmaj7 / Gadd9 / D7sus4. Brightness is the first slider.',`
$chords: note("${chords}".slow(4)).s("supersaw").unison(5).detune(.2).spread(.8)
 .attack(.35).decay(.5).sustain(.65).release(.85).hpf(230).lpf(slider(2400,500,6500,50).mul(signal(t => Math.min(1, .35 + Math.max(0,t-8)/12))))
 .gain(slider(.085,0,.16,.005)).room(.35).roomsize(3).orbit(4)
`);
tab('ambient','06 · Ambient Bed','Original instrumental air with soft sustained harmony.',`
$air: s("${names.air}").slow(4).speed(.5).hpf(450).lpf(2700).attack(.15).release(.4).gain(slider(.12,0,.3,.01).mul(signal(t => Math.max(0,Math.min(1,(t+1)/8,(128-t)/8))))).room(.65).roomsize(5).orbit(5)
$pad: note("${chords}".slow(4)).s("triangle").attack(.8).release(1.2).lpf(1600).hpf(220).gain(signal(t => .055*Math.max(0,Math.min(1,(t+1)/8,(128-t)/8)))).room(.65).orbit(5)
`);
for (const [id,key,label] of [['phrases','hook','07 · Vocal Hook'],['answer','answer','07b · Vocal Answer']]) {
 tab(id,label,'The original phrase; its timeline clips carry the beat anchors (right-click a clip → Align…).',`
$voice: s("${names[key]}").slow(8)
 .hpf(160).lpf(10500).gain(slider(.57,0,.9,.01)).room(.22).roomsize(2.5)
 .delay(.12).delaytime(.348837).delayfeedback(.22).orbit(6)
`);
}
tab('chops','08 · Vocal Syncopation','Change the named sounds, then move the 1s in their four-bar rhythm.',`
const opening = s("${names.opening}")
const lift = s("${names.lift}")
const turn = s("${names.turn}")
const soft = s("${names.soft}")
const answer = s("${names['answer-short']}")
// 1 triggers a chop; 0 is a rest. Each bracket is one 16-step bar.
// The snare has space at steps 4 and 12. cut(11) prevents overlapping chops.
$chops: stack(
 opening.struct("< [0 0 1 0 0 0 0 0 0 0 0 0 0 0 0 0] [0] [0 0 1 0 0 0 0 0 0 0 0 0 0 0 0 0] [0 0 0 0 0 0 0 0 0 1 0 0 0 0 0 0] >"),
 lift.struct("< [0 0 0 0 0 0 0 1 0 0 0 0 0 0 0 0] [0 0 0 0 0 0 0 0 0 0 0 1 0 0 0 0] [0] [0 1 0 0 0 0 0 0 0 0 0 0 0 0 [1 1] 0] >"),
 turn.struct("< [0] [0 1 0 0 0 0 0 0 0 0 0 0 0 0 0 0] [0] [0] >"),
 soft.struct("< [0 0 0 0 0 0 0 0 0 0 1 0 0 0 0 0] [0 0 0 0 0 0 1 0 0 0 0 0 0 0 0 0] [0 0 0 0 0 0 0 0 0 0 1 0 0 0 0 0] [0 0 0 0 0 0 1 0 0 0 0 0 0 0 0 0] >"),
 answer.struct("< [0] [0] [0 0 0 0 0 0 0 1 0 0 0 0 0 0 0 0] [0] >")
).cut(11).clip(3).attack(.006).release(.018).hpf(240).lpf(8500)
 .gain(slider(.43,0,.8,.01)).pan(".44 .56").room(.2).roomsize(2.2)
 .delay(.2).delaytime(.261628).delayfeedback(.22).orbit(7)
`);
tab('sparkle','09 · Sparkle','An understated upper melody that leaves room for the vocal.',`
$spark: note("< [b4 ~ d5 ~ ~ g4 ~ ~] [g4 ~ b4 ~ ~ e5 ~ ~] [a4 ~ b4 ~ ~ d5 ~ ~] [a4 ~ g4 ~ ~ e5 ~ ~] >".slow(4)).s("triangle")
 .attack(.006).decay(.22).sustain(.08).release(.25).hpf(700).lpf(5500).gain(slider(.09,0,.2,.005)).room(.4).delay(.24).delaytime(.523256).delayfeedback(.3).orbit(8)
$glint: s("${names.glint}").slow(4).speed(2).hpf(1700).gain(.045).room(.4).orbit(8)
`);
tab('transitions','10 · Transitions','An eight-bar rise; place at the end of a build.',`
$swell: s("${names.tail}").slow(8).rev().speed(-.65).hpf(700).lpf(4500).gain(.13).room(.65).orbit(9)
$rise: s("white*4").attack(.05).decay(.16).sustain(0).hpf(2500).lpf(saw.range(3000,11000).slow(8)).gain(saw.range(.004,.055).slow(8)).pan(".3 .7").room(.2).orbit(9)
`);
tab('reese','ALT · Reese Bass','Substitute for Warm Sub; a restrained, darker saw bass.',`
$reese: note("<e2 c2 g1 d2>".slow(4)).s("supersaw").unison(3).detune(.16).spread(.2).attack(.05).release(.16).hpf(45).lpf(slider(650,160,2400,20)).gain(.12).orbit(3)
`);
tab('pluck','ALT · Trance Pluck','Substitute for Sparkle for a brighter rhythmic lift.',`
$pluck: note("< [e4 b4 g4 b4]*2 [c4 g4 e4 g4]*2 [g4 d5 b4 d5]*2 [d4 a4 g4 a4]*2 >".slow(4)).s("sawtooth").attack(.003).decay(.13).sustain(0).release(.09).hpf(450).lpf(slider(3200,600,7500,50)).lpenv(2).gain(.1).room(.25).delay(.28).delaytime(.261628).delayfeedback(.3).orbit(8)
`);
tab('breaks','ALT · Chopped Breaks','Substitute for Liquid Drums. This is a locally synthesized break.',`
// Sixteen slices, rearranged every second bar; never depends on a remote sample bank.
$break: s("${names.break}").slice(16,"<0 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15>".fast(16))
 .gain(slider(.64,0,1,.01)).hpf(35).room(.06).orbit(1)
`);
// Keep the alternate break deterministic but vary its fourth bar.
project.tabs.at(-1)!.code=project.tabs.at(-1)!.code.replace('"<0 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15>".fast(16)', '"< [0 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15] [0 1 2 3 4 5 7 6 8 9 10 11 12 13 15 14] >"');
const lanes=[['march','March / drums'],['hats','Hats & shuffles'],['sub','Sub bass'],['saws','Wide saw chords'],['ambient','Atmosphere'],['phrases','Vocal hook'],['answer','Vocal answer'],['chops','Vocal rhythm'],['sparkle','Melody'],['transitions','Transitions']];
project.tracks=lanes.map(([id,name])=>({id:`lane-${id}`,name,muted:false}));
let serial=0;
function clip(tabId:string,lane:string,start:number,length:number,offset=0){project.clips.push({id:`dawn-clip-${++serial}`,tabId:`dawn-${tabId}`,trackId:`lane-${lane}`,start,length,sourceOffset:offset,muted:false});}
clip('ambient','ambient',0,128);
clip('march','march',0,32);clip('march','march',64,8);clip('march','march',112,8);
clip('drums','march',32,32);clip('drums','march',80,32);
clip('hats','hats',16,48);clip('hats','hats',76,40);
clip('sub','sub',24,40,8);clip('sub','sub',80,40);
clip('saws','saws',24,40,8);clip('saws','saws',80,40,32);
// Each phrase clip starts so its source downbeat lands on a bar line; the answer's pickup leads in from the previous bar.
for (const [id,key,bars] of [['phrases','hook',[8,48,64,104,112]],['answer','answer',[16,56,72,96,120]]] as const) {
 const phrase=phrases[key],lead=phrase.pickup*beatRatio/4,length=(phrase.to-phrase.from)*beatRatio/4;
 for (const bar of bars) {clip(id,id,bar-lead,length);delete project.clips.at(-1)!.sourceOffset;Object.assign(project.clips.at(-1)!,{takeId:uuid(key),playback:'once',anchors:anchors[key].map(a=>({...a}))});}
}
clip('chops','chops',24,24);clip('chops','chops',80,16);
clip('sparkle','sparkle',40,24,8);clip('sparkle','sparkle',88,32,8);
clip('transitions','transitions',24,8);clip('transitions','transitions',72,8);clip('transitions','transitions',104,8);
project.activeTabId='dawn-phrases';
const parsed=parseProject(project);await writeFile(join(out,'project.json'),JSON.stringify(parsed,null,2));await writeFile(join(out,'assets.json'),JSON.stringify(assets,null,2));await writeFile(join(out,'cuts.json'),JSON.stringify(cuts,null,2));
const files:Record<string,Uint8Array>={'project.json':strToU8(JSON.stringify(parsed)),'manifest.json':strToU8(JSON.stringify({version:1,missing:[],externalUrls:[]}))};
for(const a of assets){files[`assets/${a.id}.json`]=strToU8(JSON.stringify(a));files[`assets/${a.id}.wav`]=audio.get(a.id)!;files[`assets/${a.id}.original.wav`]=audio.get(a.id)!;}
await writeFile(join(out,'Liquid-Dawn.strudel.zip'),zipSync(files,{level:0}));
await writeFile(join(out,'README.md'),`# When It's Cold — Liquid Dawn\n\n172 BPM · 128 bars · ${Math.round(128*bar)} seconds plus effect tail.\n\nOpen this project in local Studio and press Composition Play. Select any named tab and press tab Play to audition it alone. Your earlier composition is separate.\n\n## Explore the sounds\n\n- Vocal Syncopation: change named chops or move the 1s in their rhythms (0 means rest). Four bracketed bars alternate.\n- Vocal Hook / Vocal Answer: the original phrases, placed as one-shot clips whose anchors map source beats (about 109 BPM) onto the 172 BPM grid at half time, with attacks Smart-snapped to eighths. Right-click a clip → Align… to move syllables, refit bars or re-snap; the audio files stay untouched.\n- Wide Saws: start with the brightness slider, then level.\n- Reese Bass replaces Warm Sub; Trance Pluck replaces Sparkle; Chopped Breaks replaces Liquid Drums. Remove/mute the original lane clip before placing an alternative to avoid doubling the part.\n- Each sample can be opened through Sample Catalogue → Liquid Dawn → Edit sample.\n\n## Arrangement\n\nBars 1–16: cinematic march; 17–32: build; 33–64: first drop; 65–80: vocal breakdown; 81–112: final drop; 113–128: outro.\n\n## Files\n\nLiquid-Dawn.strudel.zip is a portable project backup with all required audio. Liquid-Dawn.wav is the full mix preview (created by Chrome verification). cuts.json records source times, boundary fades and each phrase's measured grid and anchors. samples/ contains individually usable WAVs.\n\n## Sources\n\nVocal and instrumental crops: your local StemKit separation of When It's Cold I'd Like To Die. Drums are original synthesis because the separated drum stem is near silent. Working crops use 8 ms boundary fades; sources are untouched.\n\nReference videos: https://www.youtube.com/watch?v=3h1vM0lIrpM and https://www.youtube.com/watch?v=dcmwqqzJubA (video playback was unavailable during research). Technical references: https://strudel.cc/learn/samples/ and https://strudel.cc/learn/effects/.\n\nRebuild: node --import tsx scripts/build-liquid-dawn.ts /path/to/stems .local/liquid-dawn\n`);
console.log(JSON.stringify({project:parsed.name,tabs:parsed.tabs.length,clips:parsed.clips.length,samples:assets.length,audioMB:[...audio.values()].reduce((n,b)=>n+b.length,0)/1e6,out}));
