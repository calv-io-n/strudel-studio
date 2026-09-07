import type { Clip } from './model';

export function canPlace(clips: Clip[], clip: Clip) {
  return Number.isInteger(clip.start * 4) && clip.start >= 0 && clip.start <= 4096 && Number.isInteger(clip.length * 4) && clip.length >= .25 && clip.length <= 4096 &&
    !clips.some(other => other.id !== clip.id && other.trackId === clip.trackId && clip.start < other.start + other.length && other.start < clip.start + clip.length);
}

export function duplicatePlacement(clips: Clip[], original: Clip, id: string): Clip | undefined {
  const copy = { ...original, id, start: original.start + original.length };
  for (const clip of clips.filter(c => c.trackId === copy.trackId).sort((a, b) => a.start - b.start)) {
    if (copy.start < clip.start + clip.length && clip.start < copy.start + copy.length) copy.start = clip.start + clip.length;
  }
  return canPlace(clips, copy) ? copy : undefined;
}

export function snapPlacement(clips: Clip[], clip: Clip, raw: number, grid: number, resize = false) {
  const candidate = (value: number): Clip => resize ? { ...clip, length: value - clip.start } : { ...clip, start: value };
  const edges = clips.filter(c => c.id !== clip.id).flatMap(c => [c.start, c.start + c.length]);
  const positions = edges.flatMap(edge => resize ? [edge] : [edge, edge - clip.length])
    .filter(value => Math.abs(value - raw) <= 8 / 64 && canPlace(clips, candidate(value)))
    .sort((a, b) => Math.abs(a - raw) - Math.abs(b - raw) || a - b);
  const value = positions[0] ?? Math.round(raw / grid) * grid;
  return { clip: candidate(value), guide: positions.length ? (resize ? value : edges.includes(value) ? value : value + clip.length) : undefined };
}
