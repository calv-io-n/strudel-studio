import { encodeWav } from '../shared/wav';

const processor = `class TakeCapture extends AudioWorkletProcessor {
  constructor() { super(); this.active = false; this.offset = 0; this.left = new Float32Array(2048); this.right = new Float32Array(2048);
    this.port.onmessage = ({data}) => { if (data.type === 'start') { this.active = true; this.startAt = data.at; } else { this.active = false; this.flush(); this.port.postMessage({type:'stopped'}); } }; }
  flush() { if (!this.offset) return; this.port.postMessage({type:'audio', left:this.left.slice(0,this.offset), right:this.right.slice(0,this.offset)}); this.offset = 0; }
  process(inputs) { const input = inputs[0]; if (!input?.[0]) return true;
    let peak = 0;
    for (let i=0;i<input[0].length;i++) { const l=input[0][i], r=input[1]?.[i] ?? l; peak=Math.max(peak,Math.abs(l),Math.abs(r));
      if (this.active && currentTime + i/sampleRate >= this.startAt) { this.left[this.offset]=l; this.right[this.offset++]=r; if(this.offset===2048)this.flush(); } }
    if(currentFrame % 2048 === 0) this.port.postMessage({type:'level', peak}); return true; }
} registerProcessor('studio-take',TakeCapture);`;
const loaded = new WeakMap<BaseAudioContext, Promise<void>>();
export class AudioTakeCapture {
  private node?: AudioWorkletNode;
  private chunks: { left: Float32Array; right: Float32Array }[] = [];
  private stopped?: () => void;
  frames = 0;
  recording = false;
  constructor(readonly context: AudioContext, private source: AudioNode, private meter: (value: number) => void, private retained: (chunk: { left: Float32Array; right: Float32Array }) => void = () => {}) {}
  async setup() {
    if (!loaded.has(this.context)) {
      const url = URL.createObjectURL(new Blob([processor], { type: 'text/javascript' }));
      loaded.set(this.context, this.context.audioWorklet.addModule(url).finally(() => URL.revokeObjectURL(url)));
    }
    await loaded.get(this.context); await this.context.resume();
    this.node = new AudioWorkletNode(this.context, 'studio-take', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2] });
    this.node.port.onmessage = ({ data }) => {
      if (data.type === 'level') this.meter(data.peak);
      if (data.type === 'audio') { this.chunks.push(data); this.frames += data.left.length; this.retained({ left: data.left, right: data.right }); }
      if (data.type === 'stopped') this.stopped?.();
    };
    this.source.connect(this.node); this.node.connect(this.context.destination); // processor emits silence
  }
  start(at: number) { if (!this.node) throw new Error('Set up an input first.'); this.chunks = []; this.frames = 0; this.recording = true; this.node.port.postMessage({ type: 'start', at }); }
  async stop() {
    if (!this.recording) return;
    this.recording = false;
    await new Promise<void>(resolve => { const timeout = setTimeout(resolve, 1000); this.stopped = () => { clearTimeout(timeout); resolve(); }; this.node!.port.postMessage({ type: 'stop' }); });
  }
  restore(chunks: { left: Float32Array; right: Float32Array }[]) { this.chunks = chunks; this.frames = chunks.reduce((sum, chunk) => sum + chunk.left.length, 0); }
  get duration() { return this.frames / this.context.sampleRate; }
  wav(start = 0, end = this.duration) {
    const from = Math.max(0, Math.floor(start * this.context.sampleRate)), to = Math.min(this.frames, Math.floor(end * this.context.sampleRate));
    if (to <= from) throw new Error('Choose a nonempty audio range.');
    const left = new Float32Array(to - from), right = new Float32Array(to - from); let cursor = 0;
    for (const chunk of this.chunks) { const a = Math.max(0, from - cursor), b = Math.min(chunk.left.length, to - cursor); if (b > a) { left.set(chunk.left.subarray(a, b), cursor + a - from); right.set(chunk.right.subarray(a, b), cursor + a - from); } cursor += chunk.left.length; }
    return encodeWav(left, right, this.context.sampleRate).buffer;
  }
  disconnect() { try { if (this.node) this.source.disconnect(this.node); } catch { /* source gone */ } this.node?.disconnect(); this.node?.port.close(); }
}
