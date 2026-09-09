import type { LiveInput } from './live-input';
import type { AudioInput } from '../shared/model';
import { saveRecording } from './storage/workspace';
import { writePending, readPending, readPendingPrefix, removePending } from './recovery';
import { AudioTakeCapture } from './audio-take';
import type { Asset } from '../shared/model';
import type { Engine } from './engine';

export class RecordingPanel {
  readonly root = document.createElement('section');
  private capture?: AudioTakeCapture;
  private dryCapture?: AudioTakeCapture;
  private mode: 'dry' | 'wet' = 'dry';
  private effectsSnapshot = 'AUDIO';
  private takeInput?: AudioInput;
  private stream?: MediaStream;
  private input?: AudioNode;
  private monitor?: GainNode;
  private context?: AudioContext;
  private timer?: ReturnType<typeof setTimeout>;
  private tailTimer?: ReturnType<typeof setTimeout>;
  private objectURL?: string;
  private source: 'internal' | 'external' = 'external';
  private incomplete = false;
  private offset = 0;
  private bpm = 120;
  private busy = false;
  private recoveryPrefix = '';
  private chunkIndex = 0;
  private pinnedTab = '';
  private recovering = false;
  constructor(private engine: Engine, private prepareInternal: () => Promise<void>, private saved: (asset: Asset) => Promise<void>, private report: (message: string) => void, private session: () => string, private stopInternal: () => void, private live?: LiveInput, private inputConfig?: () => AudioInput, private acceptTake?: (asset: Asset) => Promise<void>) {
    this.root.hidden = true; this.root.setAttribute('aria-label', 'Record audio');
    this.root.innerHTML = `<h2>Audio take</h2><label>Recording source <select data-source><option value="external">Audio input</option><option value="internal">Highlighted sound</option></select></label><label>Take type<select data-mode><option value="dry">Dry — editable effects</option><option value="wet">Wet / frozen — preserve performed effects</option></select></label><label>Latency compensation (seconds)<input data-latency type="number" value="0" min="-2" max="2" step="0.001"></label><button data-setup>Set up source</button><label>Audio input <select data-device><option value="">Default input</option></select></label><label>Input channels <select data-channel><option value="stereo">All available (up to stereo)</option></select></label><label><input data-monitor type="checkbox"> Monitor input</label><meter data-level min="0" max="1" value="0" aria-label="Input level"></meter><p data-status role="status">Choose a source and check its level.</p><label><input data-countin type="checkbox"> One-cycle count-in</label><label>Capture cycles (0 = until stopped) <input data-cycles type="number" min="0" max="4096" step="0.25" value="0"></label><div class="form-row"><button data-record>Record audio take</button><button data-stop>Stop recording</button><button data-tail>End tail</button></div><div class="form-row"><label>Jam start <input data-jam-start type="number" min="0" step="0.25" value="0"></label><label>Jam end <input data-jam-end type="number" min="0.25" step="0.25" value="4"></label><button data-jam>Jam while recording</button><button data-jam-end-button>End recording jam</button></div><audio data-preview controls></audio><div class="form-row"><label>Trim start (seconds)<input data-trim-start type="number" min="0" step="0.01" value="0"></label><label>Trim end (seconds)<input data-trim-end type="number" min="0" step="0.01" value="0"></label></div><button data-trim>Preview trim</button><label>Take name <input data-name maxlength="80" value="Recorded take"></label><div class="form-row"><label><input data-insert type="checkbox" checked> Place take in composition</label><button data-save>Save sound</button><button data-discard>Discard take</button></div><p class="hint">Looping is off. Save retains the trimmed performance with its tempo and start offset. Insert the saved sound from the library.</p>`;
    this.button('jam', () => this.engine.startJam(this.pinnedTab || this.engine.destinationTabId, Number(this.el<HTMLInputElement>('jam-start').value), Number(this.el<HTMLInputElement>('jam-end').value)));
    this.button('jam-end-button', () => this.engine.endJam());
    this.button('setup', () => this.setup()); this.button('record', () => this.start()); this.button('stop', () => this.stop()); this.button('tail', () => this.finish());
    this.button('trim', () => this.preview()); this.button('save', () => this.save()); this.button('discard', () => this.discard());
    this.el<HTMLSelectElement>('source').onchange = () => { if (this.capture?.frames || this.capture?.recording) { this.el<HTMLSelectElement>('source').value = this.source; this.report('Save or discard the pending take before changing source.'); } else { this.source = this.el<HTMLSelectElement>('source').value as typeof this.source; this.cleanup(); } };
    this.el<HTMLInputElement>('monitor').onchange = () => { this.live?.setMonitoring(this.el<HTMLInputElement>('monitor').checked); };
    this.el<HTMLSelectElement>('channel').onchange = () => { this.report('Set up source again to use the selected channel.'); };
  }
  private el<T extends HTMLElement = HTMLElement>(name: string) { return this.root.querySelector<T>(`[data-${name}]`)!; }
  private button(name: string, action: () => unknown | Promise<unknown>) { this.el<HTMLButtonElement>(name).onclick = async () => { if (this.busy) return; this.busy = true; try { await action(); } catch (error) { this.report((error as Error).message); this.status((error as Error).message); } finally { this.busy = false; } }; }
  private status(text: string) { this.el('status').textContent = text; }
  get pending() { return !!(this.capture?.frames || this.capture?.recording); }
  async open(source: 'internal' | 'external') { if (this.pending && source !== this.source) throw new Error('Save or discard the current audio take before switching sources.'); this.pinnedTab = this.engine.destinationTabId; this.source = source; this.el<HTMLSelectElement>('source').value = source; this.el('source').closest('label')!.hidden = true; for (const field of ['device', 'channel', 'monitor', 'latency', 'mode']) this.el(field).closest('label')!.hidden = true; this.el<HTMLInputElement>('jam-end').value = String(this.engine.arrangementLength || 4); this.root.hidden = false; }
  private async setup() {
    if (this.pending) throw new Error('Save or discard the current take before changing its source.');
    this.cleanup();
    if (this.source === 'internal') {
      this.takeInput = undefined; this.mode = 'wet'; this.effectsSnapshot = 'AUDIO'; await this.prepareInternal(); this.context = this.engine.audioContext; this.input = this.engine.performanceAudio.output;
    } else {
      this.takeInput = this.inputConfig?.();
      if (this.live && this.takeInput) {
        if (!this.live.active) await this.live.connect(this.takeInput, this.el<HTMLSelectElement>('device').value, this.el<HTMLSelectElement>('channel').value);
        if (!this.live.active || !this.live.dry || !this.live.effects) throw new Error('Input permission was cancelled.');
        this.context = this.live.context; this.mode = this.el<HTMLSelectElement>('mode').value as 'dry' | 'wet';
        this.effectsSnapshot = this.takeInput.appliedCode;
        this.input = this.mode === 'wet' ? this.live.effects.output : this.live.dry;
        this.live.onended = () => { this.incomplete = true; void this.finish().then(() => this.status('Input disconnected · incomplete take retained')); };
        if (this.mode === 'wet') { this.dryCapture = new AudioTakeCapture(this.context, this.live.dry, () => {}, message => { this.incomplete = true; this.status(message); void this.finish(); }); await this.dryCapture.setup(); }
      } else throw new Error('Open Audio input and arm a device first.');

    }
    this.capture = new AudioTakeCapture(this.context!, this.input!, peak => { this.el<HTMLMeterElement>('level').value = peak; this.el('level').title = peak >= .99 ? 'Clipping — lower input gain' : 'Input level'; }, message => { this.incomplete = true; this.status(message); void this.finish(); });
    await this.capture.setup(); this.status(`${this.source === 'internal' ? 'Highlighted sound only' : 'Selected input only'} · ready`);
  }
  private async start() {
    if (this.pending) throw new Error('Save or discard the pending take before recording again.');
    if (!this.capture || this.source === 'external' && this.mode !== this.el<HTMLSelectElement>('mode').value) await this.setup();
    if (this.takeInput) this.effectsSnapshot = this.takeInput.appliedCode;
    this.incomplete = false; this.bpm = this.engine.started ? this.engine.repl.scheduler.cps * 240 : this.engine.tempo;
    const countin = this.el<HTMLInputElement>('countin').checked ? 240 / this.bpm : 0;
    this.offset = (this.engine.started ? this.engine.timelinePosition : this.engine.transport.position) + countin * this.bpm / 240;
    const cycles = Number(this.el<HTMLInputElement>('cycles').value);
    if (!Number.isFinite(cycles) || cycles < 0 || cycles > 4096) throw new Error('Choose a valid capture length.');
    this.recoveryPrefix = `audio:${this.session()}:`; this.chunkIndex = 0;
    await removePending(this.recoveryPrefix);
    await writePending(`${this.recoveryPrefix}meta`, { source: this.source, bpm: this.bpm, offset: this.offset, rate: this.context!.sampleRate, tabId: this.pinnedTab, mode: this.mode, effectsCode: this.effectsSnapshot, input: this.takeInput });
    const at = this.context!.currentTime + countin + .025; this.offset += .025 * this.bpm / 240;
    const duration = cycles ? cycles * 240 / this.bpm : 900;
    this.capture!.start(at, this.recoveryPrefix, duration); this.dryCapture?.start(at, this.recoveryPrefix + 'dry:', duration);
    this.timer = setTimeout(() => void this.stop(), Math.min(900, (cycles ? cycles * 240 / this.bpm : 900) + countin) * 1000);
    this.status(countin ? 'Count-in, then recording · Audio take' : 'Recording · Audio take');
  }
  async stop(global = false) {
    if (!this.capture?.recording && !this.capture?.frames) return;
    clearTimeout(this.timer); if (this.source === 'internal') this.stopInternal();
    if (this.source === 'internal' && !global) { this.status('Finishing effect tail…'); this.tailTimer = setTimeout(() => void this.finish(), 3000); }
    else await this.finish();
  }
  private async finish() {
    clearTimeout(this.timer); clearTimeout(this.tailTimer);
    if (this.capture?.recording && this.source === 'internal') this.stopInternal();
    await Promise.all([this.capture?.stop(), this.dryCapture?.stop()]); this.incomplete ||= !!this.capture?.failed || !!this.dryCapture?.failed;
    if (this.capture?.frames) { this.el<HTMLInputElement>('trim-end').value = this.capture.duration.toFixed(3); await this.preview(); this.status(this.incomplete ? 'Incomplete take retained for review' : 'Take retained for review'); }
  }
  private async preview() {
    if (!this.capture?.frames || this.capture.recording) throw new Error('Stop a nonempty recording before previewing.');
    const start = Number(this.el<HTMLInputElement>('trim-start').value), end = Number(this.el<HTMLInputElement>('trim-end').value);
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end > this.capture.duration + .001 || end <= start) throw new Error('Choose trim points within the take.');
    if (this.objectURL) URL.revokeObjectURL(this.objectURL);
    this.objectURL = URL.createObjectURL(new Blob([await this.capture.wav(start, end)], { type: 'audio/wav' })); this.el<HTMLAudioElement>('preview').src = this.objectURL;
  }
  private async save() {
    await this.preview();
    const start = Number(this.el<HTMLInputElement>('trim-start').value), end = Math.min(Number(this.el<HTMLInputElement>('trim-end').value), this.capture!.duration);
    const metadata = { label: this.el<HTMLInputElement>('name').value, recording: { source: this.source, bpm: this.bpm, offsetCycles: this.offset + start * this.bpm / 240, duration: this.capture!.duration, trimStart: start, trimEnd: end, incomplete: this.incomplete, inputId: this.takeInput?.id, trackId: this.takeInput?.trackId, mode: this.mode, effectsCode: this.effectsSnapshot, rate: this.context!.sampleRate, frames: Math.floor((end - start) * this.context!.sampleRate), latencySeconds: Number(this.el<HTMLInputElement>('latency').value) } };
    const dry = this.dryCapture ? await saveRecording({ ...metadata, label: metadata.label + ' dry', recording: { ...metadata.recording, mode: 'dry' } }, new Blob([await this.dryCapture.wav(start, end)], { type: 'audio/wav' })) : undefined;
    if (dry) await this.saved(dry);
    const result = await saveRecording({ ...metadata, recording: { ...metadata.recording, dryAssetId: dry?.id } }, new Blob([await this.capture!.wav(start, end)], { type: 'audio/wav' }));
    await this.saved(result); if (this.el<HTMLInputElement>('insert').checked) await this.acceptTake?.(result); this.discard(); this.status('Saved to the sound library');
  }
  async restore() {
    const prefix = `audio:${this.session()}:`; const meta = await readPending<{ source: 'internal' | 'external'; bpm: number; offset: number; rate: number; tabId: string; mode?: 'dry' | 'wet'; effectsCode?: string; input?: AudioInput }>(prefix + 'meta');
    if (!meta) return; const chunks = await readPendingPrefix<{ left: Float32Array<ArrayBuffer>; right: Float32Array<ArrayBuffer> }>(prefix + 'chunk:'); if (!chunks.length) return;
    this.source = meta.source; this.bpm = meta.bpm; this.offset = meta.offset; this.pinnedTab = meta.tabId; this.recoveryPrefix = prefix; this.incomplete = true;
    this.context = new AudioContext({ sampleRate: meta.rate }); this.capture = new AudioTakeCapture(this.context, this.context.createGain(), () => {}); await this.capture.restore(prefix, chunks.filter(c => !(c instanceof Blob))); this.mode = meta.mode ?? 'dry'; this.effectsSnapshot = meta.effectsCode ?? 'AUDIO'; this.takeInput = meta.input; if (this.mode === 'wet') { this.dryCapture = new AudioTakeCapture(this.context, this.context.createGain(), () => {}); await this.dryCapture.restore(prefix + 'dry:'); }
    this.root.hidden = false; this.el<HTMLSelectElement>('source').value = meta.source; this.el<HTMLInputElement>('trim-end').value = this.capture.duration.toFixed(3); await this.preview(); this.status('Recovered audio take · review incomplete capture before saving');
  }
  discard() { if (this.recoveryPrefix) void removePending(this.recoveryPrefix).catch(() => {}); this.recoveryPrefix = ''; clearTimeout(this.timer); clearTimeout(this.tailTimer); this.cleanup(); this.el<HTMLAudioElement>('preview').removeAttribute('src'); if (this.objectURL) URL.revokeObjectURL(this.objectURL); this.objectURL = undefined; this.el<HTMLInputElement>('trim-start').value = '0'; this.status('Take discarded'); }
  private cleanup() { this.dryCapture?.disconnect(); this.dryCapture = undefined; this.capture?.disconnect(); this.capture = undefined; this.stream?.getTracks().forEach(track => track.stop()); this.stream = undefined; this.monitor?.disconnect(); this.monitor = undefined; if (this.context && this.context !== this.engine.audioContext) void this.context.close(); this.context = undefined; }
}
