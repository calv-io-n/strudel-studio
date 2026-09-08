import { CycleTakes, compositionVariation } from '../shared/midi-session';
import { destinationFor, MidiTake, transcribe, transcribeNotes, PendingMidiSchema, type Destination } from '../shared/performance';
import { ClipSchema, type Clip, type Project } from '../shared/model';
import type { StudioEditor } from './editor';
import type { Engine } from './engine';

export class MidiComposition {
  readonly root = document.createElement('section');
  readonly range = document.createElement('section');
  owner?: StudioEditor;
  destination?: Destination;
  clip?: Clip;
  private source = '';
  private failure = '';
  private sourceRevision = 0;
  private begin = 0;
  private end = 4;
  private capture?: CycleTakes;
  private takes: MidiTake[] = [];
  private selected = 0;
  private timer?: ReturnType<typeof setInterval>;
  private voices = new Map<string, string[]>();
  private undo?: { before: Project; after: Project };
  private solo = false;
  private mode: 'live' | 'original' | 'take' = 'live';
  private epoch = 0;
  private starting = false;
  private recoveryKey = '';
  private customRange = false;
  private auditioning = false;
  private format: 'notes' | 'timeCat' = 'notes';
  private grid = 1 / 16;
  private published?: MidiTake;
  constructor(private engine: Engine, private project: () => Project, private commit: (p: Project) => Promise<void>, private session: () => string, private report: (text: string) => void) {
    this.root.className = 'midi-composition'; this.root.hidden = true; this.root.setAttribute('aria-label', 'MIDI transcription');
    this.root.innerHTML = `<header><strong>Play MIDI</strong><button data-midi-exit>Leave MIDI</button></header><p data-midi-target></p><p data-midi-sound></p><p data-midi-status role="status"></p><p data-midi-input role="status">Waiting for MIDI</p><progress data-midi-progress value="0" max="1" aria-label="Take cycle progress"></progress><div data-midi-notes class="midi-note-view" aria-label="Played notes"></div><div class="form-row"><button data-midi-live aria-pressed="false">Capture notes</button><button data-midi-transcribed aria-pressed="false">Preview</button><button data-midi-finish>Finish</button><label>Take <select data-midi-takes aria-label="MIDI take"></select></label><button data-midi-original>Original</button><button data-midi-preview>Preview take</button><button data-midi-solo aria-pressed="false">Solo take</button><button data-midi-again>Play again</button><button data-midi-accept class="primary">Keep take</button><button data-midi-discard>Discard</button><button data-midi-undo hidden>Undo acceptance</button></div><div class="form-row"><label>Strudel format <select data-midi-format><option value="notes">Notes · snap to beat</option><option value="timeCat">timeCat · played timing</option></select></label><label data-midi-grid-label>Snap <select data-midi-grid><option value="0.25">1 beat</option><option value="0.125">½ beat</option><option value="0.0625" selected>¼ beat</option><option value="0.03125">⅛ beat</option></select></label></div><div class="performance-diff"><div><h3>Original</h3><pre data-midi-before></pre></div><div><h3>Proposed Strudel · not accepted</h3><pre data-midi-after></pre></div></div>`;
    const more = document.createElement('details'); more.className = 'midi-more';
    const summary = document.createElement('summary'); summary.textContent = 'More take controls'; more.append(summary);
    for (const name of ['original', 'preview', 'again']) more.append(this.root.querySelector(`[data-midi-${name}]`)!);
    more.append(this.root.querySelector('[data-midi-takes]')!.parentElement!, this.root.querySelector('[data-midi-solo]')!, this.root.querySelector('[data-midi-format]')!.closest('.form-row')!, this.root.querySelector('.performance-diff')!); this.root.append(more);
    this.range.className = 'midi-loop-range'; this.range.hidden = false;
    this.range.innerHTML = `<button data-midi-full>Use full composition</button><label>Destination clip <select data-midi-clip aria-label="MIDI destination clip"></select></label><label>Loop start <input data-midi-start type="number" min="0" step="0.25"></label><label>Loop end <input data-midi-end type="number" min="0.25" step="0.25"></label><span data-midi-length></span>`;
    for (const name of ['format', 'grid']) this.root.querySelector<HTMLSelectElement>(`[data-midi-${name}]`)!.onchange = () => {
      this.format = this.root.querySelector<HTMLSelectElement>('[data-midi-format]')!.value as 'notes' | 'timeCat';
      this.grid = Number(this.root.querySelector<HTMLSelectElement>('[data-midi-grid]')!.value);
      this.root.querySelector<HTMLElement>('[data-midi-grid-label]')!.hidden = this.format !== 'notes';
      this.paint(); this.persist();
      if (this.mode === 'take' && this.takes.length) void this.engine.reviewMidi('take', this.owner!, this.code()).catch(e => this.status(e.message));
    };
    this.action('finish', () => this.finish());
    this.action('live', () => this.listen('live'));
    this.action('transcribed', () => this.listen('take'));
    this.action('again', () => this.listen('live'));
    this.action('preview', () => this.preview('take'));
    this.action('original', () => this.preview('original'));
    this.action('solo', async () => { this.solo = !this.solo; if (this.running) await this.listen('take'); else await this.preview('take'); this.engine.soloMidi(this.solo); this.paint(); });
    this.action('accept', () => this.accept());
    this.action('discard', () => { this.finish(); this.takes = []; this.published = undefined; void this.engine.reviewMidi('original', this.owner!).catch(() => {}); this.clearRecovery(); this.paint(); this.status('Takes discarded · original section unchanged'); });
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
      if (clip) { this.clip = { ...clip }; this.renderRange(); }
    };
    for (const edge of ['start', 'end']) for (const suffix of ['']) {
      this.range.querySelector<HTMLInputElement>(`[data-midi-${edge}${suffix}]`)!.oninput = event => {
        if (this.running || this.pending) { this.renderRange(); return; }
        const value = Number((event.target as HTMLInputElement).value);
        try { this.setRange(edge === 'start' ? value : this.begin, edge === 'end' ? value : this.end); } catch (error) { this.renderRange(); this.report((error as Error).message); }
      };
    }
  }
  private action(name: string, run: () => unknown) { this.root.querySelector<HTMLButtonElement>(`[data-midi-${name}]`)!.onclick = async () => { try { await run(); } catch (e) { this.status((e as Error).message); this.report((e as Error).message); } }; }
  private status(text: string) { this.root.querySelector('[data-midi-status]')!.textContent = text; }
  get armed() { return !!this.destination; }
  get running() { return this.starting || !!this.capture?.running; }
  get pending() { return !!this.takes.length || !!this.capture?.current.notes.length; }
  arm(owner: StudioEditor, tabId: string, clipId?: string) {
    if (this.pending || this.running) throw new Error('Finish and resolve the current MIDI takes before choosing another note.');
    const selection = owner.view.state.selection.main;
    const destination = destinationFor(owner.code, tabId, selection.from, selection.to);
    const clips = this.project().clips.filter(c => c.tabId === tabId);
    if (!clips.length) throw new Error('Add this tab to the composition, then choose Transcribe on composition on its note.');
    this.close(); this.owner = owner; this.destination = owner.arm(tabId); this.source = owner.code; this.sourceRevision = owner.revision; this.failure = '';
    this.clip = { ...(clips.find(c => c.id === clipId) ?? clips[0]) };
    if (!this.customRange) { this.begin = 0; this.end = this.engine.arrangementLength; }
    this.root.hidden = false; this.range.hidden = false; this.renderRange(); this.paint();
    this.status('Ready · audition your keyboard, then Capture notes');
  }
  resetRange() { this.customRange = false; this.begin = 0; this.end = this.engine.arrangementLength || 4; this.renderRange(); }
  get loopRange() { return { begin: this.begin, end: this.end }; }
  setRange(begin: number, end: number) {
    if (this.running || this.pending) throw new Error('Keep or discard the current take before changing its range.');
    if (![begin, end].every(Number.isFinite) || begin % .25 || end % .25 || begin < 0 || end <= begin || end > (this.engine.arrangementLength || 4)) throw new Error('Choose a nonempty range inside the composition.');
    this.begin = begin; this.end = end; this.customRange = true; this.renderRange();
  }
  async audition() {
    if (!this.owner || !this.destination) return;
    try { await this.engine.prepareMidi(this.owner, this.destination); } catch (error) { this.failure = `Cannot play the selected IDE instrument: ${(error as Error).message}`; this.status(this.failure); throw new Error(this.failure); }
    this.auditioning = true; this.status('Play your keyboard · Capture notes when ready');
  }
  refreshRange() { if (!this.customRange && !this.running && !this.pending) { this.begin = 0; this.end = this.engine.arrangementLength || 4; } this.renderRange(); }
  private renderRange() {
    const select = this.range.querySelector<HTMLSelectElement>('[data-midi-clip]')!; select.replaceChildren();
    for (const clip of this.project().clips.filter(c => c.tabId === this.clip?.tabId)) {
      const option = document.createElement('option'); option.value = clip.id; option.textContent = `${this.project().tracks.find(t => t.id === clip.trackId)?.name} · ${clip.start}–${clip.start + clip.length}`; select.append(option);
    }
    select.value = this.clip?.id ?? '';
    select.parentElement!.hidden = !this.armed;
    for (const edge of ['start', 'end']) for (const suffix of ['']) {
      const input = this.range.querySelector<HTMLInputElement>(`[data-midi-${edge}${suffix}]`)!;
      input.min = '0'; input.max = String(this.engine.arrangementLength || 4); input.value = String(edge === 'start' ? this.begin : this.end);
    }
    this.range.querySelector('[data-midi-length]')!.textContent = `${this.end - this.begin} cycles selected`;
    this.root.querySelector('[data-midi-target]')!.textContent = `${this.project().tabs.find(t => t.id === this.clip?.tabId)?.name} · cycles ${this.begin}–${this.end} · IDE sound and modifiers`;
  }
  async start() {
    if (!this.destination || !this.owner || !this.clip) return;
    if (this.running) return;
    if (!this.project().clips.some(c => c.id === this.clip!.id && JSON.stringify(c) === JSON.stringify(this.clip))) throw new Error('The destination clip changed. Select the note and timeline destination again.');
    if (!this.owner.destination?.valid || this.owner.revision !== this.sourceRevision && this.pending) throw new Error('The IDE expression changed. Resolve any takes and select the note again.');
    if (this.end <= this.begin || this.end - this.begin > 4096 || this.begin % .25 || this.end % .25) throw new Error('Choose a loop of ¼ to 4096 cycles on quarter-cycle boundaries.');

    this.source = this.owner.code; this.sourceRevision = this.owner.revision; this.destination = this.owner.destination; this.failure = '';
    this.auditioning = false; this.starting = true; const epoch = ++this.epoch;
    this.status('Preparing the selected IDE instrument…');
    try {
      await this.engine.startMidiSection(this.owner, this.destination, this.clip, this.begin, this.end);
      if (epoch !== this.epoch) { this.engine.endMidiSection(); return; }
      this.mode = 'live'; this.solo = false;
      const sound = this.engine.midiValues(60, 100, (this.clip.sourceOffset ?? 0) + this.begin - this.clip.start)[0];
      const name = sound?.studioOriginalSound ?? sound?.s;
      this.root.querySelector('[data-midi-sound]')!.textContent = name ? `Instrument: ${this.engine.soundEntries.find(s => s.name === name)?.label ?? name} · from the selected IDE expression` : 'Instrument follows the selected IDE expression';
      this.capture = new CycleTakes(this.destination, this.end - this.begin);
      this.capture.completed = this.takes;
      this.timer = setInterval(() => this.tick(), 40);
      this.status('Playing · each loop becomes a take');
    } catch (error) { this.failure = `Cannot play the selected IDE instrument: ${(error as Error).message}`; this.status(this.failure); throw new Error(this.failure); } finally { this.starting = false; this.paint(); }
  }
  private tick() {
    if (!this.capture?.running) return;
    if (!this.engine.started || !this.owner?.destination?.valid || this.owner.revision !== this.sourceRevision) { this.finish(); this.status('Capture interrupted · takes retained'); return; }
    if (this.owner && this.owner.code !== this.source) { this.source = this.owner.code; this.destination = this.owner.destination!; this.engine.updateMidiDestination(this.destination); }
    this.capture.advance(this.engine.cycle);
    this.takes = this.capture.completed;
    const latest = this.takes.at(-1);
    if (latest && latest !== this.published) { this.published = latest; this.selected = this.takes.length - 1; if (this.mode === 'take') void this.engine.reviewMidi('take', this.owner!, this.code()).catch(e => this.status(e.message)); }
    this.status(`${this.mode === 'live' ? 'Live MIDI · capturing' : 'Transcribed · looping the saved phrase'} · pass ${this.capture.pass + 1} · ${this.takes.length} takes retained · ${this.capture.current.notes.length} notes this pass${!this.capture.pressed ? ' · previous transcription kept' : ''}`);
    this.paint(); this.persist();
  }
  async note(key: string, pitch: number, velocity: number, on: boolean) {
    if (!this.armed) return false;
    if (!on) { for (const voice of this.voices.get(key) ?? []) this.engine.performanceAudio.release(voice); this.voices.delete(key); }
    if (!this.capture?.running && this.auditioning) { if (on) { const values = this.engine.midiValues(pitch, velocity, 0); this.voices.set(key, values.map((_: unknown, i: number) => `${key}:${i}`)); await Promise.all(values.map((v: any, i: number) => this.engine.performanceAudio.play(`${key}:${i}`, v, v.note ?? pitch, (v.velocity ?? velocity / 127) * 127))); } this.root.querySelector('[data-midi-input]')!.textContent = `MIDI ${pitch} · ${on ? 'playing' : 'released'} · audition only`; return true; }
    if (!this.capture?.running) { this.root.querySelector('[data-midi-input]')!.textContent = this.failure || `MIDI ${pitch} received · choose Capture notes to record`; return true; }
    if (this.mode !== 'live' || this.engine.midiMode !== 'live') { this.root.querySelector('[data-midi-input]')!.textContent = `MIDI ${pitch} received · Transcribed is playing; switch to Live MIDI to capture`; return true; }
    this.capture.note(key, pitch, velocity, this.engine.cycle, on);
    this.root.querySelector('[data-midi-input]')!.textContent = `${on ? '●' : '○'} MIDI ${pitch} · ${on ? 'playing and transcribing' : 'released'}`;
    this.root.classList.toggle('midi-active', on || this.voices.size > 0);
    this.paint();
    if (on) {
      const phase = (this.clip!.sourceOffset ?? 0) + this.begin - this.clip!.start + this.engine.cycle % (this.end - this.begin);
      const values = this.engine.midiValues(pitch, velocity, phase);
      const keys = values.map((_: unknown, i: number) => `${key}:${i}`); this.voices.set(key, keys);
      await Promise.all(values.map((value: any, i: number) => this.engine.performanceAudio.play(keys[i], value, value.note ?? pitch, (value.velocity ?? velocity / 127) * 127)));
      if (!values.length) this.root.querySelector('[data-midi-input]')!.textContent = `MIDI ${pitch} captured · the IDE modifiers silence this position`;
    }
    return true;
  }
  finish() {
    this.epoch++; this.starting = false; this.auditioning = false;
    clearInterval(this.timer); this.timer = undefined;
    if (this.capture) { this.capture.finish(this.engine.cycle); this.takes = this.capture.completed; this.capture = undefined; this.selected = Math.max(0, this.takes.length - 1); }
    this.engine.performanceAudio.stop(); this.voices.clear(); this.root.classList.remove('midi-active');
    this.status(this.takes.length ? `${this.takes.length} takes retained · choose one to preview or accept` : 'No notes captured · choose Capture notes to try again');
    this.paint(); this.persist();
  }
  private code() {
    const take = this.takes[this.selected]; if (!take) return '';
    return this.format === 'notes' ? transcribeNotes(take.notes, this.end - this.begin, this.grid) : transcribe(take.notes, this.end - this.begin, 0, this.end - this.begin);
  }
  private paint() {
    this.root.querySelector('[data-midi-before]')!.textContent = this.destination?.original ?? '';
    this.root.querySelector('[data-midi-after]')!.textContent = this.code() || 'Your playing will appear here as Strudel. Original code stays unchanged.';
    const select = this.root.querySelector<HTMLSelectElement>('[data-midi-takes]')!;
    if (select.options.length !== this.takes.length) { select.replaceChildren(); this.takes.forEach((take, i) => { const option = document.createElement('option'); option.value = String(i); option.textContent = `Take ${i + 1} · ${take.notes.length} notes`; select.append(option); }); }
    select.value = String(this.selected); select.disabled = this.running && this.mode === 'live';
    this.root.querySelector<HTMLButtonElement>('[data-midi-finish]')!.hidden = !this.running;
    this.root.querySelector<HTMLButtonElement>('[data-midi-live]')!.hidden = this.running && this.mode === 'live';
    for (const name of ['transcribed', 'accept', 'discard']) this.root.querySelector<HTMLElement>(`[data-midi-${name}]`)!.hidden = !this.pending;
    this.root.querySelector<HTMLButtonElement>('[data-midi-accept]')!.disabled = !this.takes.length;
    for (const name of ['preview', 'original']) this.root.querySelector<HTMLButtonElement>(`[data-midi-${name}]`)!.disabled = this.running || !this.takes.length;
    this.root.querySelector<HTMLButtonElement>('[data-midi-again]')!.disabled = this.running || !this.armed;
    this.root.querySelector('[data-midi-live]')!.setAttribute('aria-pressed', String(this.running && this.mode === 'live'));
    this.root.querySelector('[data-midi-transcribed]')!.setAttribute('aria-pressed', String(this.mode === 'take'));
    this.root.querySelector<HTMLButtonElement>('[data-midi-transcribed]')!.disabled = !this.takes.length;
    this.root.querySelector('[data-midi-solo]')!.setAttribute('aria-pressed', String(this.solo));
    for (const input of this.range.querySelectorAll<HTMLInputElement | HTMLSelectElement>('input,select')) input.disabled = this.running || this.pending;
    const phase = this.capture ? this.engine.cycle % this.capture.length / this.capture.length : 0;
    this.root.querySelector<HTMLProgressElement>('[data-midi-progress]')!.value = phase;
    const view = this.root.querySelector('[data-midi-notes]')!; view.replaceChildren();
    const take = this.capture?.running && this.mode === 'live' ? this.capture.current : this.takes[this.selected];
    for (const note of take?.notes ?? []) { const mark = document.createElement('span'); mark.style.left = `${note.start / (this.end - this.begin) * 100}%`; mark.style.width = `${Math.max(.5, ((note.end ?? phase * (this.end - this.begin)) - note.start) / (this.end - this.begin) * 100)}%`; mark.style.bottom = `${(note.pitch % 36) / 36 * 85}%`; mark.title = `MIDI ${note.pitch}`; view.append(mark); }
  }
  private async listen(mode: 'live' | 'take') {
    if (!this.engine.started || !this.capture?.running) { if (mode === 'live') return this.start(); return this.preview('take'); }
    if (mode === 'take' && !this.takes.length) throw new Error('Play through one loop first. The transcription updates at the next loop.');
    if (mode === 'take') { for (const key of this.voices.keys()) this.capture.note(key, 0, 0, this.engine.cycle, false); this.engine.performanceAudio.stop(); this.voices.clear(); }
    await this.engine.reviewMidi(mode, this.owner!, this.code()); this.mode = mode; this.paint();
    this.status(`${mode === 'take' ? 'Transcribed' : 'Live MIDI'} selected · playback changes on the next loop`);
  }
  private async preview(mode: 'original' | 'take') {
    if (this.running || !this.takes.length) return;
    if (!this.engine.started) await this.engine.startMidiSection(this.owner!, this.destination!, this.clip!, this.begin, this.end);
    await this.engine.reviewMidi(mode, this.owner!, this.code()); this.mode = mode;
    this.engine.soloMidi(this.solo && mode === 'take');
    this.status(`Previewing ${mode === 'original' ? 'original' : `take ${this.selected + 1}`} · ${this.solo && mode === 'take' ? 'isolated' : 'with composition'} · changes heard after scheduled audio`); this.paint();
  }
  private async accept() {
    const proposal = this.code();
    if (!proposal) throw new Error('Play through one loop before accepting a transcription.');
    this.finish();
    const before = this.project();
    const after = compositionVariation(before, this.clip!, this.begin, this.end, this.destination!, this.source, proposal, () => crypto.randomUUID());
    this.engine.endMidiSection(); await this.commit(after); this.undo = { before, after: this.project() };
    this.takes = []; this.clearRecovery(); this.destination = undefined; this.owner?.disarm(); this.range.hidden = false;
    this.root.querySelector<HTMLButtonElement>('[data-midi-undo]')!.hidden = false; this.paint(); this.status('Accepted into the selected timeline section · other clips unchanged');
  }
  close() { this.finish(); this.engine.endMidiSection(); this.owner?.disarm(); this.owner = undefined; this.destination = undefined; this.clip = undefined; this.root.hidden = true; this.range.hidden = false; this.renderRange(); }
  private clearRecovery() { try { localStorage.removeItem(this.recoveryKey || `studio.composition-midi:${this.session()}`); } catch { /* retained in memory */ } }
  private persist() {
    if (!this.pending || !this.destination) return;
    try { this.recoveryKey = `studio.composition-midi:${this.session()}`; localStorage.setItem(this.recoveryKey, JSON.stringify({ format: this.format, grid: this.grid, source: this.source, clip: this.clip, begin: this.begin, end: this.end, destination: this.destination, takes: this.takes.map(t => t.notes), current: this.capture?.pressed ? this.capture.current.notes : undefined })); }
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
    this.owner = editorFor(clip.tabId); this.sourceRevision = this.owner.revision; this.owner.restoreDestination(this.destination);
    this.takes = saved.map(s => { const take = new MidiTake(s.destination); take.notes = s.notes; take.stop(s.length); return take; });
    this.recoveryKey = key; this.root.hidden = this.range.hidden = false; this.renderRange(); this.paint(); this.status('Recovered MIDI takes · stopped for review');
  }
}
