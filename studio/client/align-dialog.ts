import type {Asset,Clip} from '../shared/model';
import {wavInfo} from '../shared/wav';
import {clipAnchors,validateAnchors,sourceAtBeat,beatAtSource,endBeat,fitToBeats,smartSnap,withAnchors,type ClipAnchor} from '../shared/clip-timing';
import {audioBlob} from './storage/workspace';
import {audioJob} from './take-buffers';
import type {Engine} from './engine';
import './align-dialog.css';
type Analysis={rate:number;duration:number;peaks:Float32Array;attacks:number[];region:[number,number]};
type Draft={anchors:ClipAnchor[];length:number};
const STEP=.25; // sixteenth notes, in beats
const ANALYSIS_SECONDS=180;
/** One dialog for audio clip timing: anchors, bar fits and Smart snap, auditioned with the song. Apply changes the clip only. */
export class AlignDialog {
 private dialog=document.createElement('dialog');
 private clip?:Clip;private asset?:Asset;private bpm=120;private draft?:Draft;private analysis?:Analysis;
 private epoch=0;private selected?:number;private drag?:number;private timer?:ReturnType<typeof setTimeout>;
 private playing=false;private original=false;private applying=false;private animation?:number;
 constructor(private engine:Engine,private commit:(clip:Clip)=>void){
  this.dialog.className='align-dialog';this.dialog.setAttribute('aria-label','Align');
  this.dialog.innerHTML=`<h2>Align</h2><p data-title></p>
<div class="align-toolbar"><button type="button" data-play>Play with song</button><div role="group" aria-label="Compare timing"><button type="button" data-mode="original" aria-pressed="false">Original</button><button type="button" data-mode="aligned" aria-pressed="true">Aligned</button></div><label><input type="checkbox" data-suggestions checked> Suggest attacks</label></div>
<div class="align-toolbar"><span>Fit phrase to</span><button type="button" data-fit="1">1 bar</button><button type="button" data-fit="2">2 bars</button><button type="button" data-fit="4">4 bars</button><button type="button" data-fit="8">8 bars</button><span class="align-spacer"></span><label>Grid <select data-snap-grid aria-label="Smart snap grid"><option value="1">Beat</option><option value=".5" selected>1/8</option><option value=".25">1/16</option></select></label><button type="button" data-snap>Smart snap</button><button type="button" data-reset>Reset</button></div>
<p>Drag an attack or anchor onto a beat. Double-click to add an anchor. Alt: free timing · Arrows: 1/16 note · Delete: remove anchor.</p>
<div class="align-scroll"><div class="align-grid" tabindex="0" aria-label="Waveform and beat anchors"><canvas></canvas><div class="align-ruler"></div><div class="align-interval-error" hidden></div><div class="align-markers"></div><div class="align-playhead" hidden></div></div></div>
<p data-status role="status">Loading audio…</p>
<div class="align-toolbar"><span data-summary></span><span class="align-spacer"></span><button type="button" data-cancel>Cancel</button><button type="button" data-apply class="primary">Apply</button></div>`;
  document.body.append(this.dialog);
  this.el('[data-cancel]').onclick=()=>this.dialog.close();
  this.dialog.addEventListener('cancel',e=>{if(this.applying)e.preventDefault();});
  this.dialog.addEventListener('close',()=>{this.epoch++;clearTimeout(this.timer);this.stop();this.analysis=undefined;this.draft=undefined;});
  this.el('[data-play]').onclick=()=>{if(this.playing||this.engine.busy){this.stop();}else{this.playing=true;this.el('[data-play]').textContent='Stop';void this.preview();}};
  for(const mode of ['original','aligned'])this.el(`[data-mode=${mode}]`).onclick=()=>{this.original=mode==='original';this.paintModes();if(this.playing)void this.preview();};
  this.el('[data-suggestions]').onchange=()=>this.draw();
  for(const button of this.dialog.querySelectorAll<HTMLButtonElement>('[data-fit]'))button.onclick=()=>this.fit(Number(button.dataset.fit));
  this.el('[data-snap]').onclick=()=>this.snap();
  this.el('[data-reset]').onclick=()=>{if(!this.draft||!this.clip)return;const first=this.draft.anchors[0];this.draft={anchors:[{source:first.source,beat:first.beat}],length:this.clip.length};this.selected=undefined;this.changed();this.status('Reset to the original timing.');};
  this.el('[data-apply]').onclick=()=>void this.apply();
  const grid=this.el('.align-grid');
  grid.addEventListener('pointerdown',e=>{
   if(this.applying||!this.draft)return;const marker=(e.target as HTMLElement).closest<HTMLElement>('[data-source]');if(!marker)return;
   const source=Number(marker.dataset.source);e.preventDefault();this.selected=source;this.drag=source;
   if(!this.draft.anchors.some(a=>a.source===source))this.add(source);
   grid.setPointerCapture(e.pointerId);this.draw();
  });
  grid.addEventListener('pointermove',e=>{if(this.drag===undefined||!this.draft)return;this.move(this.drag,this.pointerBeat(e),e.altKey);});
  const end=()=>{if(this.drag!==undefined){this.drag=undefined;this.schedule();}};grid.addEventListener('pointerup',end);grid.addEventListener('pointercancel',end);
  grid.addEventListener('dblclick',e=>{if(this.applying||!this.draft||(e.target as HTMLElement).closest('[data-source]'))return;const beat=this.pointerBeat(e),source=sourceAtBeat(this.draft.anchors,this.bpm,beat);if(source===undefined){this.status('Add anchors after the phrase starts.');return;}this.add(source);this.selected=source;this.changed();});
  grid.addEventListener('focusin',e=>{const marker=(e.target as HTMLElement).closest<HTMLElement>('[data-source]');if(marker)this.selected=Number(marker.dataset.source);});
  grid.addEventListener('keydown',e=>{
   if(this.applying||this.selected===undefined||!this.draft)return;
   const source=this.selected,anchor=this.draft.anchors.find(a=>a.source===source);
   if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();if(!anchor||this.draft.anchors.length<2)return;this.draft.anchors=this.draft.anchors.filter(a=>a.source!==source);this.selected=undefined;this.changed();grid.focus();}
   if(['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();if(!anchor)this.add(source);const beat=anchor?.beat??beatAtSource(this.draft.anchors,this.bpm,source)!;this.move(source,beat+(e.key==='ArrowLeft'?-1:1)*(e.altKey?.01:STEP),e.altKey);this.schedule();this.el(`[data-source="${source}"]`)?.focus();}
  });
 }
 private el<T extends HTMLElement=HTMLElement>(selector:string){return this.dialog.querySelector<T>(selector)!;}
 private status(text:string){this.el('[data-status]').textContent=text;}
 async open(clip:Clip,asset:Asset,bpm:number){
  this.stop();this.epoch++;const epoch=this.epoch;this.clip={...clip};this.asset=asset;this.bpm=bpm;this.analysis=undefined;this.selected=undefined;this.drag=undefined;this.original=false;this.paintModes();
  this.draft={anchors:clipAnchors(clip).map(a=>({...a})),length:clip.length};
  this.el('.align-markers').replaceChildren();this.el('canvas').setAttribute('width','0');this.status('Loading audio…');this.el<HTMLButtonElement>('[data-apply]').disabled=true;
  this.el('[data-title]').textContent=`${asset.label??'Audio'} · ${bpm} BPM`;
  this.dialog.showModal();
  try{
   if(asset.format!=='wav')throw new Error('Save a WAV phrase in the sample editor first.');
   const bytes=await(await audioBlob(asset.id)).arrayBuffer();if(epoch!==this.epoch)return;
   const info=wavInfo(new Uint8Array(bytes)),end=Math.min(info.frames,Math.round(ANALYSIS_SECONDS*info.rate));
   const result=await audioJob<{rate:number;duration:number;peaks:Float32Array;attacks:number[]}>({kind:'analyze',start:0,end,bins:16384,attacks:true},bytes);if(epoch!==this.epoch)return;
   this.analysis={...result,region:[0,end/result.rate]};
   this.draw();if(this.validate())this.status('Hollow markers are suggested attacks. Drag the syllables you want to lock to the groove, or use Smart snap.');
  }catch(error){if(epoch===this.epoch)this.report(error);}
 }
 private get duration(){return this.analysis?.duration??this.asset?.duration??0;}
 private origin(){return (this.clip?.start??0)*4;}
 private displayBeats(){const {anchors,length}=this.draft!,window=length*4,end=endBeat(anchors,this.bpm,this.duration);return Math.max(1,window+(end>window+1e-9?4:0),anchors[anchors.length-1].beat+1);}
 private label(beat:number){return (beat+this.origin()+1).toFixed(2);}
 private add(source:number){if(!this.draft||this.draft.anchors.length>=128||this.draft.anchors.some(a=>a.source===source))return;const beat=beatAtSource(this.draft.anchors,this.bpm,source);if(beat===undefined)return;this.draft.anchors.push({source,beat});this.draft.anchors.sort((a,b)=>a.source-b.source);}
 private pointerBeat(e:MouseEvent){const rect=this.el('.align-grid').getBoundingClientRect(),beats=this.displayBeats();return Math.max(0,Math.min(beats,(e.clientX-rect.left)/rect.width*beats));}
 private move(source:number,beat:number,free:boolean){
  if(!this.draft)return;const i=this.draft.anchors.findIndex(a=>a.source===source);if(i<0)return;
  const origin=this.origin(),value=Math.max(0,free?beat:Math.round((beat+origin)/STEP)*STEP-origin),previous=this.draft.anchors[i-1],next=this.draft.anchors[i+1];
  if((previous&&value<=previous.beat)||(next&&value>=next.beat)){this.status('Anchors cannot cross.');return;}
  this.draft.anchors[i].beat=value;this.original=false;this.paintModes();this.draw();this.validate();
 }
 private fit(bars:number){
  if(!this.draft||!this.clip)return;
  try{const fitted=fitToBeats({start:this.clip.start,length:this.draft.length,anchors:this.draft.anchors},this.duration,this.bpm,bars*4);this.draft={anchors:fitted.anchors,length:fitted.length};this.selected=undefined;this.changed();this.status(`Fitted the phrase to ${bars} ${bars===1?'bar':'bars'} (${fitted.length*4} beats). Play with the song to check it.`);}
  catch(error){this.report(error);}
 }
 private snap(){
  if(!this.draft||!this.analysis)return;
  const grid=Number(this.el<HTMLSelectElement>('[data-snap-grid]').value) as 1|.5|.25,result=smartSnap(this.analysis.attacks,this.draft.anchors,this.bpm,{grid});
  this.draft.anchors=result.anchors;this.changed();
  this.status(result.snapped?`${result.snapped} ${result.snapped===1?'attack':'attacks'} snapped to the grid${result.skipped?`, ${result.skipped} skipped (stretch limit)`:''}. Play with the song to check the groove.`:'No attacks close enough to a grid line. Try a coarser grid or drag attacks by hand.');
 }
 private validate(){
  this.el('.align-interval-error').hidden=true;
  try{if(!this.draft||!this.analysis)throw new Error('Wait for the waveform.');validateAnchors(this.draft.anchors,this.duration,this.bpm);this.el<HTMLButtonElement>('[data-apply]').disabled=this.applying;if(this.el('[data-status]').textContent?.startsWith('Interval'))this.status('Anchor aligned. Play with the song to check its groove.');return true;}
  catch(error){this.el<HTMLButtonElement>('[data-apply]').disabled=true;const interval=Number(/Interval (\d+)/.exec((error as Error).message)?.[1]);if(interval&&this.draft){const a=this.draft.anchors[interval-1],b=this.draft.anchors[interval],total=this.displayBeats(),region=this.el('.align-interval-error');region.hidden=false;region.style.left=`${a.beat/total*100}%`;region.style.width=`${(b.beat-a.beat)/total*100}%`;}this.report(error);return false;}
 }
 private changed(){this.original=false;this.paintModes();this.draw();if(this.validate())this.schedule();}
 private schedule(){clearTimeout(this.timer);if(this.validate()&&this.playing)this.timer=setTimeout(()=>void this.preview(),250);}
 private paintModes(){for(const mode of ['original','aligned'])this.el(`[data-mode=${mode}]`).setAttribute('aria-pressed',String(this.original===(mode==='original')));}
 private draftClip():Clip{return withAnchors({...this.clip!,length:this.draft!.length},this.draft!.anchors);}
 private async preview(){const epoch=this.epoch;
  try{if(!this.analysis||!this.draft||!this.clip)throw new Error('Wait for the waveform.');const clip=this.original?this.clip:this.draftClip(),key=JSON.stringify(clip);
   this.status('Preparing audio…');while(this.engine.busy&&this.playing&&epoch===this.epoch)await new Promise(resolve=>setTimeout(resolve,30));
   if(!this.playing||epoch!==this.epoch||key!==JSON.stringify(this.original?this.clip:this.draftClip()))return;
   await this.engine.previewClip(clip);
   if(epoch===this.epoch&&this.playing){this.status(`${this.original?'Original':'Aligned'} with song. Prepared changes enter at the next loop.`);this.animate();}
  }catch(error){if((error as Error).name!=='AbortError'&&epoch===this.epoch){this.stop();this.report(error);}}
 }
 private animate(){
  if(this.animation!==undefined)cancelAnimationFrame(this.animation);
  const tick=()=>{if(!this.playing||!this.draft||!this.clip)return;
   const beat=(this.engine.timelinePosition-this.clip.start)*4,total=this.displayBeats();
   const head=this.el('.align-playhead');head.hidden=!this.engine.started||beat<0||beat>total;head.style.left=`${beat/total*100}%`;
   this.animation=requestAnimationFrame(tick);
  };tick();
 }
 private stop(){if(this.animation!==undefined)cancelAnimationFrame(this.animation);this.animation=undefined;this.el('.align-playhead').hidden=true;if(this.playing)this.engine.stop();this.playing=false;this.el('[data-play]').textContent='Play with song';}
 private async apply(){if(this.applying||!this.validate())return;this.stop();this.applying=true;
  for(const b of this.dialog.querySelectorAll<HTMLButtonElement>('button'))b.disabled=true;
  try{this.commit(this.draftClip());this.dialog.close();}
  catch(error){this.report(error);}finally{this.applying=false;for(const b of this.dialog.querySelectorAll<HTMLButtonElement>('button'))b.disabled=false;this.validate();}
 }
 private report(error:unknown){if((error as Error).name!=='AbortError')this.status(error instanceof Error?error.message:String(error));}
 private draw(){
  if(!this.draft||!this.analysis)return;const {anchors}=this.draft,beats=this.displayBeats(),bpm=this.bpm,[regionStart,regionEnd]=this.analysis.region;
  const grid=this.el('.align-grid'),width=Math.min(16000,Math.max(this.el('.align-scroll').clientWidth-24,760,beats*64));grid.style.width=`${width}px`;grid.dataset.beats=String(beats);
  const canvas=this.el<HTMLCanvasElement>('canvas');canvas.width=Math.ceil(width);canvas.height=180;
  const ctx=canvas.getContext('2d')!,peaks=this.analysis.peaks,bins=peaks.length/2;ctx.strokeStyle='#658acb';ctx.beginPath();
  for(let x=0;x<canvas.width;x++){const from=sourceAtBeat(anchors,bpm,x/canvas.width*beats),to=sourceAtBeat(anchors,bpm,(x+1)/canvas.width*beats);if(from===undefined||to===undefined||from>=regionEnd)continue;const a=Math.max(0,Math.floor((from-regionStart)/(regionEnd-regionStart)*bins)),b=Math.min(bins,Math.max(a+1,Math.ceil((to-regionStart)/(regionEnd-regionStart)*bins)));let min=0,max=0;for(let i=a;i<b;i++){min=Math.min(min,peaks[i*2]);max=Math.max(max,peaks[i*2+1]);}ctx.moveTo(x,90-max*80);ctx.lineTo(x,90-min*80);}ctx.stroke();
  const origin=this.origin(),clipEnd=this.draft.length*4;
  this.el('.align-ruler').innerHTML=Array.from({length:Math.ceil(beats*4)+1},(_,i)=>{const tick=i+origin*4;if(i/4>beats)return '';return `<span class="${tick%16===0?'beat':''}${i/4===clipEnd?' clip-end':''}" style="left:${i/4/beats*100}%">${tick%16===0?tick/16+1:''}</span>`;}).join('');
  const suggestions=this.el<HTMLInputElement>('[data-suggestions]').checked?this.analysis.attacks.filter(source=>!anchors.some(a=>a.source===source)).flatMap(source=>{const beat=beatAtSource(anchors,bpm,source);return beat===undefined||beat>beats?[]:[{source,beat,active:false}];}):[];
  this.el('.align-markers').innerHTML=[...anchors.map(a=>({...a,active:true})),...suggestions].map(a=>`<button type="button" class="align-anchor ${a.active?'active':'suggested'}" data-source="${a.source}" aria-pressed="${a.source===this.selected}" aria-label="${a.active?'Anchor':'Suggested attack'} at beat ${this.label(a.beat)}" style="left:${a.beat/beats*100}%"><span>${a.active?(a.source===anchors[0].source?'│':'◆'):'◇'}</span></button>`).join('');
  this.el('[data-summary]').textContent=`${anchors.length} ${anchors.length===1?'anchor':'anchors'} · ${this.draft.length*4} beats`;
 }
}
