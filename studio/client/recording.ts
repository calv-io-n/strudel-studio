import { AudioTakeCapture } from './audio-take';
import type { Asset } from '../shared/model';
import type { Engine } from './engine';

export class RecordingPanel {
  readonly root = document.createElement('section');
  private capture?: AudioTakeCapture;
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
  constructor(private engine: Engine, private prepareInternal: () => Promise<void>, private saved: (asset: Asset) => Promise<void>, private report: (message: string) => void) {
    this.root.hidden = true; this.root.setAttribute('aria-label', 'Record audio');
    this.root.innerHTML = `<h2>Audio take</h2><label>Recording source <select data-source><option value="external">Audio input</option><option value="internal">Highlighted sound</option></select></label><button data-setup>Set up source</button><label>Audio input <select data-device><option value="">Default input</option></select></label><label>Input channels <select data-channel><option value="stereo">All available (up to stereo)</option></select></label><label><input data-monitor type="checkbox"> Monitor input</label><meter data-level min="0" max="1" value="0" aria-label="Input level"></meter><p data-status role="status">Choose a source and check its level.</p><label><input data-countin type="checkbox"> One-cycle count-in</label><label>Capture cycles (0 = until stopped) <input data-cycles type="number" min="0" max="4096" step="0.25" value="0"></label><div class="form-row"><button data-record>Record audio take</button><button data-stop>Stop recording</button><button data-tail>End tail</button></div><div class="form-row"><label>Jam start <input data-jam-start type="number" min="0" step="0.25" value="0"></label><label>Jam end <input data-jam-end type="number" min="0.25" step="0.25" value="4"></label><button data-jam>Jam while recording</button><button data-jam-end-button>End recording jam</button></div><audio data-preview controls></audio><div class="form-row"><label>Trim start (seconds)<input data-trim-start type="number" min="0" step="0.01" value="0"></label><label>Trim end (seconds)<input data-trim-end type="number" min="0" step="0.01" value="0"></label></div><button data-trim>Preview trim</button><label>Take name <input data-name maxlength="80" value="Recorded take"></label><div class="form-row"><button data-save>Save sound</button><button data-discard>Discard take</button></div><p class="hint">Looping is off. Save retains the trimmed performance with its tempo and start offset. Insert the saved sound from the library.</p>`;
    this.button('jam', () => this.engine.startJam(this.engine.destinationTabId, Number(this.el<HTMLInputElement>('jam-start').value), Number(this.el<HTMLInputElement>('jam-end').value)));
    this.button('jam-end-button', () => this.engine.endJam());
    this.button('setup', () => this.setup()); this.button('record', () => this.start()); this.button('stop', () => this.stop()); this.button('tail', () => this.finish());
    this.button('trim', () => this.preview()); this.button('save', () => this.save()); this.button('discard', () => this.discard());
    this.el<HTMLSelectElement>('source').onchange = () => { if (this.capture?.frames || this.capture?.recording) { this.el<HTMLSelectElement>('source').value = this.source; this.report('Save or discard the pending take before changing source.'); } else { this.source = this.el<HTMLSelectElement>('source').value as typeof this.source; this.cleanup(); } };
    this.el<HTMLInputElement>('monitor').onchange = () => { if (this.monitor) this.monitor.gain.value = this.el<HTMLInputElement>('monitor').checked ? 1 : 0; };
    this.el<HTMLSelectElement>('channel').onchange = () => { this.report('Set up source again to use the selected channel.'); };
  }
  private el<T extends HTMLElement = HTMLElement>(name: string) { return this.root.querySelector<T>(`[data-${name}]`)!; }
  private button(name: string, action: () => unknown | Promise<unknown>) { this.el<HTMLButtonElement>(name).onclick = async () => { if (this.busy) return; this.busy = true; try { await action(); } catch (error) { this.report((error as Error).message); this.status((error as Error).message); } finally { this.busy = false; } }; }
  private status(text: string) { this.el('status').textContent = text; }
  get pending() { return !!(this.capture?.frames || this.capture?.recording); }
  async open(source: 'internal' | 'external') { if (this.pending && source !== this.source) throw new Error('Save or discard the current audio take before switching sources.'); this.source = source; this.el<HTMLSelectElement>('source').value = source; this.el<HTMLInputElement>('jam-end').value = String(this.engine.arrangementLength || 4); this.root.hidden = false; }
  private async setup() {
    if (this.pending) throw new Error('Save or discard the current take before changing its source.');
    this.cleanup();
    if (this.source === 'internal') {
      await this.prepareInternal(); this.context = this.engine.audioContext; this.input = this.engine.performanceAudio.output;
    } else {
      const deviceId = this.el<HTMLSelectElement>('device').value;
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: deviceId ? { exact: deviceId } : undefined, echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: { ideal: 2 } } });
      this.context = new AudioContext();
      const source = this.context.createMediaStreamSource(this.stream);
      const count = this.stream.getAudioTracks()[0].getSettings().channelCount ?? 1;
      const channel = this.el<HTMLSelectElement>('channel').value;
      this.el('channel').replaceChildren(...['stereo', ...Array.from({ length: count }, (_, i) => String(i))].map(value => { const option = document.createElement('option'); option.value = value; option.textContent = value === 'stereo' ? 'All available (up to stereo)' : `Mono input ${Number(value) + 1}`; option.selected = value === channel; return option; }));
      if (channel !== 'stereo') { if (Number(channel) >= count) throw new Error('The selected channel is unavailable on this input.'); const split = this.context.createChannelSplitter(count), mono = this.context.createGain(); source.connect(split); split.connect(mono, Number(channel)); this.input = mono; } else this.input = source;
      this.monitor = this.context.createGain(); this.monitor.gain.value = 0; this.el<HTMLInputElement>('monitor').checked = false; this.input.connect(this.monitor); this.monitor.connect(this.context.destination);
      const devices = await navigator.mediaDevices.enumerateDevices();
      this.el('device').replaceChildren(...devices.filter(d => d.kind === 'audioinput').map(d => { const option = document.createElement('option'); option.value = d.deviceId; option.textContent = d.label || 'Audio input'; option.selected = d.deviceId === this.stream!.getAudioTracks()[0].getSettings().deviceId; return option; }));
      this.stream.getAudioTracks()[0].onended = () => { this.incomplete = true; void this.finish().then(() => this.status('Input disconnected · incomplete take retained')); };
    }
    this.capture = new AudioTakeCapture(this.context!, this.input!, peak => { this.el<HTMLMeterElement>('level').value = peak; this.el('level').title = peak >= .99 ? 'Clipping — lower input gain' : 'Input level'; });
    await this.capture.setup(); this.status(`${this.source === 'internal' ? 'Highlighted sound only' : 'Selected input only'} · ready`);
  }
  private async start() {
    if (this.pending) throw new Error('Save or discard the pending take before recording again.');
    if (!this.capture) await this.setup();
    this.incomplete = false; this.bpm = this.engine.started ? this.engine.repl.scheduler.cps * 240 : this.engine.tempo;
    const countin = this.el<HTMLInputElement>('countin').checked ? 240 / this.bpm : 0;
    this.offset = this.engine.cycle + countin * this.bpm / 240;
    const cycles = Number(this.el<HTMLInputElement>('cycles').value);
    if (!Number.isFinite(cycles) || cycles < 0 || cycles > 4096) throw new Error('Choose a valid capture length.');
    this.capture!.start(this.context!.currentTime + countin);
    this.timer = setTimeout(() => void this.stop(), Math.min(900, (cycles ? cycles * 240 / this.bpm : 900) + countin) * 1000);
    this.status(countin ? 'Count-in, then recording · Audio take' : 'Recording · Audio take');
  }
  async stop(global = false) {
    if (!this.capture?.recording) return;
    clearTimeout(this.timer); this.engine.performanceAudio.stop();
    if (this.source === 'internal' && !global) { this.status('Finishing effect tail…'); this.tailTimer = setTimeout(() => void this.finish(), 3000); }
    else await this.finish();
  }
  private async finish() {
    clearTimeout(this.timer); clearTimeout(this.tailTimer);
    await this.capture?.stop();
    if (this.capture?.frames) { this.el<HTMLInputElement>('trim-end').value = this.capture.duration.toFixed(3); this.preview(); this.status(this.incomplete ? 'Incomplete take retained for review' : 'Take retained for review'); }
  }
  private preview() {
    if (!this.capture?.frames || this.capture.recording) throw new Error('Stop a nonempty recording before previewing.');
    const start = Number(this.el<HTMLInputElement>('trim-start').value), end = Number(this.el<HTMLInputElement>('trim-end').value);
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end > this.capture.duration + .001 || end <= start) throw new Error('Choose trim points within the take.');
    if (this.objectURL) URL.revokeObjectURL(this.objectURL);
    this.objectURL = URL.createObjectURL(new Blob([this.capture.wav(start, end)], { type: 'audio/wav' })); this.el<HTMLAudioElement>('preview').src = this.objectURL;
  }
  private async save() {
    this.preview();
    const start = Number(this.el<HTMLInputElement>('trim-start').value), end = Math.min(Number(this.el<HTMLInputElement>('trim-end').value), this.capture!.duration);
    const metadata = { label: this.el<HTMLInputElement>('name').value, recording: { source: this.source, bpm: this.bpm, offsetCycles: this.offset + start * this.bpm / 240, duration: this.capture!.duration, trimStart: start, trimEnd: end, incomplete: this.incomplete } };
    const res = await fetch('/api/recordings', { method: 'POST', headers: { 'Content-Type': 'audio/wav', 'X-Studio-Metadata': encodeURIComponent(JSON.stringify(metadata)) }, body: this.capture!.wav(start, end) });
    const result = await res.json(); if (!res.ok) throw new Error(result.error);
    await this.saved(result); this.discard(); this.status('Saved to the sound library');
  }
  discard() { clearTimeout(this.timer); clearTimeout(this.tailTimer); this.cleanup(); this.el<HTMLAudioElement>('preview').removeAttribute('src'); if (this.objectURL) URL.revokeObjectURL(this.objectURL); this.objectURL = undefined; this.el<HTMLInputElement>('trim-start').value = '0'; this.status('Take discarded'); }
  private cleanup() { this.capture?.disconnect(); this.capture = undefined; this.stream?.getTracks().forEach(track => track.stop()); this.stream = undefined; this.monitor?.disconnect(); this.monitor = undefined; if (this.context && this.context !== this.engine.audioContext) void this.context.close(); this.context = undefined; }
}
