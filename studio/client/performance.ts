import { MidiTake, transcribe, phraseNotes, PendingMidiSchema } from '../shared/performance';
import type { Engine } from './engine';
import type { StudioEditor } from './editor';

export class PerformancePanel {
  take?: MidiTake;
  owner?: StudioEditor;
  pendingAudio: () => boolean = () => false;
  private fallback = false;
  private recoveryKey = '';
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
  constructor(private editor: () => StudioEditor, private tab: () => { id: string; name: string }, private report: (message: string) => void, private engine: Engine, private session: () => string, private saveSession: () => Promise<void>) {
    this.root.className = 'performance-panel'; this.root.hidden = true;
    this.root.setAttribute('aria-label', 'Play into selection');
    this.root.innerHTML = `<div class="form-row"><strong data-destination></strong><button data-close>Leave performance</button></div><p data-state role="status">Armed · choose an output</p><div data-actions class="form-row"><button data-audition>Audition</button><button data-transcribe>Transcribe</button><button data-fallback>Use fallback synth</button><button data-stop>Stop take</button></div><div class="form-row"><label>Phrase cycles <input data-length type="number" min="0.25" max="64" step="0.25" value="4"></label><label>Quantization <select data-grid><option value="0.0625">1/16 cycle</option><option value="0.125">1/8 cycle</option><option value="0.25">1/4 cycle</option><option value="0">Unquantized</option></select></label><label><input data-countin type="checkbox"> One-cycle count-in</label></div><div class="form-row"><button data-preview>Preview isolated</button><button data-preview-mix>Preview with accompaniment</button><button data-accept>Accept into selection</button><button data-discard>Discard</button><button data-retry>Retry</button><button data-retarget>Retarget take to selection</button></div><div class="form-row"><label>Loop start <input data-jam-start type="number" min="0" step="0.25" value="0"></label><label>Loop end <input data-jam-end type="number" min="0.25" step="0.25" value="4"></label><button data-jam>Jam with composition</button><button data-leave-jam>Leave jam</button><label><input data-suppress type="checkbox"> Suppress original phrase</label></div><p data-jam-state role="status"></p><div class="performance-diff"><div><h3>Original</h3><pre data-original></pre></div><div><h3>Proposed · editable pattern</h3><pre data-proposed>No take yet</pre></div></div>`;
    const advanced = document.createElement('details'); advanced.className = 'performance-options';
    const summary = document.createElement('summary'); summary.textContent = 'Timing and accompaniment'; advanced.append(summary);
    this.root.querySelector('[data-actions]')!.after(this.root.querySelector('.performance-diff')!);
    advanced.append(this.root.querySelector('[data-length]')!.closest('.form-row')!, this.root.querySelector('[data-jam-start]')!.closest('.form-row')!, this.root.querySelector('[data-jam-state]')!, this.root.querySelector('[data-fallback]')!, this.root.querySelector('[data-retarget]')!);
    this.root.append(advanced);
    this.root.querySelector('[data-accept]')!.classList.add('primary');
    this.button('audition', async () => { await this.prepare(); this.audition = true; this.status('Audition · no code or audio is saved'); });
    this.button('fallback', () => { this.fallback = true; this.values = { s: 'triangle', gain: .2 }; this.audition = true; this.status('Audition · fallback triangle synth'); });
    this.button('jam', async () => {
      if (!this.take) return;
      this.stop();
      await this.engine.startJam(this.take.destination.tabId, Number(this.root.querySelector<HTMLInputElement>('[data-jam-start]')!.value), Number(this.root.querySelector<HTMLInputElement>('[data-jam-end]')!.value));
      this.root.querySelector('[data-jam-state]')!.textContent = `Loop ${this.engine.jam!.begin}–${this.engine.jam!.end} · excluding ${this.root.querySelector('[data-destination]')!.textContent}`;
    });
    this.button('leave-jam', () => { this.stop(); this.engine.endJam(); this.root.querySelector('[data-jam-state]')!.textContent = ''; });
    this.root.querySelector<HTMLInputElement>('[data-suppress]')!.onchange = async event => {
      const input = event.target as HTMLInputElement;
      try { await this.engine.suppressPhrase(this.owner!, this.take!.destination.tabId, this.take!.destination.original, input.checked); }
      catch (error) { input.checked = false; this.report((error as Error).message); }
    };
    this.button('transcribe', () => this.start());
    this.button('preview', () => this.preview(true));
    this.button('preview-mix', () => this.preview(false));
    this.button('accept', () => this.accept());
    this.button('discard', () => this.discard());
    this.button('retarget', () => { this.stop(); if (!this.take) throw new Error('No pending take.'); const owner = this.editor(); const destination = owner.arm(this.tab().id); if (owner !== this.owner) this.owner?.disarm(); this.owner = owner; this.take.destination = destination; this.values = undefined; this.root.querySelector('[data-original]')!.textContent = destination.original; this.root.querySelector('[data-destination]')!.textContent = this.tab().name; this.paint(); });
    this.button('retry', async () => { this.discard(); await this.start(); });
    this.button('stop', () => this.stop());
    this.root.querySelector<HTMLButtonElement>('[data-close]')!.onclick = () => { try { this.close(); } catch (error) { this.report((error as Error).message); } };
  }
  protected button(name: string, action: () => unknown | Promise<unknown>) {
    this.root.querySelector<HTMLButtonElement>(`[data-${name}]`)!.onclick = async () => { try { await action(); } catch (error) { this.report((error as Error).message); } };
  }
  protected status(text: string) { this.root.querySelector('[data-state]')!.textContent = text; }
  async prepare() {
    if (!this.owner?.destination?.valid) throw new Error('The destination changed. Select a supported note expression again.');
    this.values = this.fallback ? { s: 'triangle', gain: .2 } : await this.engine.performanceValues(this.owner, this.take!.destination.soundCode); this.audition = true;
  }
  async note(key: string, pitch: number, velocity: number, on: boolean) {
    if (!this.take) return false;
    if (this.take.state === 'capturing' && this.elapsed >= 0) {
      this.take.note(key, pitch, velocity, this.elapsed, on); this.paint();
    }
    if (!on) this.engine.performanceAudio.release(key);
    else if (this.audition && this.values) await this.engine.performanceAudio.play(key, this.engine.refreshPerformanceValues(this.values, this.owner!), pitch, velocity);
    return true;
  }
  private get elapsed() { return (this.engine.performanceAudio.time - this.startedAt) * this.cps; }
  private code() { return this.take ? transcribe(this.take.notes, this.length, this.grid, Math.max(0, this.elapsed)) : ''; }
  private paint() {
    this.persist();
    this.root.querySelector('[data-proposed]')!.textContent = this.code() || 'No take yet';
    this.root.querySelector<HTMLButtonElement>('[data-accept]')!.disabled = !this.take?.notes.length || !this.owner?.destination?.valid || this.take.state === 'capturing';
  }
  private persist() {
    if (!this.take?.notes.length) return;
    try {
      const key = `studio.midi-take:${this.session()}`;
      if (this.recoveryKey && this.recoveryKey !== key) localStorage.removeItem(this.recoveryKey);
      this.recoveryKey = key;
      localStorage.setItem(key, JSON.stringify({ destination: this.owner?.destination ?? this.take.destination, notes: this.take.notes, length: this.length, grid: this.grid, cps: this.cps, fallback: this.fallback }));
    } catch { this.status('Take is retained in memory; browser recovery storage is unavailable.'); }
  }
  restore(editorFor: (id: string) => StudioEditor) {
    const key = `studio.midi-take:${this.session()}`;
    const text = localStorage.getItem(key); if (!text) return;
    const saved = PendingMidiSchema.parse(JSON.parse(text));
    if (!saved.destination || !Array.isArray(saved.notes) || !saved.notes.length || saved.notes.length > 10000) return;
    this.owner = editorFor(saved.destination.tabId); this.owner.restoreDestination(saved.destination);
    this.take = new MidiTake(this.owner.destination!); this.take.notes = saved.notes; this.length = saved.length; this.grid = saved.grid; this.cps = saved.cps; this.fallback = saved.fallback;
    this.take.stop(this.length); this.recoveryKey = key; this.root.hidden = false;
    this.root.querySelector('[data-original]')!.textContent = this.take.destination.original;
    this.root.querySelector('[data-destination]')!.textContent = `Recovered take · ${this.take.destination.tabId}`;
    this.paint(); this.status('Recovered MIDI take · review before accepting');
  }
  private clearRecovery() { try { localStorage.removeItem(this.recoveryKey || `studio.midi-take:${this.session()}`); } catch { /* memory remains authoritative */ } }
  private async start() {
    if (!this.take || this.take.notes.length) throw new Error('Accept, Discard, or Retry the pending take first.');
    await this.saveSession();
    this.length = Number(this.root.querySelector<HTMLInputElement>('[data-length]')!.value);
    this.grid = Number(this.root.querySelector<HTMLSelectElement>('[data-grid]')!.value);
    phraseNotes([], this.length, this.grid, 0);
    await this.prepare();
    this.cps = this.engine.started ? this.engine.repl.scheduler.cps : this.engine.tempo / 240;
    this.startedAt = this.engine.performanceAudio.time + (this.engine.started ? (Math.ceil(this.engine.cycle) - this.engine.cycle) / this.cps : 0) + (this.root.querySelector<HTMLInputElement>('[data-countin]')!.checked ? 1 / this.cps : 0);
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
    this.stop(); this.clearRecovery(); if (this.take) void this.engine.suppressPhrase(this.owner!, this.take.destination.tabId, this.take.destination.original, false);
    this.root.querySelector<HTMLInputElement>('[data-suppress]')!.checked = false;
    if (this.take) this.take = new MidiTake(this.take.destination); this.paint(); this.status('Discarded · original code unchanged');
  }
  private accept() {
    if (this.take?.state === 'capturing') throw new Error('Stop the take before accepting.');
    const code = this.code(); if (!code) throw new Error('An empty take cannot replace code.');
    this.owner!.acceptTake(code); this.clearRecovery(); void this.engine.suppressPhrase(this.owner!, this.take!.destination.tabId, this.take!.destination.original, false); this.take = undefined; this.stop(); if (!this.pendingAudio()) this.close();
  }
  private async preview(isolated: boolean) {
    if (!this.take?.notes.length) throw new Error('Play a take before previewing.');
    this.stop(); if (!this.values) await this.prepare(); this.engine.isolatePerformance(isolated);
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
  globalStop() { this.stop(); this.engine.endJam(); this.root.querySelector('[data-jam-state]')!.textContent = ''; }
  arm() {
    if (this.pendingAudio()) throw new Error('Save or discard the pending audio take before changing destinations.');
    if (this.take?.notes.length) throw new Error('Accept or discard the pending take before changing destinations.');
    this.globalStop(); this.values = undefined; this.fallback = false;
    const next = this.editor();
    const destination = next.arm(this.tab().id);
    if (this.owner !== next) this.owner?.disarm();
    this.owner = next; this.take = new MidiTake(destination);
    this.root.querySelector<HTMLInputElement>('[data-jam-end]')!.value = String(this.engine.arrangementLength || 4);
    this.root.hidden = false;
    this.root.querySelector('[data-destination]')!.textContent = this.tab().name;
    this.root.querySelector('[data-original]')!.textContent = destination.original; this.paint();
    this.status(`Armed · ${this.engine.tempo} BPM · 4 beats per cycle`);
  }
  close() {
    if (this.pendingAudio()) throw new Error('Save or discard the pending audio take before leaving performance.');
    if (this.take?.notes.length) throw new Error('Accept or discard the pending take before leaving.');
    this.stop(); this.engine.endJam();
    if (this.take) void this.engine.suppressPhrase(this.owner!, this.take.destination.tabId, this.take.destination.original, false);
    this.engine.performanceAudio.silence();
    this.owner?.disarm(); this.owner = undefined; this.take = undefined; this.root.hidden = true;
  }
}
