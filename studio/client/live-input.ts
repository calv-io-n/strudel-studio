import type { Engine } from './engine';
import type { AudioInput, Project } from '../shared/model';
import { createInputEffects } from './input-effects';
import { compileAudioEffects } from '../shared/audio-input';
import { read, write } from './storage/database';
export class LiveInput {
  stream?: MediaStream;
  dry?: GainNode;
  effects?: ReturnType<typeof createInputEffects>;
  private source?: MediaStreamAudioSourceNode;
  private splitter?: ChannelSplitterNode;
  private merger?: ChannelMergerNode;
  private monitor?: GainNode;
  private epoch = 0;
  private inputMeter?: AnalyserNode;
  private outputMeter?: AnalyserNode;
  private meterData = new Float32Array(1024);
  monitoring = false;
  pending = false;
  settings?: MediaTrackSettings;
  readonly effectListeners = new Set<(code: string) => void>();
  onended: () => void = () => {};
  constructor(private engine: Engine, private project: () => Project) {}
  get context() { return this.engine.audioContext; }
  get active() { return !!this.stream; }
  async connect(config: AudioInput, deviceId?: string, channel?: string) {
    this.disconnect(); const epoch = ++this.epoch; this.pending = true;
    compileAudioEffects(config.appliedCode);
    const hint = await read<{ deviceId: string; channel: string }>('settings', 'audio-device');
    if (epoch !== this.epoch) return;
    deviceId ??= hint?.deviceId; channel ??= hint?.channel ?? 'stereo';
    await this.engine.unlock(); if (epoch !== this.epoch) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: deviceId ? { exact: deviceId } : undefined, channelCount: { ideal: 2 }, echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
      if (epoch !== this.epoch) { stream.getTracks().forEach(t => t.stop()); return; }
      this.stream = stream; const track = stream.getAudioTracks()[0]; this.settings = track.getSettings();
      const count = this.settings.channelCount ?? 1;
      this.source = this.context.createMediaStreamSource(stream); this.dry = this.context.createGain();
      if (channel !== 'stereo' || count > 2) {
        const pair = channel === 'stereo' ? [0, 1] : channel.split(',').map(Number);
        if (pair.length > 2 || pair.some(c => !Number.isInteger(c) || c < 0 || c >= count)) throw new Error('Selected input channel is unavailable.');
        this.splitter = this.context.createChannelSplitter(count); this.source.connect(this.splitter);
        if (pair.length === 2) {
          this.merger = this.context.createChannelMerger(2);
          pair.forEach((c, side) => this.splitter!.connect(this.merger!, c, side)); this.merger.connect(this.dry);
        } else this.splitter.connect(this.dry, pair[0]);
      } else this.source.connect(this.dry);
      this.effects = createInputEffects(this.context, config.appliedCode); this.dry.connect(this.effects.input);
      this.inputMeter = this.context.createAnalyser(); this.outputMeter = this.context.createAnalyser(); this.inputMeter.fftSize = this.outputMeter.fftSize = 1024; this.dry.connect(this.inputMeter); this.effects.output.connect(this.outputMeter);
      this.monitor = this.context.createGain(); this.monitor.gain.value = 0; this.effects.output.connect(this.monitor).connect(this.engine.masterInput);
      track.onended = () => { this.setMonitoring(false); this.onended(); this.disconnect(); };
      await write([{ collection: 'settings', key: 'audio-device', value: { deviceId: this.settings.deviceId ?? deviceId ?? '', channel } }]);
    } catch (error) { if (epoch === this.epoch) this.disconnect(); throw error; }
    finally { if (epoch === this.epoch) this.pending = false; }
  }
  apply(code: string) { compileAudioEffects(code); this.effects?.apply(code); this.effectListeners.forEach(listener => listener(code)); }
  setMonitoring(on: boolean) { this.monitoring = on && this.active; this.mix(); }
  mix() {
    const p = this.project(), input = p.audioInput, track = p.tracks.find(t => t.id === input?.trackId);
    if (this.monitor) this.monitor.gain.setTargetAtTime(this.monitoring && input?.enabled && track && !track.muted && (!p.soloTrackId || p.soloTrackId === track.id) ? 1 : 0, this.context.currentTime, .01);
  }
  levels() { const peak = (node?: AnalyserNode) => { if (!node) return 0; node.getFloatTimeDomainData(this.meterData); return this.meterData.reduce((a, b) => Math.max(a, Math.abs(b)), 0); }; return { input: peak(this.inputMeter), output: peak(this.outputMeter) }; }
  stop() { this.setMonitoring(false); }
  disconnect() {
    ++this.epoch; this.pending = false; this.monitoring = false;
    this.stream?.getTracks().forEach(t => { t.onended = null; t.stop(); }); this.stream = undefined;
    this.inputMeter?.disconnect(); this.outputMeter?.disconnect(); this.inputMeter = this.outputMeter = undefined;
    this.source?.disconnect(); this.splitter?.disconnect(); this.merger?.disconnect(); this.merger = undefined; this.dry?.disconnect(); this.effects?.disconnect(); this.monitor?.disconnect();
    this.source = undefined; this.splitter = undefined; this.dry = undefined; this.effects = undefined; this.monitor = undefined;
  }
}
