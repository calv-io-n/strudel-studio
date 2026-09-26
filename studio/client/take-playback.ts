import {takeBuffer} from './take-buffers';
import * as core from '@strudel/core';
import * as audio from '@strudel/webaudio';
import type { Asset, Clip, Project } from '../shared/model';
import type { Pattern } from '../shared/arrangement';
import { createInputEffects } from './input-effects';
import { compileAudioEffects } from '../shared/audio-input';
import { rationalTime } from '../shared/pattern-time';
import { clipAnchors, isStretched, renderKey, takeWindow } from '../shared/clip-timing';
function preciseSpan(begin: number, end: number) { return new core.TimeSpan(rationalTime(begin), rationalTime(end)); }
export function takeEffects(asset: Asset, project: Project) {
  if (asset.recording?.mode === 'wet') return 'AUDIO';
  return project.audioInput && project.audioInput.id === asset.recording?.inputId ? project.audioInput.appliedCode : asset.recording?.effectsCode ?? 'AUDIO';
}
const registeredTakes=new Set<string>();
/** Drop registered take sounds except the ones a compile just prepared; a seek reuses the compiled pattern, so stop() must not release them. */
export function releaseTakeSounds(keep: Iterable<string> = []) { const kept = new Set(keep); for (const name of registeredTakes) if (!kept.has(name)) { audio.soundMap.setKey(name, undefined); registeredTakes.delete(name); } }
function shortHash(text: string) { let h = 0x811c9dc5; for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(16).padStart(8, '0'); }
export function takeSoundName(id: string, variant = 'raw') { return `studio_take_${id.replaceAll('-', '')}_${variant === 'raw' ? 'raw' : shortHash(variant)}`; }
/** Register one playable variant of a take: raw audio, or audio rendered for the clip's anchors at the project tempo. Returns the sound name. */
export async function prepareTake(asset: Asset, project: Project, context: BaseAudioContext, blob: Blob, clip?: Clip, signal?: AbortSignal) {
  const code = takeEffects(asset, project); compileAudioEffects(code);
  const anchors = clipAnchors(clip ?? {}), bpm = project.bpm, variant = renderKey(anchors, bpm), stretched = isStretched(anchors, bpm);
  const rendered = await takeBuffer(context, asset, blob, anchors, bpm, signal), name = takeSoundName(asset.id, variant);
  // A rendered buffer covers the first to the last anchor; the rest of the sample plays from the raw buffer.
  const raw = stretched ? await takeBuffer(context, asset, blob, [{ source: 0, beat: 0 }], bpm, signal) : rendered;
  const last = anchors[anchors.length - 1], renderedSeconds = stretched ? (last.beat - anchors[0].beat) * 60 / bpm : 0;
  registeredTakes.add(name);
  audio.registerSound(name, (time: number, value: any, onended: () => void) => {
    // Plain sample clips get their effects from the source pattern downstream.
    // Avoid allocating a second, inaudible delay/convolution chain per onset.
    const dry = code.trim() === 'AUDIO' ? context.createGain() : undefined;
    const effects = dry ? { input: dry, output: dry, disconnect: () => dry.disconnect() } : createInputEffects(context, code);
    const offset = Math.max(0, Number(value.studioTakeOffset) || 0), wanted = Number(value.studioTakeDuration);
    const parts: { buffer: AudioBuffer; offset: number; duration: number; at: number }[] = [];
    if (!stretched) parts.push({ buffer: raw, offset, duration: Math.min(raw.duration - offset, wanted), at: 0 });
    else {
      const first = Math.max(0, Math.min(wanted, renderedSeconds - offset));
      if (first > 0) parts.push({ buffer: rendered, offset, duration: first, at: 0 });
      const from = last.source + Math.max(0, offset - renderedSeconds);
      if (wanted - first > 0) parts.push({ buffer: raw, offset: from, duration: Math.min(raw.duration - from, wanted - first), at: first });
    }
    const playable = parts.filter(p => p.duration > 0);
    if (!playable.length) { effects.disconnect(); return; }
    const sources: AudioBufferSourceNode[] = []; let duration = 0; const ramp = .003;
    for (const part of playable) {
      const source = context.createBufferSource(), gain = context.createGain(); source.buffer = part.buffer;
      // Crossfade the join between rendered and raw audio to avoid a click.
      if (part.at > 0) { gain.gain.setValueAtTime(0, time + part.at); gain.gain.linearRampToValueAtTime(1, time + part.at + ramp); }
      if (stretched && part.buffer === rendered && playable.length > 1) { gain.gain.setValueAtTime(1, time + part.duration - ramp); gain.gain.linearRampToValueAtTime(0, time + part.duration); }
      source.connect(gain).connect(effects.input); source.start(time + part.at, part.offset, part.duration + (part.at > 0 ? 0 : (stretched && playable.length > 1 ? ramp : 0)));
      sources.push(source); duration = Math.max(duration, part.at + part.duration);
    }
    // A silent scheduled node owns cleanup in both real-time and offline contexts.
    const clock = context.createConstantSource(), silent = context.createGain(); silent.gain.value = 0; clock.connect(silent).connect(context.destination);
    clock.start(time); clock.stop(time + duration + 3);
    clock.onended = () => { for (const source of sources) source.disconnect(); effects.disconnect(); silent.disconnect(); clock.disconnect(); onended(); };
    return { node: effects.output, stop: (at: number) => { for (const source of sources) { try { source.stop(at); } catch { /* already ended */ } } clock.stop(at + 3); } };
  }, { type: 'sample', tag: 'recorded-take' });
  return name;
}
export function takeTabClip(tabId: string, asset: Asset, cps: number): Clip {
  return { id: tabId, tabId, trackId: '', start: 0, length: (asset.duration ?? 0) * cps, takeId: asset.id, muted: false };
}
/** One hap per clip window; timing comes from the clip's anchors, effects from the tab's own onset. */
export function takePattern(clip: Clip, asset: Asset, bpm: number, soundName: string, sourcePattern?: Pattern): Pattern {
  return new core.Pattern((state: any) => {
    const window = takeWindow(clip, asset.duration ?? 0, bpm, state.controls?.studioCycleOffset ?? 0);
    const sound = `studio_${asset.id.replaceAll('-', '')}`;
    // A legacy take may now share its pattern with new MIDI/audio sections.
    const extras = sourcePattern?.query(state).filter((hap: any) => hap.value?.s !== sound) ?? [];
    if (!window) return extras;
    const a = Math.max(window.begin, Number(state.span.begin)), b = Math.min(window.end, Number(state.span.end));
    if (a >= b) return extras;
    // Read the take's effects once at its onset. Its source expression must not
    // retrigger a long recording every cycle or replace clip timing and trims.
    const source = sourcePattern?.query(state.setSpan(preciseSpan(0, 1e-6))).find((hap: any) => hap.value?.s === sound);
    if (sourcePattern && !source) return extras;
    return [...extras, new core.Hap(preciseSpan(window.begin, window.end), preciseSpan(a, b), { gain: 1, attack: 0, release: 0, sustain: 1, ...source?.value, s: soundName, studioTakeOffset: window.offset, studioTakeDuration: window.seconds }, source?.context)];
  });
}
