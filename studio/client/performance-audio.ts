import * as audio from '@strudel/webaudio';

type Handle = { node: AudioNode & { gain?: AudioParam }; stop?: (time: number) => void; nodes?: Record<string, AudioNode[]> };
export function assertIsolated(values: Record<string, any>) {
  if (values.bus !== undefined || values.duckorbit !== undefined || values.source !== undefined) throw new Error('This sound uses shared audio routing and cannot be isolated. Choose the fallback synth.');
  for (const fx of values.FX ?? []) assertIsolated(fx);
}
/** A private orbit per voice keeps captured effects separate from the arrangement. */
export class PerformanceAudio {
  private voices = new Map<string, { orbit: any; id: number; handle?: Handle; cancelled: boolean; release: number }>();
  private nextOrbit = -1;
  private bus?: GainNode;
  private initialized = false;
  get output() {
    if (!this.bus) {
      this.bus = audio.getAudioContext().createGain();
      this.bus!.connect(audio.getAudioContext().destination);
    }
    return this.bus!;
  }
  get time(): number { return audio.getAudioContext().currentTime; }
  async play(key: string, values: Record<string, any>, pitch: number, velocity: number, duration?: number) {
    this.release(key);
    if (!this.initialized) {
      audio.registerSound('studio_live_voice', async (time: number, value: any, ended: () => void, cps: number) => {
        const voice = this.voices.get(value.studioVoice);
        if (!voice || voice.cancelled) return;
        const sound = audio.getSound(value.studioSound);
        if (!sound) throw new Error(`Sound ${value.studioSound} is unavailable. Choose the fallback synth.`);
        let gate: GainNode | undefined;
        const handle = await sound.onTrigger(time, { ...value, s: value.studioSound }, () => { gate?.disconnect(); ended(); }, cps);
        if (voice.cancelled) { handle?.stop?.(audio.getAudioContext().currentTime); return; }
        if (!handle) return;
        gate = audio.getAudioContext().createGain(); handle.node.connect(gate);
        voice.handle = { ...handle, node: gate }; return voice.handle;
      });
      this.initialized = true;
    }
    assertIsolated(values);
    const context: AudioContext = audio.getAudioContext();
    const id = this.nextOrbit--;
    const controller = audio.getSuperdoughAudioController();
    const orbit = controller.getOrbit(id, [0, 1]);
    orbit.output.disconnect(); orbit.output.connect(this.output);
    const voice = { orbit, id, cancelled: false, release: Math.max(.02, Math.min(15, Number(values.release) || .04)) };
    this.voices.set(key, voice);
    try {
      await audio.superdough({ ...values, s: 'studio_live_voice', studioSound: values.bank ? `${values.bank}_${values.s}` : values.s || 'triangle', bank: undefined,
        studioVoice: key, note: pitch, velocity: velocity / 127, orbit: id }, context.currentTime + .025, duration ?? 900, .5);
      if (duration !== undefined) setTimeout(() => this.release(key), duration * 1000);
    } catch (error) { this.release(key); throw error; }
  }
  release(key: string) {
    const voice = this.voices.get(key); if (!voice) return;
    voice.cancelled = true; this.voices.delete(key);
    const now = this.time;
    const gain = voice.handle?.node.gain;
    gain?.cancelScheduledValues(now); gain?.setTargetAtTime(0, now, voice.release / 5);
    try { voice.handle?.stop?.(now + voice.release); } catch { /* already released */ }
    // Keep effect returns alive briefly after releasing the source.
    setTimeout(() => { voice.orbit.disconnect(); const controller = audio.getSuperdoughAudioController(); if (controller.nodes[voice.id] === voice.orbit) delete controller.nodes[voice.id]; }, 15000);
  }
  stop() { for (const key of this.voices.keys()) this.release(key); }
  silence() { this.stop(); if (this.bus) { this.bus.disconnect(); this.bus = undefined; } }
}
