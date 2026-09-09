import { encodeAudio } from './encode';
import { pendingKeys, readPending, writePending } from './recovery';
type Chunk = { left: Float32Array<ArrayBuffer>; right: Float32Array<ArrayBuffer> };
const processor = `class TakeCapture extends AudioWorkletProcessor {
  constructor() { super(); this.active=false; this.offset=0; this.left=new Float32Array(8192); this.right=new Float32Array(8192);
    this.port.onmessage=({data})=>{if(data.type==='start'){this.active=true;this.sentStarted=false;this.startFrame=data.frame;this.stopFrame=data.stopFrame;}else{this.active=false;this.flush();this.port.postMessage({type:'stopped'});}}; }
  flush(){if(!this.offset)return; const left=this.left.slice(0,this.offset),right=this.right.slice(0,this.offset);this.port.postMessage({type:'audio',left,right},[left.buffer,right.buffer]);this.offset=0;}
  process(inputs){const input=inputs[0];let peak=0;
    for(let i=0;i<128;i++){const l=input?.[0]?.[i]??0,r=input?.[1]?.[i]??l;peak=Math.max(peak,Math.abs(l),Math.abs(r));
      if(this.active&&currentFrame+i>=this.stopFrame){this.active=false;this.flush();this.port.postMessage({type:'stopped'});}
      if(this.active&&currentFrame+i>=this.startFrame){if(!this.sentStarted){this.sentStarted=true;this.port.postMessage({type:'started',frame:currentFrame+i});}this.left[this.offset]=l;this.right[this.offset++]=r;if(this.offset===8192)this.flush();}}
    if(currentFrame%2048===0)this.port.postMessage({type:'level',peak});return true;}
} registerProcessor('studio-take',TakeCapture);`;
const loaded = new WeakMap<BaseAudioContext, Promise<void>>();
export class AudioTakeCapture {
  private node?: AudioWorkletNode;
  private chunks: { key: string; frames: number }[] = [];
  private unsaved = new Map<string, Chunk>();
  private writes = Promise.resolve();
  private stopped?: () => void;
  private prefix = '';
  onstart: (time: number) => void = () => {};
  frames = 0; recording = false; failed = false;
  constructor(readonly context: AudioContext, private source: AudioNode, private meter: (peak: number) => void, private failure: (message: string) => void = () => {}) {}
  async setup() {
    if (!loaded.has(this.context)) { const url = URL.createObjectURL(new Blob([processor], { type: 'text/javascript' })); loaded.set(this.context, this.context.audioWorklet.addModule(url).finally(() => URL.revokeObjectURL(url))); }
    await loaded.get(this.context); await this.context.resume();
    this.node = new AudioWorkletNode(this.context, 'studio-take', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2] });
    this.node.port.onmessage = ({ data }) => {
      if (data.type === 'started') this.onstart(data.frame / this.context.sampleRate);
      if (data.type === 'level') this.meter(data.peak);
      if (data.type === 'stopped') { this.recording = false; this.stopped?.(); }
      if (data.type === 'audio') {
        if (this.unsaved.size >= 128 || this.frames * 8 + data.left.byteLength * 2 > 256_000_000) { this.fail('Capture reached its memory limit. The incomplete take is retained.'); return; }
        const key = `${this.prefix}chunk:${String(this.chunks.length).padStart(8, '0')}`;
        this.chunks.push({ key, frames: data.left.length }); this.frames += data.left.length; this.unsaved.set(key, data);
        this.writes = this.writes.then(async () => {
          if (this.failed) return;
          try { await writePending(key, new Blob([data.left, data.right])); this.unsaved.delete(key); }
          catch { this.fail('Capture storage failed. Saved chunks and the remaining audio are retained; save or download the take now.'); }
        });
      }
    };
    this.source.connect(this.node); this.node.connect(this.context.destination); // processor emits silence
  }
  private fail(message: string) { if (this.failed) return; this.failed = true; this.node?.port.postMessage({ type: 'stop' }); this.failure(message); }
  start(at: number, prefix = `capture:${crypto.randomUUID()}:`, duration = 900) {
    if (!this.node) throw new Error('Set up an input first.');
    this.prefix = prefix; this.chunks = []; this.unsaved.clear(); this.frames = 0; this.recording = true; this.failed = false;
    this.node.port.postMessage({ type: 'start', frame: Math.ceil(at * this.context.sampleRate), stopFrame: Math.ceil((at + duration) * this.context.sampleRate) });
  }
  async stop() {
    if (this.recording) await new Promise<void>(resolve => {
      const timeout = setTimeout(() => { this.failed = true; this.recording = false; resolve(); }, 1000);
      this.stopped = () => { clearTimeout(timeout); resolve(); }; this.node?.port.postMessage({ type: 'stop' });
    });
    await this.writes;
  }
  async restore(prefix: string, legacy?: Chunk[]) {
    this.prefix = prefix; this.chunks = []; this.frames = 0;
    for (const key of await pendingKeys(prefix + 'chunk:')) {
      const blob = await readPending<Blob>(key); if (!(blob instanceof Blob) || blob.size % 8) throw new Error('Incomplete recovery chunk.');
      this.chunks.push({ key, frames: blob.size / 8 }); this.frames += blob.size / 8;
    }
    if (!this.chunks.length && legacy) for (const [index, chunk] of legacy.entries()) { const key = `${prefix}legacy:${index}`; this.chunks.push({ key, frames: chunk.left.length }); this.unsaved.set(key, chunk); this.frames += chunk.left.length; }
  }
  get duration() { return this.frames / this.context.sampleRate; }
  async wav(start = 0, end = this.duration) {
    await this.writes;
    const from = Math.max(0, Math.floor(start * this.context.sampleRate)), to = Math.min(this.frames, Math.floor(end * this.context.sampleRate));
    if (to <= from) throw new Error('Choose a nonempty audio range.');
    const left = new Float32Array(to - from), right = new Float32Array(to - from); let cursor = 0;
    for (const entry of this.chunks) {
      const a = Math.max(0, from - cursor), b = Math.min(entry.frames, to - cursor);
      if (b > a) {
        let chunk = this.unsaved.get(entry.key);
        if (!chunk) { const blob = await readPending<Blob>(entry.key); if (!(blob instanceof Blob)) throw new Error('Capture chunk is missing.'); const bytes = await blob.arrayBuffer(); chunk = { left: new Float32Array(bytes, 0, entry.frames), right: new Float32Array(bytes, entry.frames * 4, entry.frames) }; }
        left.set(chunk.left.subarray(a, b), cursor + a - from); right.set(chunk.right.subarray(a, b), cursor + a - from);
      }
      cursor += entry.frames;
    }
    return (await encodeAudio(left, right, this.context.sampleRate, { format: 'float32' })).buffer;
  }
  disconnect() { try { if (this.node) this.source.disconnect(this.node); } catch { /* source gone */ } this.node?.disconnect(); this.node?.port.close(); }
}
