import * as audio from '@strudel/webaudio';
let nextAudioInstance = 0, nextPrivateOrbit = -1, nextVoice = 0;
type Handle = { node: AudioNode & { gain?: AudioParam }; stop?: (time: number) => void; nodes?: Record<string, AudioNode[]> };
type Voice = { token: string; key: string; owner: PerformanceAudio; handle?: Handle; cancelled: boolean; release: number; group: Group; timer?: ReturnType<typeof setTimeout>; durationTimer?: ReturnType<typeof setTimeout> };
type Group = { orbit: any; id: number; users: number; signature: string };
const budget = new Set<Voice>();
export function assertIsolated(values: Record<string, any>) {
  if (values.bus !== undefined || values.duckorbit !== undefined || values.source !== undefined) throw new Error('This sound uses shared audio routing and cannot be isolated. Choose the fallback synth.');
  for (const fx of values.FX ?? []) assertIsolated(fx);
}
/** Compatible effect returns are shared within an isolated input bus. */
export class PerformanceAudio {
  private voices = new Map<string, Voice>();
  private tokens = new Map<string, Voice>();
  private groups = new Map<string, Group>();
  private readonly soundName = `studio_live_voice_${nextAudioInstance++}`;
  private bus?: GainNode;
  private initialized = false;
  static get voiceCount() { return budget.size; }
  get output() {
    if (!this.bus) { this.bus = audio.getAudioContext().createGain(); this.bus!.connect(audio.getAudioContext().destination); }
    return this.bus!;
  }
  get time(): number { return audio.getAudioContext().currentTime; }
  private dispose(voice: Voice) {
    clearTimeout(voice.timer); clearTimeout(voice.durationTimer);
    voice.cancelled = true;
    if (this.voices.get(voice.key) === voice) this.voices.delete(voice.key);
    this.tokens.delete(voice.token); budget.delete(voice);
    try { voice.handle?.stop?.(this.time + .005); } catch { /* source already ended */ }
    voice.handle?.node.gain?.setTargetAtTime(0, this.time, .001);
    if (--voice.group.users === 0) {
      voice.group.orbit.disconnect(); this.groups.delete(voice.group.signature);
      const controller = audio.getSuperdoughAudioController();
      if (controller.nodes[voice.group.id] === voice.group.orbit) delete controller.nodes[voice.group.id];
    }
  }
  async play(key: string, values: Record<string, any>, pitch: number, velocity: number, duration?: number, at?: number) {
    this.release(key);
    assertIsolated(values);
    if (!this.initialized) {
      audio.registerSound(this.soundName, async (time: number, value: any, ended: () => AudioScheduledSourceNode | undefined, cps: number) => {
        const voice = this.tokens.get(value.studioVoice);
        if (!voice || voice.cancelled) return;
        const sound = audio.getSound(value.studioSound);
        if (!sound) throw new Error(`Sound ${value.studioSound} is unavailable. Choose the fallback synth.`);
        let gate: GainNode | undefined;
        const handle = await sound.onTrigger(time, { ...value, s: value.studioSound }, () => {
          gate?.disconnect();
          // Superdough returns its graph-cleanup clock, originally scheduled for
          // the maximum held-note duration. Releasing a live key must also release
          // that graph now, rather than accumulate silent processors for 15 minutes.
          const cleanup = ended(); cleanup?.stop?.(audio.getAudioContext().currentTime + .01);
        }, cps);
        if (voice.cancelled) { handle?.stop?.(audio.getAudioContext().currentTime); handle?.node?.disconnect(); return; }
        if (!handle) return;
        gate = audio.getAudioContext().createGain(); handle.node.connect(gate);
        voice.handle = { ...handle, node: gate }; return voice.handle;
      });
      this.initialized = true;
    }
    while (budget.size >= 64) {
      const oldest = [...budget].find(v => v.cancelled) ?? budget.values().next().value!;
      oldest.owner.dispose(oldest);
    }
    const context: AudioContext = audio.getAudioContext();
    // These are orbit-wide effects; per-note envelopes, filters and gain remain isolated.
    const signature = JSON.stringify(['room','rsize','rfade','rlp','rdim','ir','irspeed','irbegin','delay','delaytime','delayfeedback','djf'].map(k => values[k] ?? null));
    let group = this.groups.get(signature);
    if (!group) {
      const id = nextPrivateOrbit--, orbit = audio.getSuperdoughAudioController().getOrbit(id, [0, 1]);
      orbit.output.disconnect(); orbit.output.connect(this.output);
      group = { id, orbit, users: 0, signature }; this.groups.set(signature, group);
    }
    group.users++;
    const voice: Voice = { token: String(nextVoice++), key, owner: this, group, cancelled: false, release: Math.max(.02, Math.min(15, Number(values.release) || .04)) };
    this.voices.set(key, voice); this.tokens.set(voice.token, voice); budget.add(voice);
    try {
      const when = Math.max(context.currentTime, at ?? context.currentTime + .025);
      await audio.superdough({ ...values, s: this.soundName, studioSound: values.bank ? `${values.bank}_${values.s}` : values.s || 'triangle', bank: undefined,
        studioVoice: voice.token, note: pitch, velocity: velocity / 127, orbit: group.id }, when, duration ?? 900, .5);
      if (duration !== undefined && !voice.cancelled) voice.durationTimer = setTimeout(() => { if (this.voices.get(key) === voice) this.release(key); }, Math.max(0, when + duration - this.time) * 1000);
    } catch (error) { if (budget.has(voice)) this.dispose(voice); throw error; }
  }
  release(key: string) {
    const voice = this.voices.get(key); if (!voice) return;
    voice.cancelled = true; this.voices.delete(key); clearTimeout(voice.durationTimer);
    const now = this.time, gain = voice.handle?.node.gain;
    gain?.cancelScheduledValues(now); gain?.setTargetAtTime(0, now, voice.release / 5);
    try { voice.handle?.stop?.(now + voice.release); } catch { /* already released */ }
    voice.timer = setTimeout(() => { if (budget.has(voice)) this.dispose(voice); }, (voice.release + 3) * 1000);
  }
  stop() { for (const key of this.voices.keys()) this.release(key); }
  silence() { for (const voice of [...budget]) if (voice.owner === this) this.dispose(voice); if (this.bus) { this.bus.disconnect(); this.bus = undefined; } }
}
