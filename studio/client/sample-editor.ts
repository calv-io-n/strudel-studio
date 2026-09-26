import { beatSeconds, snapToBeat } from '../shared/sample-alignment';
import './sample-editor.css';
import type { Asset } from '../shared/model';
import { SOURCE_LIMIT, validateRegion } from '../shared/sample-edit';
import { audioBlob, importSample } from './storage/workspace';
import { prepareAudio } from './import-audio';

type Source = { rate: number; channels: number; frames: number; hash: string; peaks: Float32Array };
type Pending = { resolve: (value: any) => void; reject: (error: Error) => void };

/** A temporary source workspace; only extracted snippets enter the sound library. */
export class SampleEditor {
  readonly root = document.createElement('section');
  private worker?: Worker;
  private requests = new Map<number, Pending>();
  private sequence = 0;
  private generation = 0;
  private source?: Source;
  private sourceName = '';
  private sourceAsset?: Asset;
  private start = 0;
  private end = 0;
  private count = 1;
  private busy = false;
  private unsaved = false;
  private context?: AudioContext;
  private playing?: AudioBufferSourceNode;
  private previewEpoch = 0;
  private clicks: OscillatorNode[] = [];
  private clickTimer?: ReturnType<typeof setInterval>;
  private taps: number[] = [];
  private auditionBuffer?: { key:string; value:Promise<AudioBuffer> };
  private midiSequence=0;
  private midiRequests=new Map<string,number>();
  private midiVoices = new Map<string,AudioBufferSourceNode | undefined>();
  get ready() { return !!this.source && !this.busy; }
  get wholeSource() { const r=this.region();return r.start===0 && r.end===this.source!.frames; }
  reset() { this.generation++;this.release();this.setBusy(false);this.auditionBuffer=undefined; }
  async audition(key:string,pitch:number,velocity:number,on:boolean,context:AudioContext,output:AudioNode) {
    const old=this.midiVoices.get(key);if(old){try{old.stop();}catch{}old.disconnect();}this.midiVoices.delete(key);this.midiRequests.delete(key);
    if(!on || !this.ready)return;
    const generation=this.previewEpoch, region=this.region(), cacheKey=JSON.stringify([this.generation,region]);
    while(this.midiVoices.size>=16){const oldest=this.midiVoices.keys().next().value!;const source=this.midiVoices.get(oldest);if(source){try{source.stop();}catch{}source.disconnect();}this.midiVoices.delete(oldest);this.midiRequests.delete(oldest);}
    const request=++this.midiSequence;this.midiRequests.set(key,request);this.midiVoices.set(key,undefined);
    if(this.auditionBuffer?.key!==cacheKey)this.auditionBuffer={key:cacheKey,value:this.processed(region).then(bytes=>context.decodeAudioData(bytes))};
    const buffer=await this.auditionBuffer.value;
    if(generation!==this.previewEpoch || this.midiRequests.get(key)!==request)return;
    const source=context.createBufferSource(),gain=context.createGain();source.buffer=buffer;source.playbackRate.value=2**((pitch-60)/12);gain.gain.value=.35*velocity/127;
    source.connect(gain).connect(output);this.midiVoices.set(key,source);
    source.onended=()=>{source.disconnect();gain.disconnect();if(this.midiVoices.get(key)===source)this.midiVoices.delete(key);};source.start();
  }
  async commitSelection() { if(!this.ready)throw new Error('Wait for the waveform to load.');this.setBusy(true);try{return await this.save(false);}finally{this.setBusy(false);} }


  constructor(private saved: (asset: Asset) => Promise<void>, private insert: (asset: Asset) => Promise<void>, private tempo: () => number = () => 120) {
    this.root.id = 'sample-editor-page'; this.root.className = 'sample-editor-page'; this.root.hidden = true;
    this.root.innerHTML = `<div class="sample-editor-content">
      <header><a href="#/">← Back to Studio</a><a href="#/samples/import">Import samples</a></header>
      <h1 tabindex="-1">WAV editor</h1><p class="sample-editor-intro">Find a sound worth keeping. Select a region, listen, and save it to your library.</p>
      <div class="sample-editor-open"><label class="sample-file-label">Open WAV <input data-wav-file type="file" accept=".wav,audio/wav"></label><button data-wav-cancel hidden>Cancel loading</button><span>Or drop a WAV here</span></div>
      <p class="sample-editor-limits">Mono/stereo PCM or float WAV · source up to 256 MB / 15 minutes · decoded audio up to 256 MB · saved sample up to 64 MB. Audio stays on this device.</p>
      <p data-wav-status role="status">Open a WAV, or choose Edit sample in your library.</p>
      <div data-wav-workspace hidden>
        <div class="sample-editor-source"><h2 data-wav-title></h2><span data-wav-info></span><label>Zoom <input data-wav-zoom type="range" min="1" max="16" step="1" value="1"></label></div>
        <fieldset class="sample-beat-controls"><legend>Beat alignment</legend>
          <label>Grid BPM<input data-wav-grid-bpm type="number" min="20" max="300" step=".1" value="120"></label><button data-wav-project-tempo>Use project BPM</button><button data-wav-tap>Tap tempo</button>
          <label>First beat (seconds)<input data-wav-first-beat type="number" min="0" step="any" value="0"></label><button data-wav-set-beat>Set first beat at selection start</button>
          <label>Snap<select data-wav-snap><option value="0">Off</option><option value="1">Beat</option><option value="0.5">Half beat</option><option value="0.25">Quarter beat</option></select></label>
          <label><input data-wav-click type="checkbox"> Click track</label>
        </fieldset>
        <div data-wav-scroll class="sample-wave-scroll"><div data-wav-wave class="sample-wave">
          <canvas data-wav-canvas aria-label="Audio waveform; use the selection start and end controls to choose a region"></canvas>
          <div data-wav-selection class="sample-wave-selection"></div>
          <button data-wav-start-handle class="sample-wave-handle" role="slider" aria-label="Selection start" aria-orientation="horizontal" title="Start: use arrow keys to adjust">[</button>
          <button data-wav-end-handle class="sample-wave-handle" role="slider" aria-label="Selection end" aria-orientation="horizontal" title="End: use arrow keys to adjust">]</button>
        </div></div>
        <div class="sample-editor-controls"><label>Start (seconds)<input data-wav-start type="number" min="0" step="any"></label><label>End (seconds)<input data-wav-end type="number" min="0" step="any"></label><span data-wav-duration></span><button data-wav-play>Play selection</button><button data-wav-stop>Stop</button></div>
        <p class="sample-editor-help">Drag across the waveform to select. Drag a boundary to trim. Arrow keys on a boundary move 10 ms; Shift moves 100 ms, Alt moves one frame. Your source stays unchanged.</p>
        <p class="sample-editor-help">Crops keep the original timing. Fit or align a saved sample to the song from its clip in the composition (Align…).</p>
        <div class="sample-editor-save"><label>Sample name<input data-wav-name maxlength="80"></label><button data-wav-save>Save sample</button><button data-wav-insert class="primary">Save and insert</button><button data-wav-download>Download WAV</button></div>
        <p class="sample-editor-help">Saved samples stay in this browser. Download a project backup to keep them elsewhere. Unsaved selections are lost on reload.</p>
      </div></div>`;
    this.el<HTMLInputElement>('file').onchange = () => { const file = this.el<HTMLInputElement>('file').files?.[0]; if (file) void this.open(file, file.name); this.el<HTMLInputElement>('file').value = ''; };
    this.root.ondragover = event => { event.preventDefault(); };
    this.root.ondrop = event => { event.preventDefault(); const files = event.dataTransfer?.files; if (files?.length !== 1) { this.status('Choose one WAV at a time.', true); return; } void this.open(files[0], files[0].name); };
    this.el('cancel').onclick = () => { this.generation++; this.release(); this.setBusy(false); this.status('Loading cancelled. Choose a WAV to continue.'); };
    this.el('zoom').oninput = () => this.draw();
    for (const name of ['start', 'end']) this.el<HTMLInputElement>(name).oninput = () => {
      this.stop(); this.unsaved = true;
      try { const { start, end } = this.region(); this.start = start; this.end = end; this.unsaved = true; this.drawSelection(); this.status('Selection ready.'); }
      catch (error) { this.status((error as Error).message, true); }
    };
    this.el('name').oninput = () => { this.unsaved = true; };
    this.el('stop').onclick = () => this.stop();
    this.el('play').onclick = () => { void this.run(() => this.preview()); };
    this.el('save').onclick = () => { void this.run(() => this.save(false)); };
    this.el('insert').onclick = () => { void this.run(() => this.save(true)); };
    this.el('download').onclick = () => { void this.run(() => this.download()); };
    this.el('project-tempo').onclick = () => { this.el<HTMLInputElement>('grid-bpm').value = String(this.tempo()); this.stop(); this.draw(); };
    this.el('set-beat').onclick = () => { try { this.el<HTMLInputElement>('first-beat').value = String(this.region().start / this.source!.rate); this.stop(); this.draw(); } catch(error) { this.status((error as Error).message,true); } };
    this.el('tap').onclick = () => { const now=performance.now(); if(this.taps.length && now-this.taps.at(-1)!>3000)this.taps=[];this.taps.push(now);this.taps=this.taps.slice(-6);if(this.taps.length>1){const bpm=60000*(this.taps.length-1)/(now-this.taps[0]);if(bpm>=20&&bpm<=300){this.el<HTMLInputElement>('grid-bpm').value=String(Math.round(bpm*10)/10);this.draw();}} };
    for(const name of ['grid-bpm','first-beat','snap','click'])this.el(name).onchange=()=>{this.stop();this.unsaved=true;this.draw();};
    this.installSelection();
    new ResizeObserver(() => { if (!this.root.hidden) this.draw(); }).observe(this.el('scroll'));
    new MutationObserver(() => { if (!this.root.hidden) this.draw(); }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-appearance'] });
    window.addEventListener('beforeunload', event => { if (this.unsaved) { event.preventDefault(); event.returnValue = ''; } });
  }
  private el<T extends HTMLElement = HTMLElement>(name: string) { return this.root.querySelector<T>(`[data-wav-${name}]`)!; }
  private status(message: string, error = false) { this.el('status').textContent = message; this.el('status').classList.toggle('error', error); }
  private setBusy(value: boolean) {
    this.busy = value;
    for (const name of ['file', 'play', 'save', 'insert', 'download', 'start', 'end', 'name', 'start-handle', 'end-handle', 'grid-bpm', 'first-beat', 'snap', 'project-tempo', 'set-beat', 'tap', 'click']) (this.el(name) as HTMLInputElement).disabled = value;
    this.el('workspace').setAttribute('aria-busy', String(value));
  }
  private async run(action: () => Promise<unknown>) {
    if (this.busy) return;
    this.setBusy(true);
    try { await action(); } catch (error) { this.status((error as Error).message, true); }
    finally { this.setBusy(false); }
  }
  private request<T>(kind: string, args: Record<string, unknown>, transfer: Transferable[] = []): Promise<T> {
    return new Promise((resolve, reject) => {
      if (!this.worker) { reject(new Error('Open a WAV first.')); return; }
      const id = ++this.sequence; this.requests.set(id, { resolve, reject }); this.worker.postMessage({ id, kind, ...args }, transfer);
    });
  }
  private release() {
    this.stop(); this.worker?.terminate(); this.worker = undefined;
    for (const pending of this.requests.values()) pending.reject(new Error('Loading cancelled.'));
    this.requests.clear(); this.source = undefined; this.unsaved = false;
    this.el('workspace').hidden = true; this.el('cancel').hidden = true;
  }
  async openAsset(asset: Asset) {
    if (this.busy) return;
    try { await this.open(await audioBlob(asset.id), asset.label || asset.source?.name || 'Sample', asset); }
    catch (error) { this.status((error as Error).message, true); }
  }
  async open(blob: Blob, name: string, asset?: Asset) {
    if (this.busy) return;
    if (blob.size > SOURCE_LIMIT) { this.status('Source exceeds 256 MB. Choose a smaller WAV.', true); return; }
    if (!asset && !/\.wav$/i.test(name)) { this.status('Choose a WAV file. Other formats can be imported through Import samples first.', true); return; }
    if (this.unsaved && !window.confirm('Replace the unsaved selection? Saved samples will stay in your library.')) return;
    this.release(); const generation = ++this.generation; this.setBusy(true); this.el('cancel').hidden = false;
    this.status('Reading audio and preparing waveform…');
    try {
      let bytes = await blob.arrayBuffer();
      if (generation !== this.generation) return;
      if (asset?.format === 'mp3') {
        const context = new AudioContext();
        try { bytes = (await prepareAudio(bytes, 'mp3', context)).wav; } finally { await context.close(); }
      }
      if (generation !== this.generation) return;
      this.worker = new Worker(new URL('./sample-edit-worker.ts', import.meta.url), { type: 'module' });
      this.worker.onmessage = ({ data }) => { const pending = this.requests.get(data.id); if (!pending) return; this.requests.delete(data.id); if (data.error) pending.reject(new Error(data.error)); else pending.resolve(data.result); };
      this.worker.onerror = () => { for (const pending of this.requests.values()) pending.reject(new Error('Audio processing failed. Reopen the WAV and try again.')); this.requests.clear(); };
      const source = await this.request<Source>('open', { bytes }, [bytes]);
      if(generation!==this.generation)return;
      this.source = source;
      this.sourceName = name; this.sourceAsset = asset; this.start = 0; this.end = this.source.frames; this.count = 1; this.unsaved = true;
      this.el('title').textContent = name; this.el('info').textContent = `${(this.end / this.source.rate).toFixed(2)} seconds · ${this.source.rate.toLocaleString()} Hz · ${this.source.channels === 1 ? 'Mono' : 'Stereo'}`;
      this.el<HTMLInputElement>('zoom').value = '1'; this.el('workspace').hidden = false; this.el('scroll').scrollLeft = 0;
      this.el<HTMLInputElement>('grid-bpm').value=String(this.tempo()); this.el<HTMLInputElement>('first-beat').value='0';
      this.nextName(); this.updateSelection(); this.status('Drag to select a region, or enter start and end times.');
      this.draw();
    } catch (error) { if (generation === this.generation) { this.release(); this.status((error as Error).message, true); } }
    finally { if (generation === this.generation) { this.setBusy(false); this.el('cancel').hidden = true; } }
  }
  show(visible: boolean) { this.root.hidden = !visible; if (visible) { this.draw(); this.root.querySelector('h1')!.focus(); } else this.stop(); }
  private nextName() { this.el<HTMLInputElement>('name').value = `${this.sourceName.replace(/\.[^.]+$/, '').slice(0, 72)} · ${String(this.count).padStart(2, '0')}`; }
  private region() {
    if (!this.source) throw new Error('Open a WAV first.');
    const a = this.el<HTMLInputElement>('start'), b = this.el<HTMLInputElement>('end');
    const start = Math.round(a.valueAsNumber * this.source.rate), end = Math.round(b.valueAsNumber * this.source.rate);
    validateRegion(start, end, this.source.frames); return { start, end };
  }
  private updateSelection() {
    if (!this.source) return;
    this.el<HTMLInputElement>('start').value = String(this.start / this.source.rate); this.el<HTMLInputElement>('end').value = String(this.end / this.source.rate);
    this.drawSelection();
  }
  private drawSelection() {
    if (!this.source) return;
    const { frames, rate, channels } = this.source;
    this.el('selection').style.left = `${this.start / frames * 100}%`; this.el('selection').style.width = `${(this.end - this.start) / frames * 100}%`;
    for (const [name, frame] of [['start', this.start], ['end', this.end]] as const) {
      const handle = this.el(`${name}-handle`); handle.style.left = `${frame / frames * 100}%`;
      handle.setAttribute('aria-valuemin', '0'); handle.setAttribute('aria-valuemax', String(frames / rate)); handle.setAttribute('aria-valuenow', String(frame / rate)); handle.setAttribute('aria-valuetext', `${(frame / rate).toFixed(4)} seconds`);
    }
    this.el('duration').textContent = `${((this.end - this.start) / rate).toFixed(3)} s · ${((56 + (this.end - this.start) * channels * 4) / 1e6).toFixed(2)} MB`;
    try {
      const bpm=this.el<HTMLInputElement>('grid-bpm').valueAsNumber;
      const beats=(this.end-this.start)/rate/beatSeconds(bpm);
      this.el('duration').textContent += ` · ${beats.toFixed(2)} beats`;
    } catch { /* Invalid tempo remains visible in the beat grid. */ }

  }
  private installSelection() {
    const wave = this.el('wave');
    wave.onpointerdown = event => {
      if (!this.source || this.busy || event.button !== 0) return;
      const target = event.target as HTMLElement, mode = target.hasAttribute('data-wav-start-handle') ? 'start' : target.hasAttribute('data-wav-end-handle') ? 'end' : 'region';
      const frame = (e: PointerEvent) => Math.max(0, Math.min(this.source!.frames, this.snapFrame(Math.round((e.clientX - wave.getBoundingClientRect().left) / wave.clientWidth * this.source!.frames), e.altKey)));
      const anchor = frame(event); this.stop(); wave.setPointerCapture(event.pointerId);
      const move = (e: PointerEvent) => {
        const value = frame(e);
        if (mode === 'start') this.start = Math.min(value, this.end - 1);
        else if (mode === 'end') this.end = Math.max(value, this.start + 1);
        else { this.start = Math.min(anchor, value, this.source!.frames - 1); this.end = Math.max(this.start + 1, anchor, value); }
        this.unsaved = true; this.updateSelection();
      };
      if (mode === 'region') move(event);
      wave.onpointermove = move;
      wave.onpointerup = wave.onpointercancel = () => { wave.onpointermove = null; wave.onpointerup = wave.onpointercancel = null; };
    };
    for (const name of ['start', 'end'] as const) this.el(`${name}-handle`).onkeydown = event => {
      if (!this.source || this.busy || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault(); this.stop();
      const division=Number(this.el<HTMLSelectElement>('snap').value);
      const step = event.altKey ? 1 : division ? Math.round(this.source.rate*beatSeconds(this.el<HTMLInputElement>('grid-bpm').valueAsNumber)*division*(event.shiftKey?4:1)) : Math.max(1, Math.round(this.source.rate * (event.shiftKey ? .1 : .01)));
      const value = event.key === 'Home' ? 0 : event.key === 'End' ? this.source.frames : this[name] + (event.key === 'ArrowLeft' ? -step : step);
      const snapped=this.snapFrame(value,event.altKey);
      this[name] = name === 'start' ? Math.max(0, Math.min(this.end - 1, snapped)) : Math.max(this.start + 1, Math.min(this.source.frames, snapped));
      this.unsaved = true; this.updateSelection(); this.el(`${name}-handle`).scrollIntoView({ block: 'nearest', inline: 'nearest' });
    };
  }
  private draw() {
    if (!this.source || this.root.hidden) return;
    const width = Math.max(320, this.el('scroll').clientWidth) * Number(this.el<HTMLInputElement>('zoom').value), height = 220;
    this.el('wave').style.width = `${width}px`;
    const canvas = this.el<HTMLCanvasElement>('canvas'), scale = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = width * scale; canvas.height = height * scale; canvas.style.width = `${width}px`; canvas.style.height = `${height}px`;
    const ctx = canvas.getContext('2d')!; ctx.scale(scale, scale);
    const style = getComputedStyle(this.root), peaks = this.source.peaks, bins = peaks.length / 2;
    ctx.strokeStyle = style.getPropertyValue('--accent'); ctx.beginPath();
    for (let x = 0; x < width; x++) {
      let min = 0, max = 0;
      for (let b = Math.floor(x / width * bins); b < Math.max(Math.floor(x / width * bins) + 1, Math.ceil((x + 1) / width * bins)); b++) { min = Math.min(min, peaks[b * 2] ?? 0); max = Math.max(max, peaks[b * 2 + 1] ?? 0); }
      ctx.moveTo(x + .5, 116 - Math.min(1, max) * 78); ctx.lineTo(x + .5, 116 - Math.max(-1, min) * 78);
    }
    ctx.stroke(); ctx.fillStyle = style.getPropertyValue('--muted'); ctx.font = '11px monospace';
    const interval = Math.max(1, Math.ceil(width / 100));
    for (let i = 0; i <= interval; i++) { const x = i * width / interval; ctx.textAlign = i === 0 ? 'left' : i === interval ? 'right' : 'center'; ctx.fillText(`${(i / interval * this.source.frames / this.source.rate).toFixed(2)}s`, Math.max(5, Math.min(x, width - 5)), 18); }
    try {
      const beat=beatSeconds(this.el<HTMLInputElement>('grid-bpm').valueAsNumber), first=this.el<HTMLInputElement>('first-beat').valueAsNumber;
      const seconds=this.source.frames/this.source.rate, pixels=beat/seconds*width;
      const stride=Math.max(1,Math.ceil(16/pixels));
      for(let n=Math.ceil(-first/beat/stride)*stride;first+n*beat<=seconds;n+=stride){const x=(first+n*beat)/seconds*width;ctx.globalAlpha=n%4===0?.45:.2;ctx.strokeStyle=style.getPropertyValue('--muted');ctx.beginPath();ctx.moveTo(x,30);ctx.lineTo(x,220);ctx.stroke();ctx.globalAlpha=1;if(n%4===0&&pixels*4>36)ctx.fillText(`${Math.floor(n/4)+1}.1`,Math.max(10,x),212);}
    } catch { /* Invalid tempo remains visible in the fit status. */ }
    this.drawSelection();
  }
  private snapFrame(frame:number,bypass=false) {
    if(!this.source||bypass)return frame;
    try{return Math.round(snapToBeat(frame/this.source.rate,this.el<HTMLInputElement>('grid-bpm').valueAsNumber,this.el<HTMLInputElement>('first-beat').valueAsNumber,Number(this.el<HTMLSelectElement>('snap').value))*this.source.rate);}catch{return frame;}
  }
  private processed(region=this.region()) { return this.request<ArrayBuffer>('crop',{...region}); }
  private startClick(at:number,duration:number) {
    if(!this.context||!this.el<HTMLInputElement>('click').checked)return;
    const beat=beatSeconds(this.el<HTMLInputElement>('grid-bpm').valueAsNumber);
    const offset=this.el<HTMLInputElement>('first-beat').valueAsNumber-this.start/this.source!.rate;
    let index=Math.ceil(-offset/beat), next=at+offset+index*beat;
    const schedule=()=>{while(next<this.context!.currentTime+.15 && next<at+duration){if(next>=this.context!.currentTime){const node=this.context!.createOscillator(),gain=this.context!.createGain();node.frequency.value=index%4===0?1200:850;gain.gain.setValueAtTime(.075,next);gain.gain.exponentialRampToValueAtTime(.0001,next+.04);node.connect(gain).connect(this.context!.destination);node.start(next);node.stop(next+.045);this.clicks.push(node);node.onended=()=>{node.disconnect();gain.disconnect();this.clicks=this.clicks.filter(n=>n!==node);};}index++;next=at+offset+index*beat;}};
    schedule();this.clickTimer=setInterval(schedule,25);
  }
  stop() { for(const source of this.midiVoices.values())if(source){try{source.stop();}catch{}source.disconnect();}this.midiVoices.clear();this.midiRequests.clear(); clearInterval(this.clickTimer); for(const click of this.clicks){try{click.stop();}catch{}click.disconnect();}this.clicks=[]; this.previewEpoch++; if (this.playing) { try { this.playing.stop(); } catch { /* Already stopped. */ } this.playing.disconnect(); this.playing = undefined; } this.el('play').setAttribute('aria-pressed', 'false'); }
  private async preview() {
    this.stop(); const epoch = this.previewEpoch;
    this.context ??= new AudioContext(); await this.context.resume();
    const bytes = await this.processed();
    const buffer = await this.context.decodeAudioData(bytes);
    if (epoch !== this.previewEpoch || this.root.hidden) return;
    const source = this.context.createBufferSource(); source.buffer = buffer; source.connect(this.context.destination); this.playing = source;
    source.onended = () => { source.disconnect(); if (this.playing === source) { this.playing = undefined; this.stop(); this.status('Selection finished.'); } };
    const at=this.context.currentTime+.05;try { this.startClick(at,buffer.duration);source.start(at); } catch(error) { this.stop();throw error; } this.el('play').setAttribute('aria-pressed', 'true'); this.status('Playing selection.');
  }
  private async save(insert: boolean) {
    this.stop(); const region = this.region(), source = this.source!;
    const label = this.el<HTMLInputElement>('name').value.trim(); if (!label) throw new Error('Name your sample before saving.');
    this.status('Saving sample…');
    const bytes = await this.processed(region);
    const { asset, reused } = await importSample({ name: `${label}.wav`, label, originalFormat: 'wav', provider: 'upload',
      pack: this.sourceAsset?.pack, source: { name: `${label}.wav`, url: this.sourceAsset?.source?.url },
      extraction: { name: this.sourceName, assetId: this.sourceAsset?.id, hash: source.hash, rate: source.rate, startFrame: region.start, endFrame: region.end },
      precision: { rate: source.rate, channels: source.channels, bits: 32, working: 'float32', originalAvailable: true },
    }, bytes, bytes);
    this.unsaved = false; await this.saved(asset); this.count++; this.nextName();
    this.status(reused ? 'Identical audio already saved; reused the existing sample.' : `Saved “${asset.label}”. Select another region to keep sampling.`);
    if (insert) await this.insert(asset);
    return asset;
  }
  private async download() {
    const region = this.region(); this.status('Preparing WAV…');
    const bytes = await this.processed(region), url = URL.createObjectURL(new Blob([bytes], { type: 'audio/wav' }));
    const link = document.createElement('a'); link.href = url; link.download = `${(this.el<HTMLInputElement>('name').value.trim() || 'sample').replace(/[\\/:*?"<>|]/g, '-')}.wav`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000); this.unsaved = false; this.status('WAV downloaded. Save sample to add it to your library too.');
  }
}
