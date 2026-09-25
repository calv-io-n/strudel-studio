import type {Asset,Clip} from '../shared/model';
import {audioBlob} from './storage/workspace';
import {clipAnchors,sourceAtBeat} from '../shared/clip-timing';
import {audioJob} from './take-buffers';
type Peaks={peaks:Float32Array;duration:number};
/** Decode visible audio clips off the main thread, one asset at a time; retain only small peaks. */
export class ClipWaveforms {
 private cache=new Map<string,Promise<Peaks>>();
 private queue:Promise<unknown>=Promise.resolve();
 private observer:IntersectionObserver;
 private clips=new Map<string,Clip>();private assets=new Map<string,Asset>();private bpm=120;
 constructor(private root:HTMLElement){this.observer=new IntersectionObserver(entries=>{for(const e of entries)if(e.isIntersecting){this.observer.unobserve(e.target);void this.draw(e.target as HTMLCanvasElement);}}, {root,rootMargin:'100px'});}
 render(clips:Clip[],assets:Asset[],bpm:number){this.observer.disconnect();this.clips=new Map(clips.map(c=>[c.id,c]));this.assets=new Map(assets.map(a=>[a.id,a]));this.bpm=bpm;for(const canvas of this.root.querySelectorAll<HTMLCanvasElement>('[data-clip-waveform]'))this.observer.observe(canvas);}
 private load(asset:Asset){const key=asset.id+':'+(asset.contentHash??asset.createdAt);let result=this.cache.get(key);if(result)return result;
 result=this.queue.then(async()=>{if(asset.missing)throw Error('Sample missing');const bytes=await(await audioBlob(asset.id)).arrayBuffer();if(asset.format!=='wav')throw Error('Waveform requires WAV audio');return await audioJob<Peaks>({kind:'analyze',bins:16384},bytes);});
 this.queue=result.catch(()=>{});this.cache.set(key,result);if(this.cache.size>64)this.cache.delete(this.cache.keys().next().value!);result.catch(()=>this.cache.delete(key));return result;}
 private async draw(canvas:HTMLCanvasElement){const clip=this.clips.get(canvas.dataset.clipWaveform!),asset=this.assets.get(clip?.takeId??'');if(!clip||!asset)return;const bpm=this.bpm,anchors=clipAnchors(clip);
 try{const {peaks,duration}=await this.load(asset);if(!canvas.isConnected)return;const width=Math.min(2048,Math.max(16,Math.round(canvas.clientWidth))),height=32;canvas.width=width;canvas.height=height;const ctx=canvas.getContext('2d')!;ctx.clearRect(0,0,width,height);ctx.strokeStyle=getComputedStyle(canvas).color;ctx.beginPath();const bins=peaks.length/2;
 for(let x=0;x<width;x++){const from=sourceAtBeat(anchors,bpm,x/width*clip.length*4),to=sourceAtBeat(anchors,bpm,(x+1)/width*clip.length*4);if(from===undefined||to===undefined||from>=duration)continue;const a=Math.max(0,from),b=Math.min(duration,to);const first=Math.max(0,Math.floor(a/duration*bins)),last=Math.min(bins,Math.max(first+1,Math.ceil(b/duration*bins)));let min=0,max=0;for(let i=first;i<last;i++){min=Math.min(min,peaks[i*2]);max=Math.max(max,peaks[i*2+1]);}ctx.moveTo(x+.5,16-Math.min(1,max)*15);ctx.lineTo(x+.5,16-Math.max(-1,min)*15);}
 ctx.stroke();canvas.dataset.ready='true';canvas.setAttribute('aria-label',`Waveform for ${asset.label??'sample'}`);
 }catch(error){if(canvas.isConnected){canvas.title=(error as Error).message;canvas.dataset.unavailable='true';canvas.setAttribute('aria-label','Waveform unavailable');}}
 }
}
