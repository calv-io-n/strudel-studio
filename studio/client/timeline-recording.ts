import type { RecordingTarget } from '../shared/recording-target';
import { recordedSection, validateRecordingTarget } from '../shared/recording-target';
import type { CaptureView } from '../shared/capture-state';
import type { AudioInput, Asset, Project } from '../shared/model';
import { checkTakeCapacity, type TakeIdentity } from '../shared/recorded-take';
import { AudioTakeCapture } from './audio-take';
import { createInputEffects } from './input-effects';
import type { Engine } from './engine';
import type { LiveInput } from './live-input';
import { readPending, writePending, removePending } from './recovery';
import { takeAsset } from './storage/recorded-take';
export type RecordOptions = { target?: RecordingTarget; prepareMidi?: () => Promise<void>; startMidi?: (at: number) => void; stopMidi?: () => void; deferCommit?: boolean; accompaniment?: boolean; trackId: string; device: string; channel: string; mode: 'wet' | 'dry'; latency: number; countin: boolean; internal?: { name: string; prepare: () => Promise<AudioNode> } };
type Meta = { source?: 'external' | 'internal'; identity: TakeIdentity; input: AudioInput; bpm: number; offset: number; rate: number; mode: 'wet' | 'dry'; latency: number; incomplete: boolean };
export class TimelineRecording {
  state: 'idle' | 'preparing' | 'recording' | 'finishing' | 'saving' | 'failed' | 'review' = 'idle';
  message = '';
  private options?: RecordOptions;
  private capture?: AudioTakeCapture;
  private dry?: AudioTakeCapture;
  private gate?: GainNode;
  private source?: AudioNode;
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
  get captureView(): CaptureView | undefined {
    if (!this.meta || this.state === 'idle') return;
    const { identity } = this.meta;
    const tab = this.project().tabs.find(t => t.id === identity.tabId);
    const rate = (tab?.tempoBpm ?? this.project().bpm) / this.project().bpm;
    const composition = identity.target?.context !== 'tab';
    return {
      audio: !!identity.target, state: this.state, tabId: identity.tabId,
      code: this.encoded ? recordedSection(this.encoded[0].asset, identity.target?.offset, rate) : undefined,
      trackId: composition ? identity.trackId : undefined, clipId: composition ? identity.clipId : undefined,
      kind: identity.target ? 'append' : 'new-pattern', start: composition ? this.startCycle : undefined, end: composition ? this.endCycle : undefined,
      label: `${identity.name} · ${this.state === 'failed' ? 'Save failed · take retained' : this.state}`,
    };
  }
  get pending() { return this.state !== 'idle'; }
  get identity() { return this.meta?.identity; }
  get startCycle() { return this.meta?.offset ?? 0; }
  get elapsed() { return this.state === 'recording' ? Math.max(0, (this.context?.currentTime ?? 0) - this.at) : this.capture?.duration ?? 0; }
  get endCycle() { return this.startCycle + this.elapsed * (this.meta?.bpm ?? 120) / 240; }
  private status(state: typeof this.state, message: string) { this.state = state; this.message = message; this.changed(); }
  async start(options: RecordOptions) {
    if (this.pending) return;
    if (!options.target) checkTakeCapacity(this.project());
    else validateRecordingTarget(this.project(), options.target);
    this.options = options;
    if (!Number.isFinite(options.latency) || Math.abs(options.latency) > 2) throw new Error('Latency compensation must be between -2 and 2 seconds.');
    const position = options.target?.position ?? this.engine.timelinePosition;
    if (!options.target && !this.project().tracks.some(t => t.id === options.trackId)) throw new Error('Choose a recording track.');
    if (!options.target && this.project().clips.some(c => c.trackId === options.trackId && c.start <= position && c.start + c.length > position)) throw new Error('This track has a clip at the playhead. Move the playhead to empty space or choose another track.');
    const nextClip = options.target ? options.target.end ?? 4095 : Math.min(4095, ...this.project().clips.filter(c => c.trackId === options.trackId && c.start > position).map(c => c.start));
    const tail = options.mode === 'wet' ? 3 : 0;
    if (!options.target && (nextClip - position) * 240 / this.project().bpm <= tail + .1 + (options.countin ? 240 / this.project().bpm : 0)) throw new Error('Choose a longer empty section to record, including the effects tail.');
    const epoch = ++this.epoch;
    let n = 1; while (this.project().tabs.some(t => t.name === `Audio take ${n}`) || this.project().tracks.some(t => t.name === `Audio take ${n}`)) n++;
    const identity = { target: options.target, assetId: crypto.randomUUID(), dryAssetId: crypto.randomUUID(), tabId: options.target?.tabId ?? crypto.randomUUID(), trackId: options.target?.trackId ?? options.trackId, clipId: options.target?.clipId ?? crypto.randomUUID(), name: `Audio take ${n}` };
    this.prefix = `timeline-audio:${this.project().sessionId}:`;
    const bpm = this.project().bpm;
    this.meta = { source: options.internal ? 'internal' : 'external', identity, input: options.internal ? { id: identity.assetId, name: options.internal.name, trackId: identity.trackId, enabled: false, mode: 'audio', code: 'AUDIO', appliedCode: 'AUDIO', anchors: [] } : structuredClone(this.input()), bpm, offset: position, rate: 48000, mode: options.mode, latency: options.latency, incomplete: false };
    this.status('preparing', options.internal ? 'Preparing recording…' : 'Connecting audio input…');
    try {
      await options.prepareMidi?.();
      if (epoch !== this.epoch) return;
      const input = this.meta.input;
      if (options.internal) {
        await this.engine.unlock(); this.source = await options.internal.prepare(); this.context = this.engine.audioContext;
      } else {
        this.input().enabled = true;
        if (!this.live.active) await this.live.connect(this.input(), options.device, options.channel);
        this.source = this.live.dry; this.context = this.live.context;
      }
      if (epoch !== this.epoch) return;
      if (!this.source) throw new Error('Input connection was cancelled.');
      this.gate = this.context.createGain(); this.source.connect(this.gate);
      this.effects = createInputEffects(this.context, input.appliedCode); this.gate.connect(this.effects.input);
      if (!options.internal) this.live.effectListeners.add(this.listener);
      const failed = (message: string) => { if (this.meta) this.meta.incomplete = true; this.message = message; void this.stop(true); };
      const capture = new AudioTakeCapture(this.context, options.mode === 'wet' ? this.effects.output : this.gate, () => {}, failed); this.capture = capture;
      await capture.setup();
      if (epoch !== this.epoch) { capture.disconnect(); return; }
      if (options.mode === 'wet' && !options.internal) { const dry = new AudioTakeCapture(this.context, this.gate, () => {}, failed); this.dry = dry; await dry.setup(); if (epoch !== this.epoch) { dry.disconnect(); return; } }
      this.meta!.rate = this.context.sampleRate;
      const bpm = this.meta!.bpm;
      await writePending(this.prefix + 'meta', this.meta);
      if (epoch !== this.epoch) return;
      if (!await this.engine.countIn.wait(bpm) || epoch !== this.epoch) return;
      if (options.target?.context === 'tab') { if (options.accompaniment !== false) await this.engine.evaluate(true, options.target.tabId); }
      else { if (options.target) this.engine.transport.position = options.target.position; await this.engine.beginAudioRecording(); }
      if (epoch !== this.epoch) return;
      const recordingPosition = () => options.target?.context === 'tab' ? position : this.engine.timelinePosition;
      const wait = .025;
      this.at = this.context.currentTime + wait;
      this.meta.offset = recordingPosition() + wait * bpm / 240;
      // Persist the exact scheduled start before publishing any chunks.
      await writePending(this.prefix + 'meta', this.meta);
      if (this.context.currentTime >= this.at) {
        this.at = this.context.currentTime + .025;
        this.meta.offset = recordingPosition() + .025 * bpm / 240;
        await writePending(this.prefix + 'meta', this.meta);
      }
      if (epoch !== this.epoch) return;
      const limit = Math.min(897, (nextClip - this.meta.offset) * 240 / bpm - (options.target ? 0 : tail) - .05, 248_000_000 / (this.context.sampleRate * 8) - 3);
      if (limit <= 0) throw new Error('Move the playhead earlier before recording.');
      if (this.meta.identity.target) this.meta.identity.target.offset += this.meta.offset - position;
      options.startMidi?.(this.at);
      this.capture.onstart = actual => { if (!this.meta) return; this.meta.offset += (actual - this.at) * bpm / 240; if (this.meta.identity.target) this.meta.identity.target.offset += (actual - this.at) * bpm / 240; void writePending(this.prefix + 'meta', this.meta).catch(() => {}); };
      this.capture.start(this.at, this.prefix, limit + 3); this.dry?.start(this.at, this.prefix + 'dry:', limit + 3);
      if (!options.internal) this.live.onended = () => void this.stop(true);
      this.timer = setTimeout(() => void this.stop(), (limit + wait) * 1000);
      this.status('recording', options.countin ? 'Count-in…' : 'Recording');
    } catch (error) {
      if (epoch !== this.epoch) return;
      if (this.engine.recordingTransport) this.engine.endAudioRecording();
      options.stopMidi?.(); this.cleanup(); this.meta = undefined;
      this.status('idle', (error as Error).message); throw error;
    }
  }
  stop(interrupted = false): Promise<void> {
    if (this.finishing) return this.finishing;
    if (this.state === 'preparing') { this.options?.stopMidi?.(); this.engine.countIn.cancel(); ++this.epoch; if (this.engine.recordingTransport) this.engine.endAudioRecording(); if (this.meta?.source !== 'internal') this.live.disconnect(); this.cleanup(); this.meta = undefined; this.status('idle', 'Recording cancelled'); return Promise.resolve(); }
    if (this.state !== 'recording') return Promise.resolve();
    this.finishing = this.finish(interrupted).finally(() => { this.finishing = undefined; });
    return this.finishing;
  }
  private async finish(interrupted: boolean) {
    clearTimeout(this.timer);
    this.options?.stopMidi?.();
    this.meta!.incomplete ||= interrupted;
    this.live.effectListeners.delete(this.listener); this.live.onended = () => {};
    // This private branch stops accepting input while its existing effects decay.
    try { this.source?.disconnect(this.gate!); } catch { /* disconnected device */ }
    this.gate?.gain.setValueAtTime(0, this.context!.currentTime);
    this.live.stop(); this.engine.endAudioRecording();
    this.status('finishing', interrupted ? 'Input interrupted · retaining available audio…' : this.meta!.mode === 'wet' ? 'Finishing effects…' : 'Saving recording…');
    if (!interrupted && this.meta!.mode === 'wet') await new Promise(resolve => setTimeout(resolve, 3000));
    await Promise.all([this.capture?.stop(), this.dry?.stop()]);
    this.meta!.incomplete ||= !!this.capture?.failed || !!this.dry?.failed;
    if (!this.capture?.frames) { this.cleanup(); await removePending(this.prefix); this.meta = undefined; this.status('idle', 'No audio captured'); return; }
    await writePending(this.prefix + 'meta', this.meta).catch(() => {});
    if (this.options?.deferCommit) {
      try { await this.encode(); this.status('review', 'Audio ready · review and keep take'); }
      catch (error) { this.status('failed', `Recording retained. ${(error as Error).message}`); }
      return;
    }
    await this.retry();
  }
  async encode() {
    if (this.encoded) return this.encoded;
    if (!this.meta || !this.capture?.frames) throw new Error('No recording is available.');
    const { identity, input, bpm, offset, mode, latency, incomplete } = this.meta;
    const name = identity.name + (incomplete ? ' · Interrupted recording' : '');
    const recording = { source: this.meta.source ?? 'external', bpm, offsetCycles: offset, duration: this.capture.duration, trimStart: 0, trimEnd: this.capture.duration, incomplete, inputId: input.id, trackId: identity.trackId, mode, effectsCode: input.appliedCode, latencySeconds: latency };
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
      const message = this.meta!.incomplete ? 'Interrupted recording saved to the timeline' : this.meta!.identity.target ? 'Audio saved in pattern' : 'Recording saved to the timeline';
      this.cleanup(); await removePending(this.prefix).catch(() => {}); this.meta = undefined; this.encoded = undefined;
      this.status('idle', message);
    } catch (error) { this.status('failed', `Recording retained. ${(error as Error).message}`); }
  }
  async discard() {
    if (this.state !== 'failed' && this.state !== 'review') return;
    await removePending(this.prefix); this.cleanup(); this.meta = undefined; this.encoded = undefined; this.status('idle', 'Recording discarded');
  }
  async download() {
    const audio = await this.encode(); const url = URL.createObjectURL(audio[0].blob), link = document.createElement('a');
    link.href = url; link.download = `${this.meta!.identity.name}.wav`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
  async restore() {
    this.prefix = `timeline-audio:${this.project().sessionId}:`; this.meta = await readPending<Meta>(this.prefix + 'meta');
    if (!this.meta) return;
    if (this.meta.identity.target ? this.project().assetIds.includes(this.meta.identity.assetId) : this.project().tabs.some(t => t.id === this.meta!.identity.tabId)) { await removePending(this.prefix); this.meta = undefined; return; }
    this.context = new AudioContext({ sampleRate: this.meta.rate });
    this.capture = new AudioTakeCapture(this.context, this.context.createGain(), () => {}); await this.capture.restore(this.prefix);
    if (!this.capture.frames) { this.cleanup(); this.meta = undefined; await removePending(this.prefix); return; }
    this.meta.incomplete = true;
    if (this.meta.mode === 'wet') { this.dry = new AudioTakeCapture(this.context, this.context.createGain(), () => {}); await this.dry.restore(this.prefix + 'dry:'); }
    await this.encode();
    this.status('failed', 'Recovered interrupted recording. Preview, then retry save to keep it.');
  }
  private cleanup() {
    clearTimeout(this.timer); this.live.effectListeners.delete(this.listener); this.live.onended = () => {};
    try { this.source?.disconnect(this.gate!); } catch { /* source gone */ }
    this.capture?.disconnect(); this.dry?.disconnect(); this.gate?.disconnect(); this.effects?.disconnect();
    if (this.context && this.context !== this.engine.audioContext) void this.context.close();
    this.capture = this.dry = undefined; this.source = undefined; this.gate = undefined; this.effects = undefined;
  }
}
