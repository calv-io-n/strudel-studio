import * as core from '@strudel/core';
import * as audio from '@strudel/webaudio';
import type { Asset, Clip, Project } from '../shared/model';
import type { Pattern } from '../shared/arrangement';
import { createInputEffects } from './input-effects';
import { compileAudioEffects } from '../shared/audio-input';
import { rationalTime } from '../shared/pattern-time';
function preciseSpan(begin: number, end: number) { return new core.TimeSpan(rationalTime(begin), rationalTime(end)); }
export function takeEffects(asset: Asset, project: Project) {
  if (asset.recording?.mode === 'wet') return 'AUDIO';
  return project.audioInput && project.audioInput.id === asset.recording?.inputId ? project.audioInput.appliedCode : asset.recording?.effectsCode ?? 'AUDIO';
}
export async function prepareTake(asset: Asset, project: Project, context: BaseAudioContext, blob: Blob) {
  const code = takeEffects(asset, project); compileAudioEffects(code);
  const buffer = await context.decodeAudioData(await blob.arrayBuffer()), name = `studio_take_${asset.id.replaceAll('-', '')}`;
  audio.registerSound(name, (time: number, value: any, onended: () => void) => {
    const source = context.createBufferSource(); source.buffer = buffer;
    const effects = createInputEffects(context, code), offset = Math.max(0, Number(value.studioTakeOffset) || 0);
    const duration = Math.min(buffer.duration - offset, Number(value.studioTakeDuration));
    if (duration <= 0) { effects.disconnect(); return; }
    source.connect(effects.input); source.start(time, offset, duration);
    // A silent scheduled node owns cleanup in both real-time and offline contexts.
    const clock = context.createConstantSource(), silent = context.createGain(); silent.gain.value = 0; clock.connect(silent).connect(context.destination);
    clock.start(time); clock.stop(time + duration + 3);
    clock.onended = () => { source.disconnect(); effects.disconnect(); silent.disconnect(); clock.disconnect(); onended(); };
    return { node: effects.output, stop: (at: number) => { try { source.stop(at); } catch { /* already ended */ } clock.stop(at + 3); } };
  }, { type: 'sample', tag: 'recorded-take' });
  return name;
}
export function takeTabClip(tabId: string, asset: Asset, cps: number): Clip {
  return { id: tabId, tabId, trackId: '', start: 0, length: (asset.duration ?? 0) * cps, takeId: asset.id, muted: false };
}
export function takePattern(clip: Clip, asset: Asset, cps: number, sourcePattern?: Pattern): Pattern {
  const sourceOffset = clip.sourceOffset ?? 0, lead = clip.takeLeadSeconds ?? 0, offset = clip.takeOffsetSeconds ?? 0;
  return new core.Pattern((state: any) => {
    const cycleOffset = state.controls?.studioCycleOffset ?? 0;
    const begin = Math.max(sourceOffset, lead * cps, -cycleOffset);
    const end = Math.min(sourceOffset + clip.length, (lead + Math.max(0, (asset.duration ?? 0) - offset)) * cps);
    const a = Math.max(begin, Number(state.span.begin)), b = Math.min(end, Number(state.span.end));
    const sound = `studio_${asset.id.replaceAll('-', '')}`;
    // A legacy take may now share its pattern with new MIDI/audio sections.
    const extras = sourcePattern?.query(state).filter((hap: any) => hap.value?.s !== sound) ?? [];
    if (a >= b) return extras;
    // Read the take's effects once at its onset. Its source expression must not
    // retrigger a long recording every cycle or replace clip timing and trims.
    const source = sourcePattern?.query(state.setSpan(preciseSpan(0, 1e-6))).find((hap: any) => hap.value?.s === sound);
    if (sourcePattern && !source) return extras;
    return [...extras, new core.Hap(preciseSpan(begin, end), preciseSpan(a, b), { gain: 1, attack: 0, release: 0, sustain: 1, ...source?.value, s: `studio_take_${asset.id.replaceAll('-', '')}`, studioTakeOffset: offset + Math.max(0, begin / cps - lead), studioTakeDuration: (end - begin) / cps }, source?.context)];
  });
}
