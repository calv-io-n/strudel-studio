import type { CaptureView } from '../shared/capture-state';
import { beatPosition, beatDuration } from '../shared/tempo';
import { sectionVariation } from '../shared/midi-session';
import { MidiTake, transcribe, transcribeNotes, PendingMidiSchema, type Destination } from '../shared/performance';
import { ClipSchema, type Clip, type Project } from '../shared/model';
import type { StudioEditor } from './editor';
import type { Engine } from './engine';

export class MidiComposition {
  readonly root = document.createElement('section');
  readonly range = document.createElement('section');
  owner?: StudioEditor;
  destination?: Destination;
  clip?: Clip;
  private saving = false;
  get captureView(): CaptureView | undefined {
    if (!this.destination || !this.clip || !this.running && !this.pending && !this.saving) return;
    const state = this.saving ? 'saving' : 'review';
    return { state, kind: 'phrase', tabId: this.destination.tabId, clipId: this.clip.id, trackId: this.clip.trackId, start: this.begin, end: this.running ? this.begin + Math.min(this.end - this.begin, this.engine.cycle) : this.end, label: state === 'review' ? 'Recovered clip take · ready to review' : 'Saving' };
  }
  private source = '';
  private begin = 0;
  private end = 4;
  private takes: MidiTake[] = [];
  private selected = 0;
  private undo?: { before: Project; after: Project };
  private solo = false;
  private mode: 'original' | 'take' = 'take';
  private previewing = false;
  private recoveryKey = '';
  private customRange = false;
  private format: 'notes' | 'timeCat' = 'notes';
  private grid = 1 / 16;
  constructor(private engine: Engine, private project: () => Project, private commit: (p: Project) => Promise<void>, private session: () => string, private report: (text: string) => void) {
    // Compatibility review only: all new MIDI recording belongs to the shared Record controller.
    this.root.className = 'midi-composition'; this.root.hidden = true; this.root.setAttribute('aria-label', 'Recovered MIDI takes');
    this.root.innerHTML = `<header><strong>Recovered clip take</strong><button data-midi-exit>Leave MIDI</button></header><p data-midi-target></p><p data-midi-status role="status"></p><div data-midi-notes class="midi-note-view" aria-label="Played notes"></div><div class="form-row"><button data-midi-transcribed aria-pressed="false">Preview</button><button data-midi-finish>Finish</button><label>Take <select data-midi-takes aria-label="MIDI take"></select></label><button data-midi-original>Original</button><button data-midi-preview>Preview take</button><button data-midi-solo aria-pressed="false">Solo take</button><button data-midi-accept class="primary">Keep take</button><button data-midi-discard>Discard</button><button data-midi-undo hidden>Undo acceptance</button></div><div class="form-row"><label>Strudel format <select data-midi-format><option value="notes">Notes · snap to beat</option><option value="timeCat">timeCat · played timing</option></select></label><label data-midi-grid-label>Snap <select data-midi-grid><option value="0.25">1 beat</option><option value="0.125">½ beat</option><option value="0.0625" selected>¼ beat</option><option value="0.03125">⅛ beat</option></select></label></div><div class="performance-diff"><div><h3>Original</h3><pre data-midi-before></pre></div><div><h3>Proposed Strudel · not accepted</h3><pre data-midi-after></pre></div></div>`;
    const more = document.createElement('details'); more.className = 'midi-more';
    const summary = document.createElement('summary'); summary.textContent = 'More take controls'; more.append(summary);
    for (const name of ['original', 'preview']) more.append(this.root.querySelector(`[data-midi-${name}]`)!);
    more.append(this.root.querySelector('[data-midi-takes]')!.parentElement!, this.root.querySelector('[data-midi-solo]')!, this.root.querySelector('[data-midi-format]')!.closest('.form-row')!, this.root.querySelector('.performance-diff')!); this.root.append(more);
    this.range.className = 'midi-loop-range'; this.range.hidden = false;
    this.range.innerHTML = `<button data-midi-full>Use full clip</button><label>Destination clip <select data-midi-clip aria-label="MIDI destination clip"></select></label><label>Position (beat) <input data-midi-start type="number" min="1" step="1"></label><label>End (beat) <input data-midi-end type="number" min="2" step="1"></label><span data-midi-length></span>`;
    for (const name of ['format', 'grid']) this.root.querySelector<HTMLSelectElement>(`[data-midi-${name}]`)!.onchange = () => {
      this.format = this.root.querySelector<HTMLSelectElement>('[data-midi-format]')!.value as 'notes' | 'timeCat';
      this.grid = Number(this.root.querySelector<HTMLSelectElement>('[data-midi-grid]')!.value);
      this.root.querySelector<HTMLElement>('[data-midi-grid-label]')!.hidden = this.format !== 'notes';
      this.paint(); this.persist();
      if (this.mode === 'take' && this.takes.length) void this.engine.reviewMidi('take', this.owner!, this.code()).catch(e => this.status(e.message));
    };
    this.action('finish', () => this.finish());
    this.action('transcribed', () => this.preview('take'));
    this.action('preview', () => this.preview('take'));
    this.action('original', () => this.preview('original'));
    this.action('solo', async () => { this.solo = !this.solo; if (this.running) await this.preview('take'); else await this.preview('take'); this.engine.soloMidi(this.solo); this.paint(); });
    this.action('accept', () => this.accept());
    this.action('discard', () => { this.finish(); this.takes = []; void this.engine.reviewMidi('original', this.owner!).catch(() => {}); this.clearRecovery(); this.paint(); this.status('Takes discarded · original section unchanged'); });
    this.action('exit', () => { if (this.pending) throw new Error('Accept or discard the MIDI takes before leaving.'); this.close(); });
    this.action('undo', async () => {
      if (!this.undo) return;
      if (JSON.stringify(this.project()) !== JSON.stringify(this.undo.after)) throw new Error('The project changed after acceptance; restore the section manually to preserve later edits.');
      this.engine.stop(); await this.commit(this.undo.before); this.undo = undefined; this.root.querySelector<HTMLButtonElement>('[data-midi-undo]')!.hidden = true; this.status('Acceptance undone');
    });
    this.root.querySelector<HTMLSelectElement>('[data-midi-takes]')!.onchange = () => { this.selected = Number(this.root.querySelector<HTMLSelectElement>('[data-midi-takes]')!.value); this.paint(); };
    this.range.querySelector<HTMLButtonElement>('[data-midi-full]')!.onclick = () => { if (this.running || this.pending) return; this.customRange = false; this.refreshRange(); };
    this.range.querySelector<HTMLSelectElement>('[data-midi-clip]')!.onchange = () => {
      if (this.pending || this.running) { this.renderRange(); return; }
      const clip = this.project().clips.find(c => c.id === this.range.querySelector<HTMLSelectElement>('[data-midi-clip]')!.value);
      if (clip) { this.clip = { ...clip }; this.begin = clip.start; this.end = clip.start + clip.length; this.renderRange(); }
    };
    for (const edge of ['start', 'end']) for (const suffix of ['']) {
      this.range.querySelector<HTMLInputElement>(`[data-midi-${edge}${suffix}]`)!.oninput = event => {
        if (this.running || this.pending) { this.renderRange(); return; }
        const value = (Number((event.target as HTMLInputElement).value) - 1) / 4;
        try { this.setRange(edge === 'start' ? value : this.begin, edge === 'end' ? value : this.end); } catch (error) { this.renderRange(); this.report((error as Error).message); }
      };
    }
  }
  private action(name: string, run: () => unknown) { this.root.querySelector<HTMLButtonElement>(`[data-midi-${name}]`)!.onclick = async () => { try { if (this.saving) return; await run(); } catch (e) { this.status((e as Error).message); this.report((e as Error).message); } }; }
  private status(text: string) { this.root.querySelector('[data-midi-status]')!.textContent = text; }
  get armed() { return !!this.destination; }
  get running() { return this.saving || this.previewing; }
  get pending() { return !!this.takes.length; }
  resetRange() { this.customRange = false; this.begin = 0; this.end = this.engine.arrangementLength || 4; this.renderRange(); }
  get loopRange() { return { begin: this.begin, end: this.end }; }
  setRange(begin: number, end: number) {
    if (this.running || this.pending) throw new Error('Keep or discard the current take before changing its range.');
    if (![begin, end].every(Number.isFinite) || begin % .25 || end % .25 || begin < 0 || end <= begin || end > (this.engine.arrangementLength || 4)) throw new Error('Choose a nonempty range inside the composition.');
    if (this.clip && (begin < this.clip.start || end > this.clip.start + this.clip.length)) throw new Error('Choose a recording range inside the selected clip. Other placements remain unchanged.');
    this.begin = begin; this.end = end; this.customRange = true; this.renderRange();
  }
  refreshRange() { if (!this.customRange && !this.running && !this.pending) { this.begin = this.clip?.start ?? 0; this.end = this.clip ? this.clip.start + this.clip.length : this.engine.arrangementLength || 4; } this.renderRange(); }
  private renderRange() {
    const select = this.range.querySelector<HTMLSelectElement>('[data-midi-clip]')!; select.replaceChildren();
    for (const clip of this.project().clips.filter(c => c.tabId === this.clip?.tabId)) {
      const option = document.createElement('option'); option.value = clip.id; option.textContent = `${this.project().tracks.find(t => t.id === clip.trackId)?.name} · beats ${beatPosition(clip.start)}–${beatPosition(clip.start + clip.length)}`; select.append(option);
    }
    select.value = this.clip?.id ?? '';
    select.parentElement!.hidden = !this.armed;
    for (const edge of ['start', 'end']) for (const suffix of ['']) {
      const input = this.range.querySelector<HTMLInputElement>(`[data-midi-${edge}${suffix}]`)!;
      input.min = String(beatPosition(this.clip?.start ?? 0)); input.max = String(beatPosition(this.clip ? this.clip.start + this.clip.length : this.engine.arrangementLength || 4)); input.value = String(beatPosition(edge === 'start' ? this.begin : this.end));
    }
    this.range.querySelector('[data-midi-length]')!.textContent = `${beatDuration(this.end - this.begin)} beats selected`;
    this.root.querySelector('[data-midi-target]')!.textContent = `Recording into: ${this.project().tabs.find(t => t.id === this.clip?.tabId)?.name ?? ''} → ${this.destination?.original ?? 'selected phrase'} · Composition placement: ${this.project().tracks.find(t => t.id === this.clip?.trackId)?.name ?? 'none'} · beats ${beatPosition(this.begin)}–${beatPosition(this.end)}. Keep take creates a variation for this clip; other placements stay unchanged.`;
  }
  finish() {
    if (this.previewing) this.engine.endMidiSection();
    this.previewing = false; this.paint(); this.persist();
  }
  private code() {
    const take = this.takes[this.selected]; if (!take) return '';
    const code = this.format === 'notes' ? transcribeNotes(take.notes, this.end - this.begin, this.grid) : transcribe(take.notes, this.end - this.begin, 0, this.end - this.begin);
    const rate = this.engine.patternRate(this.destination!.tabId);
    return rate === 1 ? code : `(${code}).slow(${rate})`;
  }
  private paint() {
    this.root.querySelector('[data-midi-before]')!.textContent = this.destination?.original ?? '';
    this.root.querySelector('[data-midi-after]')!.textContent = this.code() || 'Your playing will appear here as Strudel. Original code stays unchanged.';
    const select = this.root.querySelector<HTMLSelectElement>('[data-midi-takes]')!;
    if (select.options.length !== this.takes.length) { select.replaceChildren(); this.takes.forEach((take, i) => { const option = document.createElement('option'); option.value = String(i); option.textContent = `Take ${i + 1} · ${take.notes.length} notes`; select.append(option); }); }
    select.value = String(this.selected); select.disabled = this.running;
    this.root.querySelector<HTMLButtonElement>('[data-midi-finish]')!.hidden = !this.running;
    for (const name of ['transcribed', 'accept', 'discard']) this.root.querySelector<HTMLElement>(`[data-midi-${name}]`)!.hidden = !this.pending;
    this.root.querySelector<HTMLButtonElement>('[data-midi-accept]')!.disabled = !this.takes.length;
    for (const name of ['preview', 'original']) this.root.querySelector<HTMLButtonElement>(`[data-midi-${name}]`)!.disabled = this.running || !this.takes.length;
    this.root.querySelector('[data-midi-transcribed]')!.setAttribute('aria-pressed', String(this.mode === 'take'));
    this.root.querySelector<HTMLButtonElement>('[data-midi-transcribed]')!.disabled = !this.takes.length;
    this.root.querySelector('[data-midi-solo]')!.setAttribute('aria-pressed', String(this.solo));
    for (const input of this.range.querySelectorAll<HTMLInputElement | HTMLSelectElement>('input,select')) input.disabled = this.running || this.pending;
    const phase = 0;
    const view = this.root.querySelector('[data-midi-notes]')!; view.replaceChildren();
    const take = this.takes[this.selected];
    for (const note of take?.notes ?? []) { const mark = document.createElement('span'); mark.style.left = `${note.start / (this.end - this.begin) * 100}%`; mark.style.width = `${Math.max(.5, ((note.end ?? phase * (this.end - this.begin)) - note.start) / (this.end - this.begin) * 100)}%`; mark.style.bottom = `${(note.pitch % 36) / 36 * 85}%`; mark.title = `MIDI ${note.pitch}`; view.append(mark); }
  }
  private async preview(mode: 'original' | 'take') {
    if (this.running || !this.takes.length) return;
    if (!this.owner?.destination?.valid) throw new Error('Restore the original pattern and phrase before previewing this recovered take.');
    if (!this.engine.started) await this.engine.startMidiSection(this.owner!, this.destination!, this.clip!, this.begin, this.end, false);
    await this.engine.reviewMidi(mode, this.owner!, this.code()); this.mode = mode; this.previewing = true;
    this.engine.soloMidi(this.solo && mode === 'take');
    this.status(`Previewing ${mode === 'original' ? 'original' : `take ${this.selected + 1}`} · ${this.solo && mode === 'take' ? 'isolated' : 'with composition'} · changes heard after scheduled audio`); this.paint();
  }
  private async accept() {
    const proposal = this.code();
    if (!proposal) throw new Error('Play through one loop before accepting a transcription.');
    this.finish();
    if (!this.owner?.destination?.valid) throw new Error('The recovered destination changed. The take is retained; restore the original phrase before accepting.');
    const before = this.project();
    const after = sectionVariation(before, this.clip!, this.begin, this.end, this.destination!, this.source, proposal, () => crypto.randomUUID());
    this.engine.endMidiSection(); this.saving = true; this.status('Saving variation…');
    this.owner!.lockEditing(true);
    try { await this.commit(after); } finally { this.saving = false; this.owner!.lockEditing(false); }
    this.undo = { before, after: this.project() };
    this.takes = []; this.clearRecovery(); this.destination = undefined; this.owner?.disarm(); this.range.hidden = false;
    this.root.querySelector<HTMLButtonElement>('[data-midi-undo]')!.hidden = false; this.paint(); this.status('Accepted into the selected timeline section · other clips unchanged');
  }
  close() { this.finish(); this.engine.endMidiSection(); this.owner?.setPending(); this.owner?.disarm(); this.owner = undefined; this.destination = undefined; this.clip = undefined; this.root.hidden = true; this.range.hidden = false; this.renderRange(); }
  private clearRecovery() { try { localStorage.removeItem(this.recoveryKey || `studio.composition-midi:${this.session()}`); } catch { /* retained in memory */ } }
  private persist() {
    if (!this.pending || !this.destination) return;
    try { this.recoveryKey = `studio.composition-midi:${this.session()}`; localStorage.setItem(this.recoveryKey, JSON.stringify({ format: this.format, grid: this.grid, source: this.source, clip: this.clip, begin: this.begin, end: this.end, destination: this.destination, takes: this.takes.map(t => t.notes), current: undefined })); }
    catch { this.status('Takes retained in memory · browser recovery unavailable'); }
  }
  restore(editorFor: (id: string) => StudioEditor) {
    const key = `studio.composition-midi:${this.session()}`; const text = localStorage.getItem(key); if (!text) return;
    const data = JSON.parse(text); const clip = ClipSchema.parse(data.clip);
    const notes = [...data.takes, ...(data.current?.length ? [data.current] : [])];
    if (!notes.length || notes.length > 33) return;
    const saved = notes.map((n: unknown) => PendingMidiSchema.parse({ destination: data.destination, notes: n, length: data.end - data.begin, grid: 0, cps: this.project().bpm / 240 }));
    this.format = data.format === 'timeCat' ? 'timeCat' : 'notes'; this.grid = [1/4, 1/8, 1/16, 1/32].includes(data.grid) ? data.grid : 1/16;
    this.root.querySelector<HTMLSelectElement>('[data-midi-format]')!.value = this.format; this.root.querySelector<HTMLSelectElement>('[data-midi-grid]')!.value = String(this.grid);
    this.source = data.source; this.clip = clip; this.begin = data.begin; this.end = data.end; this.destination = saved[0].destination;
    try { this.owner = editorFor(clip.tabId); this.owner.restoreDestination(this.destination); } catch { this.owner = undefined; }
    this.takes = saved.map(s => { const take = new MidiTake(s.destination); take.notes = s.notes; take.stop(s.length); return take; });
    this.recoveryKey = key; this.root.hidden = this.range.hidden = false; this.renderRange(); this.paint(); this.status(this.owner ? 'Recovered MIDI takes · stopped for review' : 'Recovered clip take · original pattern missing. Restore the original pattern and clip before keeping this take.');
  }
}
