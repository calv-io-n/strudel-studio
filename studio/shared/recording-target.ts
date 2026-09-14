import { parse } from 'acorn';
import type { Project, Asset } from './model';
export type RecordingTarget = { context: 'tab' | 'composition'; tabId: string; trackId?: string; clipId?: string; position: number; offset: number; end?: number };
/** Resolve once when Record starts. Navigation never changes an active take. */
export function recordingTarget(project: Project, context: 'tab' | 'composition', trackId: string | undefined, clipId: string | undefined, position: number): RecordingTarget {
  if (context === 'tab') {
    if (!project.tabs.some(t => t.id === project.activeTabId)) throw new Error('Open a pattern before recording.');
    return { context, tabId: project.activeTabId, position: 0, offset: 0 };
  }
  const selected = project.clips.find(c => c.id === clipId && (!trackId || c.trackId === trackId));
  const candidates = project.clips.filter(c => c.trackId === trackId && c.start <= position && c.start + c.length > position);
  const clip = selected ?? (candidates.length === 1 ? candidates[0] : undefined);
  if (!clip) throw new Error('Select a pattern placement on the recording track.');
  const at = position >= clip.start && position < clip.start + clip.length ? position : clip.start;
  return { context, tabId: clip.tabId, trackId: clip.trackId, clipId: clip.id, position: at, offset: (clip.sourceOffset ?? 0) + at - clip.start, end: clip.start + clip.length };
}
export function validateRecordingTarget(project: Project, target: RecordingTarget) {
  const tab = project.tabs.find(t => t.id === target.tabId);
  if (!tab) throw new Error('The recording pattern is missing. Your take is retained.');
  if (target.clipId && !project.clips.some(c => c.id === target.clipId && c.tabId === target.tabId && c.trackId === target.trackId)) throw new Error('The recording placement changed. Your take is retained.');
  return tab;
}
export function recordedSection(asset: Asset, offset = 0, rate = 1) {
  const r = asset.recording!;
  const delay = Math.max(0, offset - (r.latencySeconds ?? 0) * r.bpm / 240);
  const period = Math.max(.25, Math.ceil((delay + (asset.duration ?? 0) * r.bpm / 240) * 4) / 4);
  const number = (n: number) => Number(n.toFixed(6));
  const effects = r.mode === 'dry' ? (r.effectsCode ?? 'AUDIO').replace(/^\s*AUDIO/, '').replace(/slider\(\s*([-+\d.e]+)[^)]*\)/g, '$1').trim() : '.gain(1)';
  return `\n// Recorded audio\n$: s("studio_${asset.id.replaceAll('-', '')}")${effects}.slow(${number(period * rate)}).late(${number(delay * rate)})\n`;
}

/** Adding labeled sections must retain the previous implicit final pattern. */
export function retainPatternOutput(code: string) {
  const ast = parse(code, { ecmaVersion: 2022 }) as any;
  if (ast.body.some((s: any) => s.type === 'LabeledStatement' && s.label.name.startsWith('$'))) return code;
  const last = ast.body.at(-1);
  if (last?.type !== 'ExpressionStatement') return code;
  return code.slice(0, last.start) + '$: ' + code.slice(last.start);
}
