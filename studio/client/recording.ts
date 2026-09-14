import type { CaptureView } from '../shared/capture-state';
import type { AudioInput } from '../shared/model';
import { saveRecording } from './storage/workspace';
import { readPending, readPendingPrefix, removePending } from './recovery';
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
  private context?: AudioContext;
  private objectURL?: string;
  private source: 'internal' | 'external' = 'external';
  private incomplete = false;
  private offset = 0;
  private bpm = 120;
  private busy = false;
  private recoveryPrefix = '';
  destination?: { tabId: string; clipId: string; trackId: string };
  private phase?: CaptureView['state'];
  private kept?: { key: string; asset: Asset };
  get captureView(): CaptureView | undefined {
    if (!this.phase || !this.destination) return;
    return { ...this.destination, state: this.phase, kind: 'new-pattern', start: this.offset, end: this.offset + (this.capture?.duration ?? 0) * this.bpm / 240, label: `${this.el<HTMLInputElement>('name').value} · ${this.phase === 'review' ? 'Ready to review' : this.phase}` };
  }
  /** Compatibility review only. All new audio capture belongs to TimelineRecording. */
  constructor(private engine: Engine, private saved: (asset: Asset) => Promise<void>, private report: (message: string) => void, private session: () => string, private acceptTake?: (asset: Asset) => Promise<void>) {
    this.root.hidden = true; this.root.className = 'recording-recovery'; this.root.setAttribute('aria-label', 'Recovered audio take');
    this.root.innerHTML = `<p data-status role="status"></p><audio data-preview controls></audio><div class="form-row"><label>Take name <input data-name maxlength="80" value="Recovered take"></label><button data-save>Keep take</button><button data-discard>Discard</button></div><details><summary>Trim recovered take</summary><div class="form-row"><label>Start (seconds)<input data-trim-start type="number" min="0" step="0.01" value="0"></label><label>End (seconds)<input data-trim-end type="number" min="0" step="0.01" value="0"></label><button data-trim>Preview trim</button></div></details><input data-latency type="hidden" value="0"><label hidden><input data-insert type="checkbox" checked> Place take in composition</label>`;
    this.button('trim', () => this.preview()); this.button('save', () => this.save()); this.button('discard', () => this.discard());
  }
  private el<T extends HTMLElement = HTMLElement>(name: string) { return this.root.querySelector<T>(`[data-${name}]`)!; }
  private button(name: string, action: () => unknown | Promise<unknown>) { this.el<HTMLButtonElement>(name).onclick = async () => { if (this.busy && !(this.phase === 'preparing' && ['stop', 'discard'].includes(name))) return; this.busy = true; try { await action(); } catch (error) { if (name === 'save' || name === 'record') this.phase = 'failed'; this.report((error as Error).message); this.status((error as Error).message); } finally { this.busy = false; } }; }
  private status(text: string) { this.el('status').textContent = text; }
  get pending() { return this.phase === 'preparing' || this.phase === 'saving' || !!(this.capture?.frames || this.capture?.recording); }
  async stop(_global = false) { this.el<HTMLAudioElement>('preview').pause(); }
  private async preview() {
    if (!this.capture?.frames || this.capture.recording) throw new Error('Stop a nonempty recording before previewing.');
    const start = Number(this.el<HTMLInputElement>('trim-start').value), end = Number(this.el<HTMLInputElement>('trim-end').value);
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end > this.capture.duration + .001 || end <= start) throw new Error('Choose trim points within the take.');
    if (this.objectURL) URL.revokeObjectURL(this.objectURL);
    this.objectURL = URL.createObjectURL(new Blob([await this.capture.wav(start, end)], { type: 'audio/wav' })); this.el<HTMLAudioElement>('preview').src = this.objectURL;
  }
  private async save() {
    await this.preview(); this.phase = 'saving';
    const start = Number(this.el<HTMLInputElement>('trim-start').value), end = Math.min(Number(this.el<HTMLInputElement>('trim-end').value), this.capture!.duration);
    const metadata = { label: this.el<HTMLInputElement>('name').value, recording: { source: this.source, bpm: this.bpm, offsetCycles: this.offset + start * this.bpm / 240, duration: this.capture!.duration, trimStart: start, trimEnd: end, incomplete: this.incomplete, inputId: this.takeInput?.id, trackId: this.destination?.trackId ?? this.takeInput?.trackId, mode: this.mode, effectsCode: this.effectsSnapshot, rate: this.context!.sampleRate, frames: Math.floor((end - start) * this.context!.sampleRate), latencySeconds: Number(this.el<HTMLInputElement>('latency').value) } };
    const dry = this.dryCapture?.frames ? await saveRecording({ ...metadata, label: metadata.label + ' dry', recording: { ...metadata.recording, mode: 'dry' } }, new Blob([await this.dryCapture.wav(start, end)], { type: 'audio/wav' })) : undefined;
    if (dry) await this.saved(dry);
    const key = JSON.stringify(metadata);
    const result = this.kept?.key === key ? this.kept.asset : await saveRecording({ ...metadata, recording: { ...metadata.recording, dryAssetId: dry?.id } }, new Blob([await this.capture!.wav(start, end)], { type: 'audio/wav' }));
    this.kept = { key, asset: result };
    await this.saved(result); if (this.el<HTMLInputElement>('insert').checked) await this.acceptTake?.(result); this.discard(); this.status('Saved to the sound library');
  }
  async restore() {
    const prefix = `audio:${this.session()}:`; const meta = await readPending<{ source: 'internal' | 'external'; bpm: number; offset: number; rate: number; tabId: string; destination?: { tabId: string; clipId: string; trackId: string }; mode?: 'dry' | 'wet'; effectsCode?: string; input?: AudioInput }>(prefix + 'meta');
    if (!meta) return; const chunks = await readPendingPrefix<{ left: Float32Array<ArrayBuffer>; right: Float32Array<ArrayBuffer> }>(prefix + 'chunk:'); if (!chunks.length) return;
    this.source = meta.source; this.bpm = meta.bpm; this.offset = meta.offset; this.destination = meta.destination; this.phase = 'review'; this.recoveryPrefix = prefix; this.incomplete = true;
    this.context = new AudioContext({ sampleRate: meta.rate }); this.capture = new AudioTakeCapture(this.context, this.context.createGain(), () => {}); await this.capture.restore(prefix, chunks.filter(c => !(c instanceof Blob))); this.mode = meta.mode ?? 'dry'; this.effectsSnapshot = meta.effectsCode ?? 'AUDIO'; this.takeInput = meta.input; if (this.mode === 'wet') { this.dryCapture = new AudioTakeCapture(this.context, this.context.createGain(), () => {}); await this.dryCapture.restore(prefix + 'dry:'); }
    this.root.hidden = false; this.el<HTMLInputElement>('insert').checked = !!meta.destination; this.el<HTMLInputElement>('trim-end').value = this.capture.duration.toFixed(3); await this.preview(); this.status('Recovered audio take · review incomplete capture before saving');
  }
  discard() { if (this.phase === 'preparing') this.engine.countIn.cancel(); this.phase = undefined; this.kept = undefined; if (this.recoveryPrefix) void removePending(this.recoveryPrefix).catch(() => {}); this.recoveryPrefix = ''; this.cleanup(); this.el<HTMLAudioElement>('preview').removeAttribute('src'); if (this.objectURL) URL.revokeObjectURL(this.objectURL); this.objectURL = undefined; this.el<HTMLInputElement>('trim-start').value = '0'; this.root.hidden = true; this.status('Take discarded'); }
  private cleanup() { this.dryCapture?.disconnect(); this.dryCapture = undefined; this.capture?.disconnect(); this.capture = undefined; if (this.context && this.context !== this.engine.audioContext) void this.context.close(); this.context = undefined; }
}
