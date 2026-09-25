import type { Clip } from './model';
import { anchorsWellFormed, trimClipStart } from './clip-timing';

export function canPlace(clips: Clip[], clip: Clip) {
  return (!clip.anchors || anchorsWellFormed(clip.anchors)) && Number.isFinite(clip.sourceOffset ?? 0) && (clip.sourceOffset ?? 0) >= 0 && (clip.sourceOffset ?? 0) <= 4096 && Number.isInteger(clip.start * 4) && clip.start >= 0 && clip.start <= 4096 && Number.isInteger(clip.length * 4) && clip.length >= .25 && clip.length <= 4096 && clip.start + clip.length <= 4096;
}

export function duplicatePlacement(clips: Clip[], original: Clip, id: string): Clip | undefined {
  const copy = { ...original, id, start: original.start + original.length, ...(original.anchors ? { anchors: original.anchors.map(a => ({ ...a })) } : {}) };
  for (const clip of clips.filter(c => c.trackId === copy.trackId).sort((a, b) => a.start - b.start)) {
    if (copy.start < clip.start + clip.length && clip.start < copy.start + copy.length) copy.start = clip.start + clip.length;
  }
  return canPlace(clips, copy) ? copy : undefined;
}

export function snapPlacement(clips: Clip[], clip: Clip, raw: number, grid: number, resize: boolean | 'left' = false, rate = 1, bpm?: number) {
  const candidate = (value: number): Clip => resize === 'left' ? trimLeft(clip, value, rate, bpm) : resize ? { ...clip, length: value - clip.start } : { ...clip, start: value };
  const edges = clips.filter(c => c.id !== clip.id).flatMap(c => [c.start, c.start + c.length]);
  const positions = edges.flatMap(edge => resize ? [edge] : [edge, edge - clip.length])
    .filter(value => Math.abs(value - raw) <= 8 / 64 && canPlace(clips, candidate(value)))
    .sort((a, b) => Math.abs(a - raw) - Math.abs(b - raw) || a - b);
  const value = positions[0] ?? Math.round(raw / grid) * grid;
  return { clip: candidate(value), guide: positions.length ? (resize ? value : edges.includes(value) ? value : value + clip.length) : undefined };
}

/** Audio clips move their anchors so the sound stays on its beat; pattern clips shift the cycle offset. */
export function trimLeft(clip: Clip, start: number, rate = 1, bpm?: number): Clip {
  if (clip.takeId && bpm) return trimClipStart(clip, start, bpm);
  return { ...clip, start, length: clip.start + clip.length - start, sourceOffset: (clip.sourceOffset ?? 0) + (start - clip.start) * rate };
}
