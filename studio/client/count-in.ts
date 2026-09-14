export type MetronomeMode = 'off' | 'count-in' | 'continuous';
export function savedMetronomeMode(value: string | null): MetronomeMode {
  return value === 'continuous' ? value : value === 'true' || value === 'count-in' ? 'count-in' : 'off';
}
export function nextMetronomeMode(mode: MetronomeMode): MetronomeMode {
  return mode === 'off' ? 'count-in' : mode === 'count-in' ? 'continuous' : 'off';
}
/** A cancellable lead-in and optional clock. Clicks use the speaker output, not the recording bus. */
export class CountIn {
  mode: MetronomeMode = 'off';
  get enabled() { return this.mode !== 'off'; }
  remaining = 0;
  private finish?: (completed: boolean, error?: unknown) => void;
  private loop?: ReturnType<typeof setInterval>;
  private loopVoices = new Set<OscillatorNode>();
  private nextBeat = 0;
  private beat = 0;
  private loopBpm = 0;
  private leadEnd?: number;
  private clock?: () => { position: number; loop?: { begin: number; end: number } };
  scheduleLead(at: number, bpm: number) {
    if (this.mode !== 'count-in') return;
    const context = this.context(), step = 60 / bpm;
    for (let i = 0; i < 4; i++) { const t = at - (4 - i) * step; if (t >= context.currentTime) this.click(context, t, i === 0, this.loopVoices); }
  }
  constructor(private context: () => AudioContext, private changed: () => void) {}
  private click(context: AudioContext, at: number, accent: boolean, voices: Set<OscillatorNode>) {
    const voice = context.createOscillator(), gain = context.createGain();
    voice.frequency.value = accent ? 1200 : 850;
    gain.gain.setValueAtTime(.08, at); gain.gain.exponentialRampToValueAtTime(.001, at + .045);
    voice.connect(gain).connect(context.destination); voice.start(at); voice.stop(at + .05);
    voice.onended = () => { voice.disconnect(); gain.disconnect(); voices.delete(voice); }; voices.add(voice);
  }
  private stopLoop() {
    clearInterval(this.loop); this.loop = undefined;
    for (const voice of this.loopVoices) { try { voice.stop(); } catch { /* already ended */ } }
    this.loopVoices.clear();
  }
  /** Called from transport state updates, including solo MIDI and audio capture without playback. */
  sync(active: boolean, bpm: number, clock?: () => { position: number; loop?: { begin: number; end: number } }) {
    this.clock = clock;
    if (!active || this.remaining || this.mode === 'off') { this.stopLoop(); return; }
    if (this.mode !== 'continuous') { if (this.loop) this.stopLoop(); return; }
    if (this.loop && this.loopBpm === bpm) return;
    this.stopLoop(); const context = this.context(); this.loopBpm = bpm; this.beat = 0;
    this.nextBeat = this.leadEnd !== undefined && Math.abs(context.currentTime - this.leadEnd) < .2 ? Math.max(context.currentTime, this.leadEnd) : context.currentTime + .02;
    if (clock) { const phase = clock().position * 4; const edge = Math.ceil(phase - .03); this.nextBeat = Math.max(context.currentTime, context.currentTime + (edge - phase) * 60 / bpm); }
    this.leadEnd = undefined;
    const schedule = () => {
      // Background tabs may suspend the scheduler: resume at the current beat, never emit a burst.
      if (this.nextBeat < context.currentTime - .1) { const missed = Math.ceil((context.currentTime - this.nextBeat) * bpm / 60); this.nextBeat += missed * 60 / bpm; this.beat += missed; }
      while (this.nextBeat < context.currentTime + .1) { let accent = this.beat++ % 4 === 0;
        if (this.clock) {
          const clock = this.clock(); let position = clock.position + (this.nextBeat - context.currentTime) * bpm / 240;
          if (clock.loop && position >= clock.loop.begin) { const { begin, end } = clock.loop; position = begin + ((position - begin) % (end - begin) + end - begin) % (end - begin); accent = Math.abs(position - begin) < .01 || Math.abs(position - end) < .01; }
          else accent = Math.abs(position - Math.round(position)) < .01;
        }
        this.click(context, this.nextBeat, accent, this.loopVoices); this.nextBeat += 60 / bpm; }
    };
    schedule(); this.loop = setInterval(schedule, 25);
  }
  cancel() { this.finish?.(false); this.stopLoop(); this.leadEnd = undefined; }
  async wait(bpm: number): Promise<boolean> {
    if (!this.enabled) return true;
    if (this.finish) return false;
    this.stopLoop(); this.leadEnd = undefined;
    const context = this.context();
    let interval: ReturnType<typeof setInterval> | undefined;
    const voices = new Set<OscillatorNode>();
    return new Promise<boolean>((resolve, reject) => {
      const finish = (completed: boolean, error?: unknown) => {
        this.finish = undefined; clearInterval(interval);
        for (const voice of voices) { try { voice.stop(); } catch { /* already ended */ } }
        this.remaining = 0; this.changed();
        if (error) reject(error); else resolve(completed);
      };
      this.finish = finish; this.remaining = 4; this.changed();
      void context.resume().then(() => {
        if (this.finish !== finish) return;
        const duration = 60 / bpm, start = context.currentTime + .03;
        for (let beat = 0; beat < 4; beat++) this.click(context, start + beat * duration, beat === 0, voices);
        interval = setInterval(() => {
          const remaining = Math.max(0, 4 - Math.floor(Math.max(0, context.currentTime - start) / duration));
          if (!remaining) { this.leadEnd = start + 4 * duration; finish(true); return; }
          if (remaining !== this.remaining) { this.remaining = remaining; this.changed(); }
        }, 15);
      }).catch(error => { if (this.finish === finish) finish(false, error); });
    });
  }
}
