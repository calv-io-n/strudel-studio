import type { RecordingTarget } from '../shared/recording-target';
import type { CaptureView } from '../shared/capture-state';
import { MidiTake, transcribe, phraseNotes, PendingMidiSchema } from '../shared/performance';
import type { Engine } from './engine';
import type { StudioEditor } from './editor';

export class PerformancePanel {
  take?: MidiTake;
  accompaniment: 'pattern' | 'solo' = 'solo';
  get auditioning() { return this.audition; }
  get running() { return this.preparing || this.take?.state === 'capturing'; }
  sharedTarget?: RecordingTarget;
  sharedOffset = 0;
  sharedKeep?: () => Promise<void>;
  sharedDiscard?: () => Promise<void>;
  alignSharedDuration(seconds: number) { this.length = Math.max(.25, Math.ceil((this.sharedOffset + seconds * this.cps) * 4) / 4 - this.sharedOffset); this.persist(); }
  get proposal() {
    let code = this.code();
    return code && this.take?.destination.append ? `\n// Recorded MIDI\n$: (${code})${this.take.destination.soundCode}\n` : code;
  }
  completeShared() { this.clearRecovery(); this.take = undefined; this.owner?.disarm(); this.owner?.setPending(); this.sharedOffset = 0; this.sharedTarget = undefined; this.paint(); }
  armShared(owner: StudioEditor, tabId: string, soundCode: string) {
    if (this.take?.notes.length) throw new Error('Keep or discard the pending MIDI take first.');
    if (this.owner !== owner || !owner.destination?.valid) {
      this.owner?.disarm(); this.owner = owner; owner.armAppend(tabId, soundCode);
    }
    this.take = new MidiTake(owner.destination!); this.values = undefined;
  }
  async prepareShared() { this.preparing = true; this.length = 4096; this.grid = .0625; await this.prepare(); this.audition = false; }
  startShared(at: number) {
    this.preparing = false; this.waiting = false; this.cps = this.engine.tempo / 240;
    this.startedAt = at; this.take!.start(); this.audition = true;
    clearInterval(this.timer); this.timer = setInterval(() => { this.paint(); this.status(`Recording · ${this.take?.notes.length ?? 0} notes`); }, 50);
  }
  private ownsPlayback = false;
  owner?: StudioEditor;
  pendingAudio: () => boolean = () => false;
  private saving = false;
  private preparing = false;
  private captureEpoch = 0;
  private fallback = false;
  get captureView(): CaptureView | undefined {
    if (!this.take || !this.owner?.destination || !this.preparing && (this.take.state === 'armed' || this.take.state === 'review' && !this.take.notes.length)) return;
    return { code: this.take.notes.length ? this.proposal : undefined, state: this.preparing ? 'preparing' : this.saving ? 'saving' : this.take?.state === 'capturing' ? 'recording' : 'review', tabId: this.take.destination.tabId, trackId: this.sharedTarget?.trackId, clipId: this.sharedTarget?.clipId, start: this.sharedTarget?.position, end: this.sharedTarget ? this.sharedTarget.position + (this.take.state === 'capturing' ? Math.max(0, this.elapsed) : this.length) : undefined, kind: this.take.destination.append ? 'append' : 'phrase', label: this.preparing ? 'Preparing recording' : this.saving ? 'Saving' : this.take?.state === 'capturing' ? `Recording · ${this.take.notes.length} notes${this.take.notes.length ? ' · ' + this.take.notes.slice(-8).map(n => n.pitch).join(' ') : ''}` : 'Ready to review' };
  }
  private recoveryKey = '';
  private values?: Record<string, any>;
  private audition = false;
  private held = new Set<string>();
  private startedAt = 0;
  private cps = .5;
  private length = 4;
  private grid = .0625;
  private timer?: ReturnType<typeof setInterval>;
  private previewTimers: ReturnType<typeof setTimeout>[] = [];
  private previewEpoch = 0;
  /** Capture is armed but its clock starts on the first note, so reaching the keys never eats into the phrase. */
  private waiting = false;
  readonly root = document.createElement('section');
  constructor(private editor: () => StudioEditor, private tab: () => { id: string; name: string }, private report: (message: string) => void, private engine: Engine, private session: () => string, private saveSession: () => Promise<void>, private commitTake: (owner: StudioEditor, code: string) => Promise<void>) {
    this.root.className = 'performance-panel'; this.root.hidden = true;
    this.root.setAttribute('aria-label', 'MIDI recording');
    this.root.innerHTML = `<span data-destination hidden></span><div class="performance-feedback"><p data-state role="status"></p></div><div class="form-row performance-review" hidden><button data-preview>Preview</button><button data-accept>Keep take</button><button data-discard>Discard</button></div><button data-retarget hidden>Use selected phrase</button><button data-fallback hidden>Use fallback synth</button>`;
    const input = document.createElement('p'); input.dataset.input = ''; input.setAttribute('role', 'status');
    input.textContent = '';
    this.root.querySelector('[data-state]')!.after(input);
    this.root.querySelector('[data-accept]')!.classList.add('primary');
    this.button('fallback', () => { this.fallback = true; this.values = { s: 'triangle', gain: .2 }; this.audition = true; this.status('Audition · fallback triangle synth'); });
    this.button('preview', () => this.preview(true));
    this.button('accept', () => this.accept());
    this.button('discard', () => this.discard());
    this.button('retarget', () => { this.stop(); if (!this.take) throw new Error('No pending take.'); const owner = this.editor(); const destination = owner.arm(this.tab().id); if (owner !== this.owner) this.owner?.disarm(); this.owner = owner; this.take.destination = destination; this.values = undefined; this.root.querySelector('[data-destination]')!.textContent = `Recording into: ${this.tab().name} → ${destination.append ? 'new notes at end' : 'selected phrase'} · keeping a take updates every placement of this pattern.`; this.paint(); });

  }
  protected button(name: string, action: () => unknown | Promise<unknown>) {
    this.root.querySelector<HTMLButtonElement>(`[data-${name}]`)!.onclick = async () => { try { if (this.saving) return; await action(); } catch (error) { this.report((error as Error).message); } };
  }
  protected status(text: string) { this.root.querySelector('[data-state]')!.textContent = text; }
  async prepare() {
    if (!this.owner?.destination?.valid) throw new Error('The destination changed. Select a supported note expression again.');
    try { this.values = this.fallback ? { s: 'triangle', gain: .2 } : await this.engine.performanceValues(this.owner, this.owner.destination.soundCode); this.root.querySelector<HTMLElement>('[data-fallback]')!.hidden = true; } catch (error) { this.root.querySelector<HTMLElement>('[data-fallback]')!.hidden = false; throw error; }
    this.audition = true; this.paint();
  }
  async note(key: string, pitch: number, velocity: number, on: boolean) {
    if (!this.owner?.destination || !this.take && !this.audition) return false;
    if (on) this.held.add(key); else this.held.delete(key);
    if (on && this.waiting && this.take?.state === 'capturing') { this.waiting = false; this.startedAt = this.engine.performanceAudio.time; }
    const label = `${['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'][pitch % 12]}${Math.floor(pitch / 12) - 1}`;
    const input = this.root.querySelector<HTMLElement>('[data-input]')!;
    input.classList.toggle('midi-active', this.held.size > 0);
    input.textContent = this.held.size ? `${label} · ${this.held.size} held` : '';
    if (this.take?.state === 'capturing') {
      // Count-in is already complete. Retain keys pressed in the scheduled
      // audio-start lookahead, aligned to the first captured frame.
      this.take!.note(key, pitch, velocity, Math.max(0, this.elapsed), on); this.paint();
    }
    if (!on) this.engine.performanceAudio.release(key);
    else if (this.audition && this.values) await this.engine.performanceAudio.play(key, this.engine.refreshPerformanceValues(this.values, this.owner!), pitch, velocity);
    return true;
  }
  private get elapsed() { return (this.engine.performanceAudio.time - this.startedAt) * this.cps; }
  private code() { if (!this.take) return ''; const code = transcribe(this.take.notes.map(n => ({ ...n, start: n.start + this.sharedOffset, end: n.end === undefined ? undefined : n.end + this.sharedOffset })), Math.min(4096, (this.take.state === 'capturing' ? Math.max(.25, Math.ceil(Math.max(0, this.elapsed) * 4) / 4) : this.length) + this.sharedOffset), this.grid, Math.max(0, this.elapsed) + this.sharedOffset); const rate = this.engine.patternRate(this.take.destination.tabId); return !code || rate === 1 ? code : `(${code}).slow(${rate})`; }
  private paint() {
    this.persist();
    const capturing = this.take?.state === 'capturing', pending = !!this.take?.notes.length;
    this.root.querySelector<HTMLElement>('.performance-review')!.hidden = !pending || !!capturing;
    this.root.querySelector<HTMLElement>('[data-retarget]')!.hidden = !pending || !!this.owner?.destination?.valid;
    this.root.querySelector<HTMLElement>('.performance-feedback')!.hidden = !pending && !capturing && !this.preparing;
    this.root.querySelector<HTMLButtonElement>('[data-accept]')!.disabled = this.saving || !this.take?.notes.length || !this.owner?.destination?.valid || this.take?.state === 'capturing';
  }
  private persist() {
    if (!this.take?.notes.length) return;
    try {
      const key = `studio.midi-take:${this.session()}`;
      if (this.recoveryKey && this.recoveryKey !== key) localStorage.removeItem(this.recoveryKey);
      this.recoveryKey = key;
      localStorage.setItem(key, JSON.stringify({ sharedTarget: this.sharedTarget, sharedOffset: this.sharedOffset, destination: this.owner?.destination ?? this.take.destination, accompaniment: this.accompaniment, notes: this.take.notes, length: this.take.state === 'capturing' ? Math.min(this.length, Math.max(.25, Math.ceil(Math.max(0, this.elapsed) * 4) / 4)) : this.length, grid: this.grid, cps: this.cps, fallback: this.fallback }));
    } catch { this.status('Take is retained in memory; browser recovery storage is unavailable.'); }
  }
  restore(editorFor: (id: string) => StudioEditor) {
    const key = `studio.midi-take:${this.session()}`;
    const text = localStorage.getItem(key); if (!text) return;
    const raw = JSON.parse(text); const saved = PendingMidiSchema.parse(raw); this.sharedOffset = saved.sharedOffset; this.sharedTarget = saved.sharedTarget;
    this.accompaniment = raw.accompaniment === 'pattern' ? 'pattern' : 'solo';
    if (!saved.destination || !Array.isArray(saved.notes) || !saved.notes.length || saved.notes.length > 10000) return;
    try { this.owner = editorFor(saved.destination.tabId); this.owner.restoreDestination(saved.destination); } catch { this.owner = undefined; }
    this.take = new MidiTake(this.owner?.destination ?? { ...saved.destination, valid: false }); this.take.notes = saved.notes; this.length = saved.length; this.grid = saved.grid; this.cps = saved.cps; this.fallback = saved.fallback;
    this.take.stop(this.length); this.recoveryKey = key; this.root.hidden = false;
    this.root.querySelector('[data-destination]')!.textContent = `Recovered take · ${this.take.destination.tabId}`;
    this.paint(); this.status(this.owner ? 'Recovered MIDI take · review before accepting' : 'Recovered MIDI take · original pattern missing. Select a phrase, then choose Use selected phrase.');
  }
  private clearRecovery() { try { localStorage.removeItem(this.recoveryKey || `studio.midi-take:${this.session()}`); } catch { /* memory remains authoritative */ } }
  async start() {
    if (this.preparing) return;
    if (!this.take && this.owner?.destination?.valid) this.take = new MidiTake(this.owner.destination);
    if (!this.take || this.take.notes.length) throw new Error('Accept, Discard, or Retry the pending take first.');
    const epoch = ++this.captureEpoch;
    this.preparing = true;
    this.engine.stop(); this.ownsPlayback = false; this.audition = false;
    try {
    await this.saveSession();
    this.length = 4096; this.grid = .0625;
    phraseNotes([], this.length, this.grid, 0);
    await this.prepare();
    this.audition = false;
    if (epoch !== this.captureEpoch) return;
    if (this.accompaniment === 'pattern') {
      await this.engine.evaluate(true, this.take.destination.tabId, true);
      if (epoch !== this.captureEpoch) return;
      this.ownsPlayback = this.engine.started;
      if (!this.ownsPlayback) return;
    } else if (!await this.engine.countIn.wait(this.engine.tempo)) return;
    } finally { this.preparing = false; }
    if (epoch !== this.captureEpoch) return;
    this.cps = this.engine.tempo / 240;
    const countIn = this.engine.countIn.enabled;
    this.waiting = !this.engine.started && !countIn;
    this.startedAt = this.waiting ? Infinity : this.engine.performanceAudio.time;
    this.take.start(); this.audition = true;
    clearInterval(this.timer);
    const update = () => {
      if (!this.owner?.destination?.valid) { this.stop(); this.status('Destination changed · take retained. Choose a valid destination before accepting.'); return; }
      this.paint();
      const count = this.take?.notes.length ?? 0;
      this.status(this.waiting ? 'Ready · play a note to begin' : `Recording · ${count} ${count === 1 ? 'note' : 'notes'} · ${Math.max(0, this.elapsed / this.cps).toFixed(1)}s`);
      if (this.elapsed >= this.length) {
        this.stop();
        if (!this.take?.notes.length && this.values) { this.audition = true; this.status('No notes captured · try again'); this.root.querySelector('[data-input]')!.textContent = ''; this.paint(); }
      }
    };
    update();
    this.timer = setInterval(update, 50);
  }
  stop() {
    this.engine.countIn.cancel();
    this.captureEpoch++; this.preparing = false;
    if (this.ownsPlayback) { this.engine.stop(); this.ownsPlayback = false; }
    clearInterval(this.timer); this.timer = undefined; this.waiting = false;
    this.previewEpoch++; this.previewTimers.forEach(clearTimeout); this.previewTimers = [];
    if (this.take?.state === 'capturing') { const elapsed = Math.min(this.length, Math.max(0, this.elapsed)); this.length = Math.max(.25, Math.ceil(elapsed * 4) / 4); this.take.stop(elapsed); }
    this.audition = false; this.engine.performanceAudio.stop(); this.engine.isolatePerformance(false);
    this.held.clear(); this.root.querySelector('[data-input]')!.classList.remove('midi-active');
    this.root.querySelector('[data-input]')!.textContent = '';
    const count = this.take?.notes.length ?? 0;
    this.status(count ? `Take ready · ${count} ${count === 1 ? 'note' : 'notes'} · not saved yet` : 'Ready · no notes captured'); this.paint();
  }
  private async discard() {
    if (this.sharedDiscard) { await this.sharedDiscard(); return; }
    this.stop(); this.clearRecovery(); if (this.take && this.owner) void this.engine.suppressPhrase(this.owner, this.take.destination.tabId, this.take.destination.original, false);
    if (this.take) this.take = new MidiTake(this.take.destination); this.paint(); this.status('Discarded · original code unchanged');
  }
  private async accept() {
    if (this.take?.state === 'capturing') throw new Error('Stop the take before accepting.');
    if (this.sharedKeep) { this.saving = true; this.paint(); try { await this.sharedKeep(); } finally { this.saving = false; this.paint(); } return; }
    let code = this.proposal; if (!code) throw new Error('An empty take cannot replace code.');

    this.saving = true; this.status('Saving take…');
    try { await this.commitTake(this.owner!, code); } finally { this.saving = false; }
    this.clearRecovery(); void this.engine.suppressPhrase(this.owner!, this.take!.destination.tabId, this.take!.destination.original, false); this.take = undefined; this.stop(); if (!this.pendingAudio()) this.close();
  }
  async preview(isolated: boolean) {
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
  globalStop() { this.stop(); this.engine.endJam(); }
  arm(createTake = true, appendSound?: string) {
    if (this.pendingAudio()) throw new Error('Save or discard the pending audio take before changing destinations.');
    if (this.take?.notes.length) throw new Error('Accept or discard the pending take before changing destinations.');
    this.globalStop(); this.values = undefined; this.fallback = false;
    const next = this.editor();
    const destination = appendSound ? next.armAppend(this.tab().id, appendSound) : next.arm(this.tab().id);
    if (this.owner !== next) this.owner?.disarm();
    this.owner = next; this.take = createTake ? new MidiTake(destination) : undefined;
    this.root.hidden = false;
    this.root.querySelector('[data-destination]')!.textContent = `Recording into: ${this.tab().name} → ${destination.append ? 'new notes at end' : 'selected phrase'} · keeping a take updates every placement of this pattern.`;
    this.paint();
    this.status('Ready');
  }
  close() {
    if (this.pendingAudio()) throw new Error('Save or discard the pending audio take before leaving performance.');
    if (this.take?.notes.length) throw new Error('Accept or discard the pending take before leaving.');
    this.stop(); this.engine.endJam();
    if (this.take && this.owner) void this.engine.suppressPhrase(this.owner, this.take.destination.tabId, this.take.destination.original, false);
    this.engine.performanceAudio.silence();
    this.owner?.setPending(); this.owner?.disarm(); this.owner = undefined; this.take = undefined; this.root.hidden = true;
  }
}
