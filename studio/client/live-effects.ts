import * as audio from '@strudel/webaudio';

export function effectBehavior(label: string) {
  return ['gain', 'lpf', 'cutoff'].includes(label) ? 'Live on sounding notes for simple gain / low-pass; modulated filters update on next notes' : ['room', 'delay', 'pan', 'hpf', 'resonance', 'lpq', 'attack', 'decay', 'release', 'sustain', 'speed'].includes(label) ? 'Updates next scheduled notes' : 'Live behavior is not verified; may require Apply changes';
}
export class LiveEffects {
  private params = new Map<string, Set<AudioParam>>();
  private installed = false;
  update(key: string, value: number) {
    const time = audio.getAudioContext().currentTime;
    for (const param of this.params.get(key) ?? []) {
      param.cancelAndHoldAtTime(time);
      param.setTargetAtTime(value, time, .015);
    }
  }
  wrap(values: any, controls: Record<string, string>) {
    if (!this.installed) {
      audio.registerSound('studio_controlled_voice', async (t: number, value: any, ended: () => void, cps: number) => {
        const sound = audio.getSound(value.studioOriginalSound);
        if (!sound) throw new Error(`Sound ${value.studioOriginalSound} is unavailable.`);
        const nodes: AudioNode[] = [];
        const registrations: [string, AudioParam][] = [];
        const cleanup = () => { for (const [key, param] of registrations) { this.params.get(key)?.delete(param); if (!this.params.get(key)?.size) this.params.delete(key); } nodes.forEach(n => n.disconnect()); ended(); };
        const handle = await sound.onTrigger(t, { ...value, s: value.studioOriginalSound }, cleanup, cps);
        if (!handle) return;
        let output: AudioNode = handle.node;
        const add = (node: AudioNode, param: AudioParam, name: string) => {
          output.connect(node); output = node; nodes.push(node);
          param.setValueAtTime(value.studioInitial[name], t);
          const key = value.studioLive[name]; const set = this.params.get(key) ?? new Set<AudioParam>();
          set.add(param); this.params.set(key, set); registrations.push([key, param]);
        };
        if (value.studioLive.gain) { const gain = audio.getAudioContext().createGain(); add(gain, gain.gain, 'gain'); }
        if (value.studioLive.cutoff) { const filter = audio.getAudioContext().createBiquadFilter(); filter.type = 'lowpass'; filter.Q.value = value.resonance ?? 1; add(filter, filter.frequency, 'cutoff'); }
        return { ...handle, node: output };
      });
      this.installed = true;
    }
    const live: Record<string, string> = {};
    if (controls.gain && typeof values.gain === 'number') live.gain = controls.gain;
    if (controls.cutoff && typeof values.cutoff === 'number' && !Object.keys(values).some(k => k.startsWith('lp') || ['ftype', 'drive'].includes(k))) live.cutoff = controls.cutoff;
    if (!Object.keys(live).length) return values;
    const result = { ...values, s: 'studio_controlled_voice', bank: undefined, studioOriginalSound: values.bank ? `${values.bank}_${values.s}` : values.s || 'triangle', studioLive: live, studioInitial: { gain: values.gain, cutoff: values.cutoff } };
    for (const name of Object.keys(live)) delete result[name];
    return result;
  }
}
