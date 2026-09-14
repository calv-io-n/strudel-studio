/** A cancellable four-beat lead-in. Clicks go to speakers, never the recording bus. */
export class CountIn {
  enabled = false;
  remaining = 0;
  private finish?: (completed: boolean) => void;
  constructor(private context: () => AudioContext, private changed: () => void) {}
  cancel() { this.finish?.(false); }
  async wait(bpm: number): Promise<boolean> {
    if (!this.enabled) return true;
    if (this.finish) return false;
    const context = this.context();
    let interval: ReturnType<typeof setInterval> | undefined;
    const voices: OscillatorNode[] = [];
    return new Promise<boolean>((resolve, reject) => {
      const finish = (completed: boolean) => {
        this.finish = undefined; clearInterval(interval);
        voices.forEach(voice => { try { voice.stop(); } catch { /* already ended */ } });
        this.remaining = 0; this.changed(); resolve(completed);
      };
      this.finish = finish;
      this.remaining = 4; this.changed();
      void context.resume().then(() => {
        if (this.finish !== finish) return;
        const duration = 60 / bpm, start = context.currentTime + .03;
        for (let beat = 0; beat < 4; beat++) {
          const voice = context.createOscillator(), gain = context.createGain(), at = start + beat * duration;
          voice.frequency.value = beat === 0 ? 1200 : 850;
          gain.gain.setValueAtTime(.08, at); gain.gain.exponentialRampToValueAtTime(.001, at + .045);
          voice.connect(gain).connect(context.destination); voice.start(at); voice.stop(at + .05);
          voice.onended = () => { voice.disconnect(); gain.disconnect(); }; voices.push(voice);
        }
        interval = setInterval(() => {
          const remaining = Math.max(0, 4 - Math.floor(Math.max(0, context.currentTime - start) / duration));
          if (!remaining) { this.finish?.(true); return; }
          if (remaining !== this.remaining) { this.remaining = remaining; this.changed(); }
        }, 15);
      }).catch(error => { this.finish?.(false); reject(error); });
    });
  }
}
