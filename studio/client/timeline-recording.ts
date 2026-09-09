import type { AudioInput, Asset, Project } from '../shared/model';
import { checkTakeCapacity, type TakeIdentity } from '../shared/recorded-take';
import { AudioTakeCapture } from './audio-take';
import { createInputEffects } from './input-effects';
import type { Engine } from './engine';
import type { LiveInput } from './live-input';
import { readPending, writePending, removePending } from './recovery';
import { takeAsset } from './storage/recorded-take';
export type RecordOptions = { trackId: string; device: string; channel: string; mode: 'wet' | 'dry'; latency: number; countin: boolean };
type Meta = { identity: TakeIdentity; input: AudioInput; bpm: number; offset: number; rate: number; mode: 'wet' | 'dry'; latency: number; incomplete: boolean };
export class TimelineRecording {
  state: 'idle' | 'preparing' | 'recording' | 'finishing' | 'saving' | 'failed' = 'idle';
  message = '';
  private capture?: AudioTakeCapture;
  private dry?: AudioTakeCapture;
  private gate?: GainNode;
  private effects?: ReturnType<typeof createInputEffects>;
  private context?: AudioContext;
  private meta?: Meta;
  private prefix = '';
  private at = 0;
  private timer?: ReturnType<typeof setTimeout>;
  private finishing?: Promise<void>;
  private epoch = 0;
  private encoded?: { asset: Asset; blob: Blob }[];
  private listener = (code: string) => this.effects?.apply(code);
  constructor(private engine: Engine, private live: LiveInput, private project: () => Project, private input: () => AudioInput, private commit: (identity: TakeIdentity, audio: { asset: Asset; blob: Blob }[], metaKey: string) => Promise<void>, private changed: () => void) {}
  get pending() { return this.state !== 'idle'; }
  get identity() { return this.meta?.identity; }
  get startCycle() { return this.meta?.offset ?? 0; }
  get elapsed() { return this.state === 'recording' ? Math.max(0, (this.context?.currentTime ?? 0) - this.at) : this.capture?.duration ?? 0; }
  get endCycle() { return this.startCycle + this.elapsed * (this.meta?.bpm ?? 120) / 240; }
  private status(state: typeof this.state, message: string) { this.state = state; this.message = message; this.changed(); }
  async start(options: RecordOptions) {
    if (this.pending) return;
    checkTakeCapacity(this.project());
    if (!Number.isFinite(options.latency) || Math.abs(options.latency) > 2) throw new Error('Latency compensation must be between -2 and 2 seconds.');
    const position = this.engine.timelinePosition;
    if (!this.project().tracks.some(t => t.id === options.trackId)) throw new Error('Choose a recording track.');
    if (this.project().clips.some(c => c.trackId === options.trackId && c.start <= position && c.start + c.length > position)) throw new Error('This track has a clip at the playhead. Move the playhead to empty space or choose another track.');
    const nextClip = Math.min(4095, ...this.project().clips.filter(c => c.trackId === options.trackId && c.start > position).map(c => c.start));
    const tail = options.mode === 'wet' ? 3 : 0;
    if ((nextClip - position) * 240 / this.project().bpm <= tail + .1 + (options.countin ? 240 / this.project().bpm : 0)) throw new Error('Choose a longer empty section to record, including the effects tail.');
    const epoch = ++this.epoch;
    this.status('preparing', 'Connecting audio input…');
    try {
      const input = this.input(); input.enabled = true;
      if (!this.live.active) await this.live.connect(input, options.device, options.channel);
      if (epoch !== this.epoch) return;
      if (!this.live.dry) throw new Error('Input connection was cancelled.');
      this.context = this.live.context;
      this.gate = this.context.createGain(); this.live.dry.connect(this.gate);
      this.effects = createInputEffects(this.context, input.appliedCode); this.gate.connect(this.effects.input);
      this.live.effectListeners.add(this.listener);
      const failed = (message: string) => { if (this.meta) this.meta.incomplete = true; this.message = message; void this.stop(true); };
      const capture = new AudioTakeCapture(this.context, options.mode === 'wet' ? this.effects.output : this.gate, () => {}, failed); this.capture = capture;
      await capture.setup();
      if (epoch !== this.epoch) { capture.disconnect(); return; }
      if (options.mode === 'wet') { const dry = new AudioTakeCapture(this.context, this.gate, () => {}, failed); this.dry = dry; await dry.setup(); if (epoch !== this.epoch) { dry.disconnect(); return; } }
      let n = 1; while (this.project().tabs.some(t => t.name === `Audio take ${n}`) || this.project().tracks.some(t => t.name === `Audio take ${n}`)) n++;
      const identity = { assetId: crypto.randomUUID(), dryAssetId: crypto.randomUUID(), tabId: crypto.randomUUID(), trackId: options.trackId, clipId: crypto.randomUUID(), name: `Audio take ${n}` };
      this.prefix = `timeline-audio:${this.project().sessionId}:`;
      const bpm = this.project().bpm;
      this.meta = { identity, input: structuredClone(input), bpm, offset: this.engine.timelinePosition, rate: this.context.sampleRate, mode: options.mode, latency: options.latency, incomplete: false };
      await writePending(this.prefix + 'meta', this.meta);
      if (epoch !== this.epoch) return;
      await this.engine.beginAudioRecording();
      if (epoch !== this.epoch) return;
      const wait = (options.countin ? 240 / bpm : 0) + .025;
      this.at = this.context.currentTime + wait;
      this.meta.offset = this.engine.timelinePosition + wait * bpm / 240;
      // Persist the exact scheduled start before publishing any chunks.
      await writePending(this.prefix + 'meta', this.meta);
      if (this.context.currentTime >= this.at) {
        this.at = this.context.currentTime + .025;
        this.meta.offset = this.engine.timelinePosition + .025 * bpm / 240;
        await writePending(this.prefix + 'meta', this.meta);
      }
      if (epoch !== this.epoch) return;
      const limit = Math.min(897, (nextClip - this.meta.offset) * 240 / bpm - tail - .05, 248_000_000 / (this.context.sampleRate * 8) - 3);
      if (limit <= 0) throw new Error('Move the playhead earlier before recording.');
      this.capture.onstart = actual => { if (!this.meta) return; this.meta.offset += (actual - this.at) * bpm / 240; void writePending(this.prefix + 'meta', this.meta).catch(() => {}); };
      this.capture.start(this.at, this.prefix, limit + 3); this.dry?.start(this.at, this.prefix + 'dry:', limit + 3);
      this.live.onended = () => void this.stop(true);
      this.timer = setTimeout(() => void this.stop(), (limit + wait) * 1000);
      this.status('recording', options.countin ? 'Count-in…' : 'Recording');
    } catch (error) {
      if (epoch !== this.epoch) return;
      if (this.engine.recordingTransport) this.engine.endAudioRecording();
      this.cleanup(); this.meta = undefined;
      this.status('idle', (error as Error).message); throw error;
    }
  }
  stop(interrupted = false): Promise<void> {
    if (this.finishing) return this.finishing;
    if (this.state === 'preparing') { ++this.epoch; if (this.engine.recordingTransport) this.engine.endAudioRecording(); this.live.disconnect(); this.cleanup(); this.meta = undefined; this.status('idle', 'Recording cancelled'); return Promise.resolve(); }
    if (this.state !== 'recording') return Promise.resolve();
    this.finishing = this.finish(interrupted).finally(() => { this.finishing = undefined; });
    return this.finishing;
  }
  private async finish(interrupted: boolean) {
    clearTimeout(this.timer);
    this.meta!.incomplete ||= interrupted;
    this.live.effectListeners.delete(this.listener); this.live.onended = () => {};
    // This private branch stops accepting input while its existing effects decay.
    try { this.live.dry?.disconnect(this.gate!); } catch { /* disconnected device */ }
    this.gate?.gain.setValueAtTime(0, this.context!.currentTime);
    this.live.stop(); this.engine.endAudioRecording();
    this.status('finishing', interrupted ? 'Input interrupted · retaining available audio…' : this.meta!.mode === 'wet' ? 'Finishing effects…' : 'Saving recording…');
    if (!interrupted && this.meta!.mode === 'wet') await new Promise(resolve => setTimeout(resolve, 3000));
    await Promise.all([this.capture?.stop(), this.dry?.stop()]);
    this.meta!.incomplete ||= !!this.capture?.failed || !!this.dry?.failed;
    if (!this.capture?.frames) { this.cleanup(); await removePending(this.prefix); this.meta = undefined; this.status('idle', 'No audio captured'); return; }
    await writePending(this.prefix + 'meta', this.meta).catch(() => {});
    await this.retry();
  }
  private async encode() {
    if (this.encoded) return this.encoded;
    if (!this.meta || !this.capture?.frames) throw new Error('No recording is available.');
    const { identity, input, bpm, offset, mode, latency, incomplete } = this.meta;
    const name = identity.name + (incomplete ? ' · Interrupted recording' : '');
    const recording = { source: 'external' as const, bpm, offsetCycles: offset, duration: this.capture.duration, trimStart: 0, trimEnd: this.capture.duration, incomplete, inputId: input.id, trackId: identity.trackId, mode, effectsCode: input.appliedCode, latencySeconds: latency };
    const blob = new Blob([await this.capture.wav()], { type: 'audio/wav' });
    const asset = await takeAsset(identity.assetId, name, { ...recording, dryAssetId: this.dry?.frames ? identity.dryAssetId : undefined }, blob);
    const result = [{ asset, blob }];
    if (this.dry?.frames) { const blob = new Blob([await this.dry.wav()], { type: 'audio/wav' }); result.push({ asset: await takeAsset(identity.dryAssetId, identity.name + ' dry', { ...recording, mode: 'dry' }, blob), blob }); }
    return this.encoded = result;
  }
  async retry() {
    if (this.state === 'saving') return;
    this.status('saving', 'Saving recording…');
    try {
      const audio = await this.encode(); await this.commit(this.meta!.identity, audio, this.prefix + 'meta');
      const message = this.meta!.incomplete ? 'Interrupted recording saved to the timeline' : 'Recording saved to the timeline';
      this.cleanup(); await removePending(this.prefix).catch(() => {}); this.meta = undefined; this.encoded = undefined;
      this.status('idle', message);
    } catch (error) { this.status('failed', `Recording retained. ${(error as Error).message}`); }
  }
  async discard() {
    if (this.state !== 'failed') return;
    await removePending(this.prefix); this.cleanup(); this.meta = undefined; this.encoded = undefined; this.status('idle', 'Recording discarded');
  }
  async download() {
    const audio = await this.encode(); const url = URL.createObjectURL(audio[0].blob), link = document.createElement('a');
    link.href = url; link.download = `${this.meta!.identity.name}.wav`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
  async restore() {
    this.prefix = `timeline-audio:${this.project().sessionId}:`; this.meta = await readPending<Meta>(this.prefix + 'meta');
    if (!this.meta) return;
    if (this.project().tabs.some(t => t.id === this.meta!.identity.tabId)) { await removePending(this.prefix); this.meta = undefined; return; }
    this.context = new AudioContext({ sampleRate: this.meta.rate });
    this.capture = new AudioTakeCapture(this.context, this.context.createGain(), () => {}); await this.capture.restore(this.prefix);
    if (!this.capture.frames) { this.cleanup(); this.meta = undefined; await removePending(this.prefix); return; }
    this.meta.incomplete = true;
    if (this.meta.mode === 'wet') { this.dry = new AudioTakeCapture(this.context, this.context.createGain(), () => {}); await this.dry.restore(this.prefix + 'dry:'); }
    this.status('failed', 'Recovered interrupted recording. Retry save to place it on the timeline, or download it.');
  }
  private cleanup() {
    clearTimeout(this.timer); this.live.effectListeners.delete(this.listener); this.live.onended = () => {};
    try { this.live.dry?.disconnect(this.gate!); } catch { /* source gone */ }
    this.capture?.disconnect(); this.dry?.disconnect(); this.gate?.disconnect(); this.effects?.disconnect();
    if (this.context && this.context !== this.engine.audioContext) void this.context.close();
    this.capture = this.dry = undefined; this.gate = undefined; this.effects = undefined;
  }
}
