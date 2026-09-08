import { MidiTake, transcribe, phraseNotes } from '../shared/performance';
import type { Engine } from './engine';
import type { StudioEditor } from './editor';

export class PerformancePanel {
  take?: MidiTake;
  owner?: StudioEditor;
  private values?: Record<string, any>;
  private audition = false;
  private startedAt = 0;
  private cps = .5;
  private length = 4;
  private grid = .0625;
  private timer?: ReturnType<typeof setInterval>;
  private previewTimers: ReturnType<typeof setTimeout>[] = [];
  private previewEpoch = 0;
  readonly root = document.createElement('section');
  constructor(private editor: () => StudioEditor, private tab: () => { id: string; name: string }, private report: (message: string) => void, private engine: Engine) {
    this.root.className = 'performance-panel'; this.root.hidden = true;
    this.root.setAttribute('aria-label', 'Play into selection');
    this.root.innerHTML = `<div class="form-row"><strong data-destination></strong><button data-close>Leave performance</button></div><p data-state role="status">Armed · choose an output</p><div data-actions class="form-row"><button data-audition>Audition</button><button data-transcribe>Transcribe</button><button data-fallback>Use fallback synth</button><button data-stop>Stop take</button></div><div class="form-row"><label>Phrase cycles <input data-length type="number" min="0.25" max="64" step="0.25" value="4"></label><label>Quantization <select data-grid><option value="0.0625">1/16 cycle</option><option value="0.125">1/8 cycle</option><option value="0.25">1/4 cycle</option><option value="0">Unquantized</option></select></label><label><input data-countin type="checkbox"> One-cycle count-in</label></div><div class="form-row"><button data-preview>Preview isolated</button><button data-preview-mix>Preview with accompaniment</button><button data-accept>Accept into selection</button><button data-discard>Discard</button><button data-retry>Retry</button></div><div class="performance-diff"><div><h3>Original</h3><pre data-original></pre></div><div><h3>Proposed · editable pattern</h3><pre data-proposed>No take yet</pre></div></div>`;
    this.button('audition', async () => { await this.prepare(); this.audition = true; this.status('Audition · no code or audio is saved'); });
    this.button('fallback', () => { this.values = { s: 'triangle', gain: .2 }; this.audition = true; this.status('Audition · fallback triangle synth'); });
    this.button('transcribe', () => this.start());
    this.button('preview', () => this.preview(true));
    this.button('preview-mix', () => this.preview(false));
    this.button('accept', () => this.accept());
    this.button('discard', () => this.discard());
    this.button('retry', async () => { this.discard(); await this.start(); });
    this.button('stop', () => this.stop());
    this.root.querySelector<HTMLButtonElement>('[data-close]')!.onclick = () => { try { this.close(); } catch (error) { this.report((error as Error).message); } };
  }
  protected button(name: string, action: () => unknown | Promise<unknown>) {
    this.root.querySelector<HTMLButtonElement>(`[data-${name}]`)!.onclick = async () => { try { await action(); } catch (error) { this.report((error as Error).message); } };
  }
  protected status(text: string) { this.root.querySelector('[data-state]')!.textContent = text; }
  private async prepare() {
    if (!this.owner?.destination?.valid) throw new Error('The destination changed. Select a supported note expression again.');
    this.values = await this.engine.performanceValues(this.owner, this.take!.destination.soundCode);
  }
  async note(key: string, pitch: number, velocity: number, on: boolean) {
    if (!this.take) return false;
    if (this.take.state === 'capturing' && this.elapsed >= 0) {
      this.take.note(key, pitch, velocity, this.elapsed, on); this.paint();
    }
    if (!on) this.engine.performanceAudio.release(key);
    else if (this.audition && this.values) await this.engine.performanceAudio.play(key, this.values, pitch, velocity);
    return true;
  }
  private get elapsed() { return (this.engine.performanceAudio.time - this.startedAt) * this.cps; }
  private code() { return this.take ? transcribe(this.take.notes, this.length, this.grid, Math.max(0, this.elapsed)) : ''; }
  private paint() {
    this.root.querySelector('[data-proposed]')!.textContent = this.code() || 'No take yet';
    this.root.querySelector<HTMLButtonElement>('[data-accept]')!.disabled = !this.take?.notes.length || !this.owner?.destination?.valid || this.take.state === 'capturing';
  }
  private async start() {
    if (!this.take || this.take.notes.length) throw new Error('Accept, Discard, or Retry the pending take first.');
    this.length = Number(this.root.querySelector<HTMLInputElement>('[data-length]')!.value);
    this.grid = Number(this.root.querySelector<HTMLSelectElement>('[data-grid]')!.value);
    phraseNotes([], this.length, this.grid, 0);
    await this.prepare();
    this.cps = this.engine.started ? this.engine.repl.scheduler.cps : this.engine.tempo / 240;
    this.startedAt = this.engine.performanceAudio.time + (this.root.querySelector<HTMLInputElement>('[data-countin]')!.checked ? 1 / this.cps : 0);
    this.take.start(); this.audition = true;
    clearInterval(this.timer);
    this.timer = setInterval(() => {
      this.paint();
      this.status(this.elapsed < 0 ? 'Count-in…' : `Transcribing · editable pattern · ${this.length} cycles · ${Math.round(this.cps * 240)} BPM`);
      if (this.elapsed >= this.length) this.stop();
    }, 50);
  }
  stop() {
    clearInterval(this.timer); this.timer = undefined;
    this.previewEpoch++; this.previewTimers.forEach(clearTimeout); this.previewTimers = [];
    if (this.take?.state === 'capturing') this.take.stop(Math.min(this.length, Math.max(0, this.elapsed)));
    this.audition = false; this.engine.performanceAudio.stop(); this.engine.isolatePerformance(false);
    this.status('Stopped · take retained for review'); this.paint();
  }
  private discard() {
    this.stop(); if (this.take) this.take = new MidiTake(this.take.destination); this.paint(); this.status('Discarded · original code unchanged');
  }
  private accept() {
    if (this.take?.state === 'capturing') throw new Error('Stop the take before accepting.');
    const code = this.code(); if (!code) throw new Error('An empty take cannot replace code.');
    this.owner!.acceptTake(code); this.take = undefined; this.stop(); this.close();
  }
  private async preview(isolated: boolean) {
    if (!this.take?.notes.length) throw new Error('Play a take before previewing.');
    this.stop(); this.engine.isolatePerformance(isolated);
    const epoch = this.previewEpoch;
    for (const [i, note] of phraseNotes(this.take.notes, this.length, this.grid, this.elapsed).entries()) {
      this.previewTimers.push(setTimeout(() => {
        if (epoch !== this.previewEpoch) return;
        void this.engine.performanceAudio.play(`preview:${epoch}:${i}`, this.values!, note.pitch, note.velocity, (note.end - note.start) / this.cps).catch(error => this.report(error.message));
      }, note.start / this.cps * 1000));
    }
    this.previewTimers.push(setTimeout(() => { if (epoch === this.previewEpoch) this.stop(); }, this.length / this.cps * 1000 + 1500));
    this.status(isolated ? 'Preview · isolated take' : 'Preview · with accompaniment');
  }
  arm() {
    if (this.take?.notes.length) throw new Error('Accept or discard the pending take before changing destinations.');
    this.stop(); this.values = undefined;
    const next = this.editor();
    const destination = next.arm(this.tab().id);
    if (this.owner !== next) this.owner?.disarm();
    this.owner = next; this.take = new MidiTake(destination);
    this.root.hidden = false;
    this.root.querySelector('[data-destination]')!.textContent = this.tab().name;
    this.root.querySelector('[data-original]')!.textContent = destination.original; this.paint();
    this.status(`Armed · ${this.engine.tempo} BPM · 4 beats per cycle`);
  }
  close() {
    if (this.take?.notes.length) throw new Error('Accept or discard the pending take before leaving.');
    this.stop(); this.engine.performanceAudio.silence();
    this.owner?.disarm(); this.owner = undefined; this.take = undefined; this.root.hidden = true;
  }
}
